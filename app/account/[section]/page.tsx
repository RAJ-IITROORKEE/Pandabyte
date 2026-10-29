import { notFound } from "next/navigation";
import { AccountPage } from "@/components/account-page";
import type { AccountSection } from "@/components/account-dashboard";

const sections = ["profile", "addresses", "favorites", "orders", "billing"] as const;

export default async function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!sections.includes(section as typeof sections[number])) notFound();
  return <AccountPage section={section as AccountSection} />;
}
