"use client";

import Link from "next/link";
import { BillingProfileForm } from "@/components/billing-profile-form";
import { AccountAddresses } from "@/components/account-addresses";
import styles from "@/components/account-dashboard.module.css";

export function AccountBilling() {
  return <div>
    <header className={styles.overview}>
      <h1>Billing &amp; invoices</h1>
      <p>Manage your billing address for future checkouts. Existing orders keep their original billing details.</p>
    </header>
    <BillingProfileForm />
    <AccountAddresses />
    <section className={styles.panel} aria-labelledby="billing-documents-heading">
      <h2 id="billing-documents-heading">Invoices and receipts</h2>
      <p>Issued documents are not available in your account yet.</p>
      <p>For a printable summary of an existing order, visit <Link href="/account/orders">My Orders</Link>. Order summaries are not tax invoices.</p>
      <p><Link href="/account/invoice-sample">Preview a sample invoice</Link></p>
    </section>
  </div>;
}
