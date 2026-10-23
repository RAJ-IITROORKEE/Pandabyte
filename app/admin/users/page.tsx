"use client";

import { useAdminCapabilities } from "@/components/admin/admin-shell";
import styles from "@/components/admin/admin-ui.module.css";

const capabilities = ["catalog.edit", "content.edit", "content.publish", "orders.manage", "media.manage", "inquiries.manage", "staff.manage"];

export default function AdminUsersPage() {
  const current = useAdminCapabilities();
  return <div className={styles.screen}>
    <div className={styles.pageHeading}><div><p className={styles.eyebrow}>Access control</p><h1>Users &amp; roles</h1><p className={styles.lede}>Staff grants are limited to verified project operators. The admin workspace does not add or edit grants.</p></div></div>
    <section className={styles.panel}><div className={styles.sectionHeading}><div><h2>Your current access</h2><p>These capabilities were read from your staff grants for this session.</p></div></div>
      {current.length ? <ul className={styles.capabilityList}>{capabilities.map((capability) => <li key={capability}><span>{capability}</span><strong>{current.includes(capability) ? "Granted" : "Not granted"}</strong></li>)}</ul> : <p className={styles.fieldHint}>No staff capabilities are available.</p>}
      <p className={styles.fieldHint}>A future owner-approved operator workflow is required before staff memberships can be managed here.</p>
    </section>
  </div>;
}
