"use client";

import * as Dialog from "@radix-ui/react-dialog";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ShoppingCart, X } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useUser } from "@clerk/nextjs";
import { clearCustomerCart, getCustomerCartServerSnapshot, getCustomerCartSnapshot, prepareCustomerCart, subscribeCustomerCart } from "./customer-cart-store";
import { getGuestCartServerSnapshot, getGuestCartSnapshot, subscribeGuestCart } from "./guest-cart-store";
import styles from "./cart-drawer.module.css";

const CartScreen = dynamic(() => import("./cart-screen").then((module) => module.CartScreen), {
  loading: () => <p role="status">Loading your cart…</p>,
});

export function CartDrawer({ onOpen, onCartPage = false }: { onOpen?: () => void; onCartPage?: boolean }) {
  const { user, isLoaded } = useUser();
  const guest = useSyncExternalStore(subscribeGuestCart, getGuestCartSnapshot, getGuestCartServerSnapshot);
  const customer = useSyncExternalStore(subscribeCustomerCart, getCustomerCartSnapshot, getCustomerCartServerSnapshot);
  useEffect(() => {
    if (!isLoaded) return;
    if (user) prepareCustomerCart(user.id);
    else clearCustomerCart();
  }, [isLoaded, user]);
  const items = !isLoaded ? [] : user ? (customer.userId === user.id ? customer.cart?.items ?? [] : []) : guest.items;
  const count = items.reduce((sum, item) => sum + item.quantity, 0);
  const label = count ? `Cart, ${count} ${count === 1 ? "item" : "items"}` : "Cart";
  const icon = <><ShoppingCart aria-hidden="true" />{count > 0 && <span className={styles.badge} aria-hidden="true">{count}</span>}</>;
  const [open, setOpen] = useState(false);
  if (onCartPage) return <Link className={`pb-icon-button ${styles.trigger}`} href="/cart" aria-label={label} onClick={onOpen}>{icon}</Link>;
  return <Dialog.Root open={open} onOpenChange={(next) => {
    setOpen(next);
    if (next) onOpen?.();
  }}>
    <Dialog.Trigger className={`pb-icon-button ${styles.trigger}`} aria-label={label}>{icon}</Dialog.Trigger>
    <Dialog.Portal>
      <Dialog.Overlay className={styles.overlay} />
      <Dialog.Content className={styles.drawer}>
        <div className={styles.heading}>
          <div><Dialog.Title className={styles.title}>Cart</Dialog.Title><Dialog.Description className={styles.description}>Review items and their current catalog prices.</Dialog.Description></div>
          <Dialog.Close className={styles.close} aria-label="Close cart"><X aria-hidden="true" /></Dialog.Close>
        </div>
        <div className={styles.body} onClickCapture={(event) => {
          if ((event.target as HTMLElement).closest("a[href]")) setOpen(false);
        }}>
          <CartScreen embedded />
        </div>
        <div className={styles.footer}><Link href="/cart" onClick={() => setOpen(false)}>View full cart</Link></div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
