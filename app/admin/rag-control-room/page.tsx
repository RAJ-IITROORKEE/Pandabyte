import { controlRoomAdminAccess } from "@/Panda-agent/src/control-room/clerk";
import { ControlRoom } from "./control-room";
import styles from "./rag-control-room.module.css";

export default async function RagControlRoomPage() {
  const access = await controlRoomAdminAccess();
  if (!access.allowed) return <div className={styles.screen}><h1>{access.status === 401 ? "Sign in required" : access.status === 403 ? "Access denied" : "Control Room is unavailable"}</h1><p>{access.status === 503 ? "Please try again later." : "An active administrator account is required."}</p></div>;
  return <ControlRoom />;
}
