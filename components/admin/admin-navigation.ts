import {
  IconBook2,
  IconBriefcase2,
  IconBoxMultiple,
  IconFileText,
  IconHelpCircle,
  IconLayoutDashboard,
  IconMessage,
  IconPackage,
  IconPhoto,
  IconShoppingCart,
  IconSparkles,
  IconTags,
  IconUsers,
  IconVideo,
  IconWorld,
  type TablerIcon,
} from "@tabler/icons-react";

export type AdminNavItem = {
  href: string;
  label: string;
  icon: TablerIcon;
  capability?: string;
  permission?: string;
  comingSoon?: boolean;
  group: string;
};

export const dashboardItem: AdminNavItem = {
  href: "/admin",
  label: "Dashboard",
  icon: IconLayoutDashboard,
  group: "Workspace",
};

export const navigationGroups: { label: string; items: AdminNavItem[] }[] = [
  {
    label: "Workspace",
    items: [
      { href: "/admin/workspaces", label: "Workspaces", icon: IconBriefcase2, comingSoon: true, group: "Workspace" },
      { href: "/admin/chat", label: "Chat", icon: IconMessage, comingSoon: true, group: "Workspace" },
      { href: "/admin/ai-chat", label: "AI Chat", icon: IconSparkles, comingSoon: true, group: "Workspace" },
      { href: "/admin/rag-control-room", label: "RAG Control Room", icon: IconBook2, capability: "staff.manage", group: "Workspace" },
    ],
  },
  {
    label: "Products & catalog",
    items: [
      { href: "/admin/products", permission: "products.read", label: "Products", icon: IconPackage, capability: "catalog.edit", group: "Products & catalog" },
      { href: "/admin/categories", permission: "categories.read", label: "Categories", icon: IconTags, capability: "catalog.edit", group: "Products & catalog" },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/admin/orders", permission: "orders.read", label: "Orders", icon: IconShoppingCart, capability: "staff.manage", group: "Operations" },
      { href: "/admin/inventory", permission: "inventory.read", label: "Inventory", icon: IconBoxMultiple, capability: "orders.manage", group: "Operations" },
      { href: "/admin/inquiries", permission: "inquiries.read", label: "Inquiries", icon: IconMessage, capability: "inquiries.manage", group: "Operations" },
    ],
  },
  {
    label: "Site content",
    items: [
      { href: "/admin/pages", permission: "pages.read", label: "Pages", icon: IconFileText, capability: "content.edit", group: "Site content" },
      { href: "/admin/blog", permission: "blog.read", label: "Blog", icon: IconBook2, capability: "content.edit", group: "Site content" },
      { href: "/admin/faqs", permission: "faqs.read", label: "FAQs", icon: IconHelpCircle, capability: "content.edit", group: "Site content" },
      { href: "/admin/team", permission: "team.read", label: "Team", icon: IconUsers, capability: "content.edit", group: "Site content" },
      { href: "/admin/contact", permission: "contact.read", label: "Contact", icon: IconMessage, capability: "content.edit", group: "Site content" },
      { href: "/admin/navigation", permission: "navigation.read", label: "Navigation", icon: IconWorld, capability: "content.edit", group: "Site content" },
      { href: "/admin/solutions", permission: "solutions.read", label: "Solutions", icon: IconPackage, capability: "content.edit", group: "Site content" },
      { href: "/admin/learn", permission: "learn.read", label: "Learn resources", icon: IconBook2, capability: "content.edit", group: "Site content" },
      { href: "/admin/videos", permission: "videos.read", label: "Videos", icon: IconVideo, capability: "content.edit", group: "Site content" },
    ],
  },
  {
    label: "Assets",
    items: [{ href: "/admin/media", permission: "media.read", label: "Media", icon: IconPhoto, capability: "media.manage", group: "Assets" }],
  },
  {
    label: "Access control",
    items: [{ href: "/admin/users", label: "Users & roles", icon: IconUsers, capability: "staff.manage", group: "Access control" }],
  },
];

export function visibleNavigationGroups(capabilities: readonly string[]) {
  return navigationGroups.flatMap((group) => {
    const items = group.items.filter((item) => capabilities.includes("__custom_role__")
      ? !item.comingSoon && !!item.permission && capabilities.includes(item.permission)
      : !item.capability || capabilities.includes(item.capability));
    return items.length ? [{ ...group, items }] : [];
  });
}

export function searchAdminNavigation(query: string, capabilities: readonly string[]) {
  const items = [dashboardItem, ...visibleNavigationGroups(capabilities).flatMap((group) => group.items)];
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return terms.length ? items.filter((item) => terms.every((term) => `${item.label} ${item.group}`.toLocaleLowerCase().includes(term))) : items;
}
