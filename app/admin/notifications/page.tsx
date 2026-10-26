import { IconBell } from "@tabler/icons-react";
import styles from "@/components/admin/admin-ui.module.css";

export default function AdminNotificationsPage() {
  return <div className={styles.screen}>
    <div className={styles.pageHeading}><div><h1>Notifications</h1><p className={styles.lede}>Workspace updates and activity.</p></div><span className={styles.statusPill}>Coming soon</span></div>
    <section className={styles.panel} aria-labelledby="notification-empty-heading"><IconBell aria-hidden="true" size={24} /><h2 id="notification-empty-heading">Notifications are not connected</h2><p className={styles.fieldHint}>This is a design preview. Notification history and delivery controls will appear here when implemented.</p></section>
  </div>;
}
