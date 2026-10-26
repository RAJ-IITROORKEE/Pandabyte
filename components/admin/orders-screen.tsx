import Link from "next/link";
import styles from "./admin-ui.module.css";
import ordersStyles from "./orders-screen.module.css";

export function AdminOrdersScreen() {
  return (
    <section className={styles.screen} aria-labelledby="orders-title">
      <header className={styles.pageHeading}>
        <div>
          <p className={styles.eyebrow}>Operations</p>
          <h1 id="orders-title">Orders</h1>
          <p className={styles.lede}>Order operations are not connected in this build.</p>
        </div>
        <span className={styles.statusPill}>Not connected</span>
      </header>

      <section className={styles.panel} aria-labelledby="orders-records-title">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>Operations queue</p>
            <h2 id="orders-records-title">Order records</h2>
            <p>No private order data is available in this build.</p>
          </div>
          <span className={styles.statusPill}>Unconnected</span>
        </div>

        <p id="orders-controls-status" className={styles.fieldHint}>
          Unavailable: this application has no authorized order-list API or query contract, so these controls cannot
          search or change records.
        </p>
        <div className={styles.toolbar} role="group" aria-label="Unavailable order list controls">
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Search orders</span>
            <input className={styles.input} type="search" disabled placeholder="Unavailable" aria-describedby="orders-controls-status" />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Status filter</span>
            <select className={styles.input} disabled aria-describedby="orders-controls-status" defaultValue="">
              <option value="">Unavailable</option>
            </select>
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Sort by</span>
            <select className={styles.input} disabled aria-describedby="orders-controls-status" defaultValue="">
              <option value="">Unavailable</option>
            </select>
          </label>
        </div>

        <div className={styles.tableFrame} role="region" tabIndex={0} aria-label="Order records table; no connected data">
          <table className={styles.table}>
            <caption className={styles.visuallyHidden}>Order records with no connected data</caption>
            <thead>
              <tr>
                <th scope="col">Order reference</th>
                <th scope="col">Payment</th>
                <th scope="col">Fulfillment</th>
                <th scope="col">Updated</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className={styles.tableMessage} colSpan={4}>
                  <strong>No private order records are connected.</strong>
                  <br />
                  No order count, payment state, or fulfillment activity is reported.
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className={ordersStyles.pagination} role="group" aria-label="Unavailable order pagination">
          <span>Pagination is unavailable until a server-backed order list is connected.</span>
          <div>
            <button className={styles.secondaryButton} type="button" disabled>Previous page</button>
            <label className={ordersStyles.pageSize}>
              <span className={styles.fieldLabel}>Rows per page</span>
              <select className={styles.input} disabled aria-describedby="orders-controls-status" defaultValue="">
                <option value="">Unavailable</option>
              </select>
            </label>
            <button className={styles.secondaryButton} type="button" disabled>Next page</button>
          </div>
        </div>

        <p className={styles.fieldHint}>No order, payment, refund, or fulfillment actions are available here.</p>
        <Link className={styles.secondaryButton} href="/admin/inventory">Open inventory</Link>
      </section>
    </section>
  );
}
