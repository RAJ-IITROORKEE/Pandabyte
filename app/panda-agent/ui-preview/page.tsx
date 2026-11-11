import { notFound } from "next/navigation";
import { UiPreview } from "./ui-preview";

// Development-only gallery of the chat UI pieces with sample data; production builds return 404.
export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <UiPreview />;
}
