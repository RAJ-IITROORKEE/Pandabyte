import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Development Preview | PandaByte.in",
  description: "A local preview of the PandaByte.in development foundation.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
