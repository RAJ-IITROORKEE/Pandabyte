import { controlRoomAdminAccess } from "@/Panda-agent/src/control-room/clerk";
import { AgentSkills } from "./agent-skills";
import styles from "./agent-skills.module.css";

export default async function AgentSkillsPage() {
  const access = await controlRoomAdminAccess();
  if (!access.allowed) return <div className={styles.screen}><h1>{access.status === 401 ? "Sign in required" : access.status === 403 ? "Access denied" : "Agent Skills is unavailable"}</h1><p>{access.status === 503 ? "Please try again later." : "An active administrator account is required."}</p></div>;
  return <AgentSkills />;
}
