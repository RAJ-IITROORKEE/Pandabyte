import { PolicyPageLayout } from "@/components/policies/policy-layout";
import { policies } from "@/components/policies/policy-content";

export const metadata = { title: `${policies["terms-and-conditions"].title} | PandaByte.in` };

export default function Page() {
  return <PolicyPageLayout slug="terms-and-conditions" />;
}
