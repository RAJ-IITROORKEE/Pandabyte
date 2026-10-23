import { SignIn } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import { authEntryHref, hasAlternateRedirectParam, safeAuthReturnPath } from "@/lib/auth/return-path";
import { foundationPages } from "@/lib/site-navigation";

type SignInPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const params = await searchParams;
  const { redirect_url: redirectUrl } = params;
  const returnPath = redirectUrl === undefined ? "/" : safeAuthReturnPath(redirectUrl, Object.keys(foundationPages));

  if (returnPath === null || hasAlternateRedirectParam(params)) redirect("/sign-in?redirect_url=%2F");

  return (
    <main id="main" className="auth-page" tabIndex={-1}>
      <SignIn
        fallbackRedirectUrl="/"
        signUpUrl={authEntryHref("sign-up", returnPath, Object.keys(foundationPages))}
      />
    </main>
  );
}
