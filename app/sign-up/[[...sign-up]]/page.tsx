import { SignUp } from "@clerk/nextjs";
import { redirect } from "next/navigation";

type SignUpPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SignUpPage({ searchParams }: SignUpPageProps) {
  const { redirect_url: redirectUrl } = await searchParams;

  if (redirectUrl !== undefined && redirectUrl !== "/account") {
    redirect("/sign-up?redirect_url=%2Faccount");
  }

  return (
    <main className="auth-page">
      <SignUp fallbackRedirectUrl="/account" signInUrl="/sign-in" />
    </main>
  );
}
