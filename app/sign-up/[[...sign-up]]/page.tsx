import { SignUp } from "@clerk/nextjs";
import { redirect } from "next/navigation";
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
  const returnPathname = returnPath.split(/[?#]/, 1)[0];

  return (
    <main id="main" className="auth-page" tabIndex={-1}>
      <SignUp
        fallbackRedirectUrl="/"
        signInUrl={authEntryHref("sign-in", returnPath, [...Object.keys(foundationPages), returnPathname])}
      />
    </main>
  );
}
