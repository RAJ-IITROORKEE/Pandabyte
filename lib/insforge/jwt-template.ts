import "server-only";

export function insforgeJwtTemplate(env: Readonly<Record<string, string | undefined>> = process.env): string {
  const value = env.INSFORGE_CLERK_JWT_TEMPLATE;
  if (value === undefined) return "insforge";
  if (value.length < 1 || value.length > 64 || /[^A-Za-z0-9_-]/.test(value)) throw new Error("Invalid InsForge JWT template configuration.");
  return value;
}
