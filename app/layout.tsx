import type { Metadata } from "next";
import { headers } from "next/headers";
import { ClerkProvider } from "@clerk/nextjs";
import Script from "next/script";
import { Suspense } from "react";
import { PublishedHeader, PublishedFooter } from "@/components/published-site-shell";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { SiteFrame } from "@/components/site-frame";
import { themeInitScript } from "@/lib/theme";
import "./globals.css";
import "./theme.css";

// Public publication and private identity both require current request data.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Development Preview | PandaByte.in",
  description: "A local preview of the PandaByte.in development foundation.",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <Script id="pandabyte-theme" strategy="beforeInteractive" nonce={nonce} dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <ClerkProvider dynamic appearance={{
          variables: {
            colorPrimary: "var(--pb-accent)",
            colorPrimaryForeground: "var(--pb-action-text)",
            colorBackground: "var(--pb-surface)",
            colorForeground: "var(--pb-foreground)",
            colorMutedForeground: "var(--pb-muted)",
            colorInput: "var(--pb-background)",
            colorInputForeground: "var(--pb-foreground)",
            colorBorder: "var(--pb-border)",
          },
          elements: {
            rootBox: { maxWidth: "100%" },
            cardBox: { maxWidth: "100%" },
            userButtonTrigger: { width: "44px", height: "44px" },
            formButtonPrimary: {
              backgroundColor: "var(--pb-accent)",
              backgroundImage: "none",
              color: "var(--pb-action-text)",
              minHeight: "44px",
            },
          },
        }}>
          <SiteFrame header={<Suspense fallback={<SiteHeader />}><PublishedHeader /></Suspense>} footer={<Suspense fallback={<SiteFooter />}><PublishedFooter /></Suspense>}>
            {children}
          </SiteFrame>
        </ClerkProvider>
      </body>
    </html>
  );
}
