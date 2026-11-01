import { SignIn } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AuthEntryPage } from "@/components/auth/auth-entry";
import { authCompletionHref } from "@/lib/auth/completion";
import { authEntryHref, hasAlternateRedirectParam } from "@/lib/auth/return-path";
import { safePublishedAuthReturnPath } from "@/lib/auth/published-return-path";
import { foundationPages } from "@/lib/site-navigation";

type SignInPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const params = await searchParams;
  const { redirect_url: redirectUrl } = params;
  const returnPath = redirectUrl === undefined ? "/" : await safePublishedAuthReturnPath(redirectUrl);

  if (returnPath === null || hasAlternateRedirectParam(params)) redirect("/sign-in?redirect_url=%2F");
  const { isAuthenticated, sessionStatus, userId } = await auth();
  if (isAuthenticated && sessionStatus === "active" && userId) redirect(returnPath);

  const returnPathname = returnPath.split(/[?#]/, 1)[0];
  const completionUrl = authCompletionHref(returnPath);
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <AuthEntryPage mode="sign-in" nonce={nonce} returnPath={returnPath}>
      <SignIn
        withSignUp
        transferable
        forceRedirectUrl={completionUrl}
        signUpForceRedirectUrl={completionUrl}
        signUpUrl={authEntryHref("sign-up", returnPath, [...Object.keys(foundationPages), returnPathname])}
      />
    </AuthEntryPage>
  );
}
