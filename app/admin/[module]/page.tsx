import { notFound } from "next/navigation";
import { RecordListScreen } from "@/components/admin/record-screens";
import { parseAdminModule } from "@/lib/admin/validation";
import { ProductsTable } from "@/components/admin/products-table";
import { CategoriesTable } from "@/components/admin/categories-table";
import { ContentTable, PagesTable } from "@/components/admin/pages-table";

export default async function AdminModulePage({ params }: PageProps<"/admin/[module]">) {
  const { module: rawModule } = await params;
  const adminModule = parseAdminModule(rawModule);
  if (!adminModule) notFound();
  if (adminModule === "products") return <ProductsTable />;
  if (adminModule === "categories") return <CategoriesTable />;
  if (adminModule === "pages") return <PagesTable />;
  if (adminModule === "blog") return <ContentTable module="blog" />;
  if (adminModule === "faqs") return <ContentTable module="faqs" />;
  return <RecordListScreen key={adminModule} module={adminModule} />;
}
