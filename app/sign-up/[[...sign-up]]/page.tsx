import { SignUp } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AuthEntryPage } from "@/components/auth/auth-entry";
import { authCompletionHref } from "@/lib/auth/completion";
import { authEntryHref, hasAlternateRedirectParam } from "@/lib/auth/return-path";
import { safePublishedAuthReturnPath } from "@/lib/auth/published-return-path";
import { foundationPages } from "@/lib/site-navigation";

type SignUpPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SignUpPage({ searchParams }: SignUpPageProps) {
  const params = await searchParams;
  const { redirect_url: redirectUrl } = params;
  const returnPath = redirectUrl === undefined ? "/" : await safePublishedAuthReturnPath(redirectUrl);

  if (returnPath === null || hasAlternateRedirectParam(params)) redirect("/sign-up?redirect_url=%2F");
  const { isAuthenticated, sessionStatus, userId } = await auth();
  if (isAuthenticated && sessionStatus === "active" && userId) redirect(returnPath);

  const returnPathname = returnPath.split(/[?#]/, 1)[0];
  const completionUrl = authCompletionHref(returnPath);
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <AuthEntryPage mode="sign-up" nonce={nonce} returnPath={returnPath}>
      <SignUp
        forceRedirectUrl={completionUrl}
        signInForceRedirectUrl={completionUrl}
        signInUrl={authEntryHref("sign-in", returnPath, [...Object.keys(foundationPages), returnPathname])}
      />
    </AuthEntryPage>
  );
}
