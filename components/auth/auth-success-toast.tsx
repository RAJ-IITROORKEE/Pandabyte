"use client";

import { Portal, Toast, Toaster, createToaster } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import { AuthProvider } from "./auth-provider";
import styles from "./auth-success-toast.module.css";

export function AuthSuccessToast({ nonce }: { nonce?: string }) {
  const [toaster] = useState(() => createToaster({ placement: "top-end", max: 1 }));

  useEffect(() => {
    toaster.create({ id: "auth-success", type: "success", title: "You're signed in", description: "Welcome to PandaByte.", duration: 6000 });
  }, [toaster]);

  return (
    <AuthProvider nonce={nonce}>
      <Portal>
        <Toaster toaster={toaster}>
          {(toast) => (
            <Toast.Root className={`pb-auth ${styles.toast}`}>
              <Toast.Indicator />
              <div className={styles.message}>
                <Toast.Title>{toast.title}</Toast.Title>
                <Toast.Description>{toast.description}</Toast.Description>
              </div>
              <Toast.CloseTrigger className={styles.close} aria-label="Dismiss notification">×</Toast.CloseTrigger>
            </Toast.Root>
          )}
        </Toaster>
      </Portal>
    </AuthProvider>
  );
}
