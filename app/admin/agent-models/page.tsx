import { controlRoomAdminAccess } from "@/Panda-agent/src/control-room/clerk";
import { AgentModels } from "./agent-models";
import styles from "./agent-models.module.css";

export default async function AgentModelsPage() {
  const access = await controlRoomAdminAccess();
  if (!access.allowed) return <div className={styles.screen}><h1>{access.status === 401 ? "Sign in required" : access.status === 403 ? "Access denied" : "Models is unavailable"}</h1><p>{access.status === 503 ? "Please try again later." : "An active administrator account is required."}</p></div>;
  return <AgentModels />;
}
