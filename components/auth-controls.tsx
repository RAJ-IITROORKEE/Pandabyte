import { Show } from "@clerk/nextjs";
import { Suspense } from "react";
import { AccountMenu } from "@/components/account-menu";
import { LoginLink } from "@/components/login-link";

export function AuthControls() {
  return (
    <nav className="auth-controls" aria-label="Account">
      <Suspense fallback={null}>
        <Show when="signed-out">
          <LoginLink />
        </Show>
        <Show when="signed-in">
          <AccountMenu />
        </Show>
      </Suspense>
    </nav>
  );
}
