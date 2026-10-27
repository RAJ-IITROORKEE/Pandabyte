import { PolicyPageLayout } from "@/components/policies/policy-layout";
import { policies } from "@/components/policies/policy-content";

export const metadata = { title: `${policies["privacy-policy"].title} | PandaByte.in` };

export default function Page() {
  return <PolicyPageLayout slug="privacy-policy" />;
}
