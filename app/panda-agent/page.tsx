import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { PandaAgentWorkspace } from "@/Panda-agent/src/ui/workspace";

export default async function PandaAgentPage() {
  const { isAuthenticated, sessionStatus, userId } = await auth();
  if (!isAuthenticated || sessionStatus !== "active" || !userId) {
    redirect("/sign-in?redirect_url=%2Fpanda-agent");
  }
  return <PandaAgentWorkspace />;
}
