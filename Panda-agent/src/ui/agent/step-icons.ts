export type StepKind = "understand" | "search_web" | "read" | "select" | "check" | "save" | "product" | "other";

const RULES: [StepKind, RegExp][] = [
  ["search_web", /\bweb\b|\bonline\b|\binternet\b/i],
  ["product", /\bproduct/i],
  ["read", /\bread|\bsearch|\bsources?\b|\bretriev/i],
  ["select", /\bselect|\brank|\bchoos/i],
  ["check", /\bcheck|\bverif|\bcitation/i],
  ["save", /\bsav|\bstor|\bwrit/i],
  ["understand", /\bunderstand|\bthink|\banaly|\bplan/i],
];

export function stepKind(label: string): StepKind {
  for (const [kind, re] of RULES) if (re.test(label)) return kind;
  return "other";
}
