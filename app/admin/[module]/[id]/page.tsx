import { notFound } from "next/navigation";
import { RecordEditorScreen } from "@/components/admin/record-screens";
import { parseAdminModule, parseRecordId } from "@/lib/admin/validation";

export default async function AdminRecordPage({ params }: PageProps<"/admin/[module]/[id]">) {
  const { module: rawModule, id: rawId } = await params;
  const adminModule = parseAdminModule(rawModule);
  if (!adminModule || (rawId !== "new" && !parseRecordId(rawId))) notFound();
  return <RecordEditorScreen key={`${adminModule}:${rawId}`} module={adminModule} id={rawId} />;
}
