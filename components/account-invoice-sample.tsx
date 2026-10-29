"use client";

import Image from "next/image";
import Link from "next/link";
import styles from "./account-invoice-sample.module.css";

const items = [
  { name: "Example development board", description: "Illustrative variant", sku: "EXAMPLE-BOARD", quantity: 2, unit: "₹500.00", total: "₹1,000.00" },
  { name: "Example sensor module", description: "Illustrative variant", sku: "EXAMPLE-SENSOR", quantity: 1, unit: "₹250.00", total: "₹250.00" },
];

export function AccountInvoiceSample() {
  return <div className={styles.preview}>
    <div className={styles.toolbar}>
      <Link href="/account/billing">← Back to billing</Link>
      <button type="button" onClick={() => window.print()}>Print sample</button>
    </div>
    <p className={styles.notice}>Illustrative preview only. Merchant legal details and tax configuration are missing; real issuance is not enabled.</p>
    <article className={styles.document} aria-labelledby="sample-title">
      <header className={styles.header}>
        <div className={styles.brand}><Image src="/brand/pandabyte-logo.png" width={52} height={52} alt="" /><strong>PandaByte.in</strong></div>
        <div><h1 id="sample-title">Invoice preview</h1><p className={styles.sample}>SAMPLE — NOT A TAX INVOICE</p></div>
      </header>
      <div className={styles.details}>
        <section><h2>Merchant</h2><p>Legal and contact details: not configured</p></section>
        <section><h2>Document</h2><p>Number: Sample only<br />Issue date: Example only<br />Order reference: Example only</p></section>
        <section><h2>Bill to</h2><p>Example Customer<br />Example Street<br />Example City, India</p></section>
        <section><h2>Ship to</h2><p>Example Customer<br />Example Street<br />Example City, India</p></section>
      </div>
      <div className={styles.tableWrap}>
        <table><caption>Illustrative items and amounts</caption><thead><tr><th scope="col">#</th><th scope="col">Product / SKU</th><th scope="col">Qty</th><th scope="col">Unit price</th><th scope="col">Line total</th></tr></thead>
          <tbody>{items.map((item, index) => <tr key={item.sku}><td>{index + 1}</td><td><strong>{item.name}</strong><br />{item.description}<br /><span>{item.sku}</span></td><td>{item.quantity}</td><td>{item.unit}</td><td>{item.total}</td></tr>)}</tbody>
        </table>
      </div>
      <div className={styles.totals}><dl><div><dt>Subtotal</dt><dd>₹1,250.00</dd></div><div><dt>Discount</dt><dd>Not supplied</dd></div><div><dt>Shipping</dt><dd>Not supplied</dd></div><div><dt>Tax</dt><dd>Not configured</dd></div><div className={styles.total}><dt>Grand total</dt><dd>Unavailable</dd></div></dl></div>
      <footer className={styles.footer}><p>Sample amounts are fictional. Tax, shipping and discounts are not included in the subtotal.</p><p>Support details and merchant notes: not configured.</p><strong>SAMPLE — NOT A TAX INVOICE</strong></footer>
    </article>
  </div>;
}
