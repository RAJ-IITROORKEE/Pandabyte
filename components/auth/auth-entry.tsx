"use client";

import { Box, Grid, Heading, Stack, Text } from "@chakra-ui/react";
import Image from "next/image";
import { useEffect, type ReactNode } from "react";
import { AUTH_ATTEMPT_KEY } from "@/lib/auth/completion";
import { AuthProvider } from "./auth-provider";
import styles from "./auth-entry.module.css";

export function AuthEntryPage({ children, mode, nonce, returnPath }: {
  children: ReactNode;
  mode: "sign-in" | "sign-up";
  nonce?: string;
  returnPath: string;
}) {
  useEffect(() => {
    try {
      sessionStorage.setItem(AUTH_ATTEMPT_KEY, JSON.stringify({ createdAt: Date.now(), returnPath }));
    } catch {
      // Authentication remains available when browser storage is disabled.
    }
  }, [returnPath]);

  const requiresSignIn = /^\/(checkout|account|admin|staff|agent|panda-agent)(?:[/?#]|$)/i.test(returnPath);

  return (
    <AuthProvider nonce={nonce}>
      <Box as="main" id="main" tabIndex={-1} className={`pb-auth ${styles.page}`}>
        <Grid className={styles.layout}>
          <Stack as="section" className={styles.intro} aria-labelledby="auth-heading">
            <span className={styles.logoBacking}>
              <Image src="/brand/pandabyte-logo.png" alt="PandaByte" width={56} height={57} className={styles.logo} />
            </span>
            <Text className={styles.eyebrow}>Your PandaByte account</Text>
            <Heading as="h1" id="auth-heading">{mode === "sign-in" ? "Welcome to PandaByte." : "Get started with PandaByte."}</Heading>
            <Text className={styles.description}>{requiresSignIn ? "Please sign in to continue. " : ""}Access your account, saved items and orders. New here? You can create an account using the form.</Text>
          </Stack>
          <Box className={styles.form}>{children}</Box>
        </Grid>
      </Box>
    </AuthProvider>
  );
}
