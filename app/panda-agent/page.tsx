import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { PandaAgentWorkspace } from "@/Panda-agent/src/ui/workspace";
import {guideAdminAccess} from '@/Panda-agent/src/server/guide-admin';
import {researchWebSearchEnabled} from '@/Panda-agent/src/server/direct-assistant-runtime';

export default async function PandaAgentPage() {
  const { isAuthenticated, sessionStatus, userId } = await auth();
  if (!isAuthenticated || sessionStatus !== "active" || !userId) {
    redirect("/sign-in?redirect_url=%2Fpanda-agent");
  }
  const admin=await guideAdminAccess();
  const directAssistant = process.env.PANDA_AGENT_DIRECT_ASSISTANT_ENABLED === "true";
  return <PandaAgentWorkspace directAssistant={directAssistant} nativeTools={!directAssistant && process.env.PANDA_AGENT_NATIVE_TOOLS === "true"} nativeAssistant={!directAssistant && process.env.PANDA_AGENT_ASSISTANT_NEW_MESSAGES === "true"} previewReadOnly={process.env.PANDA_AGENT_LIGHTWEIGHT_ENABLED !== "true"} guidesEnabled={!directAssistant && process.env.PANDA_AGENT_GUIDES_ENABLED === "true"} diagnosticsEnabled={!directAssistant && process.env.PANDA_AGENT_DIAGNOSTICS_ENABLED === "true"} agenticEnabled={!directAssistant && process.env.PANDA_AGENT_AGENTIC_ENABLED === "true"} canManageSkills={admin.allowed} webSearchAvailable={directAssistant && admin.allowed && researchWebSearchEnabled()} agentLoop={directAssistant && admin.allowed && process.env.PANDA_AGENT_LOOP_ENABLED === "true"} />;
}
