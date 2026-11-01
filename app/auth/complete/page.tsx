import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { AuthComplete } from "@/components/auth/auth-complete";
import { safePublishedAuthReturnPath } from "@/lib/auth/published-return-path";

export default async function AuthCompletePage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const returnPath = params.return_to === undefined ? "/" : await safePublishedAuthReturnPath(params.return_to);
  if (returnPath === null) redirect("/");

  const { isAuthenticated, sessionStatus, userId, sessionId } = await auth();
  if (!isAuthenticated || sessionStatus !== "active" || !userId || !sessionId) {
    redirect(`/sign-in?redirect_url=${encodeURIComponent(returnPath)}`);
  }
  return <AuthComplete returnPath={returnPath} sessionId={sessionId} userId={userId} />;
}
