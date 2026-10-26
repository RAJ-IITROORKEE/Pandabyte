export const blogPreview = [
  { title: "Example: Getting started with a development board", summary: "A sample article layout for a practical introduction.", category: "Getting started", image: "/blog-preview/boards.webp" },
  { title: "Example: Building at the workbench", summary: "A sample article layout for a hands-on project.", category: "Projects", image: "/blog-preview/workbench.webp" },
  { title: "Example: Exploring electronic circuits", summary: "A sample article layout for an electronics guide.", category: "Guides", image: "/blog-preview/circuit.webp" },
];

export function filterBlogPreview(query: string, category: string) {
  const search = query.toLocaleLowerCase();
  return blogPreview.filter((item) => (!category || item.category === category) &&
    (!search || `${item.title} ${item.summary} ${item.category}`.toLocaleLowerCase().includes(search)));
}
