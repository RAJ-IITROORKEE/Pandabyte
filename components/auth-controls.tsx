import { Show, UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { Suspense } from "react";

export function AuthControls() {
  return (
    <nav className="auth-controls" aria-label="Account">
      <Suspense fallback={null}>
        <Show when="signed-out">
          <Link className="auth-link" href="/sign-in">
            Login
          </Link>
          <Link className="auth-link" href="/sign-up">
            Sign up
          </Link>
        </Show>
        <Show when="signed-in">
          <Link className="auth-link" href="/account">
            Account
          </Link>
          <UserButton />
        </Show>
      </Suspense>
    </nav>
  );
}
