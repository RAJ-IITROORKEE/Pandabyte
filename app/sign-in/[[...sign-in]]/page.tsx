import { SignIn } from "@clerk/nextjs";
import { redirect } from "next/navigation";

type SignInPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const { redirect_url: redirectUrl } = await searchParams;

  if (redirectUrl !== undefined && redirectUrl !== "/account") {
    redirect("/sign-in?redirect_url=%2Faccount");
  }

  return (
    <main className="auth-page">
      <SignIn fallbackRedirectUrl="/account" signUpUrl="/sign-up" />
    </main>
  );
}
