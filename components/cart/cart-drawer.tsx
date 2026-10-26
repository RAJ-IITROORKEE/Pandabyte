"use client";

import * as Dialog from "@radix-ui/react-dialog";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ShoppingCart, X } from "lucide-react";
import { useState } from "react";
import styles from "./cart-drawer.module.css";

const CartScreen = dynamic(() => import("./cart-screen").then((module) => module.CartScreen), {
  loading: () => <p role="status">Loading your cart…</p>,
});

export function CartDrawer({ onOpen }: { onOpen?: () => void }) {
  const [open, setOpen] = useState(false);
  return <Dialog.Root open={open} onOpenChange={(next) => {
    setOpen(next);
    if (next) onOpen?.();
  }}>
    <Dialog.Trigger className="pb-icon-button" aria-label="Cart"><ShoppingCart aria-hidden="true" /></Dialog.Trigger>
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
