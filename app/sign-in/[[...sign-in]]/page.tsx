import { SignIn } from "@clerk/nextjs";
import { redirect } from "next/navigation";

type SignInPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const { redirect_url: redirectUrl } = await searchParams;

  if (redirectUrl !== undefined && redirectUrl !== "/account" && redirectUrl !== "/staff") {
    redirect("/sign-in?redirect_url=%2Faccount");
  }

  return (
    <main id="main" className="auth-page" tabIndex={-1}>
      <SignIn fallbackRedirectUrl={redirectUrl ?? "/account"} signUpUrl="/sign-up" />
    </main>
  );
}
