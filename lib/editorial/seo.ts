import type { Metadata } from "next";
import type { CommonDocument } from "@/lib/admin/validation";

export const PUBLIC_ORIGIN = "https://www.pandabyte.in";
export function publicMetadata(document: CommonDocument | null | undefined, path: string): Metadata {
  return {
    title: document?.seoTitle || document?.title || "PandaByte.in",
    description: document?.seoDescription || document?.summary || "PandaByte IoT and embedded hardware.",
    alternates: { canonical: new URL(path, PUBLIC_ORIGIN).toString() },
    robots: { index: false, follow: false },
  };
}
