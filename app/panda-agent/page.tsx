import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { PandaAgentWorkspace } from "@/Panda-agent/src/ui/workspace";
import {guideAdminAccess} from '@/Panda-agent/src/server/guide-admin';

export default async function PandaAgentPage() {
  const { isAuthenticated, sessionStatus, userId } = await auth();
  if (!isAuthenticated || sessionStatus !== "active" || !userId) {
    redirect("/sign-in?redirect_url=%2Fpanda-agent");
  }
  const admin=await guideAdminAccess();
  return <PandaAgentWorkspace previewReadOnly={process.env.PANDA_AGENT_LIGHTWEIGHT_ENABLED !== "true"} guidesEnabled={process.env.PANDA_AGENT_GUIDES_ENABLED === "true"} canManageSkills={admin.allowed} />;
}
