// SKILL.md (Agent Skills format, agentskills.io): YAML-style frontmatter with name and description, then a Markdown body.
// Limits match migration 20261113180000 (stricter than the spec so the agent's prompt stays small).
export const SKILL_NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const SKILL_NAME_CHARS = 64, SKILL_DESCRIPTION_CHARS = 500, SKILL_MAX_CHARS = 6000;
export type SkillDoc = { name: string; description: string; body: string };

const unquote = (v: string) => /^"(.*)"$/.test(v) || /^'(.*)'$/.test(v) ? v.slice(1, -1) : v;

/** Parses and validates one SKILL.md. Unknown single-line keys and indented (nested) lines are ignored; name and description are required. */
export function parseSkillMd(raw: unknown): SkillDoc | { error: string } {
  if (typeof raw !== 'string' || !raw.isWellFormed()) return { error: 'SKILL.md must be text.' };
  const text = raw.replace(/\r\n?/g, '\n');
  if (text.length > SKILL_MAX_CHARS) return { error: `SKILL.md is ${text.length} characters; the limit is ${SKILL_MAX_CHARS}.` };
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) return { error: 'SKILL.md contains control characters.' };
  if (!text.startsWith('---\n')) return { error: 'SKILL.md must start with a --- frontmatter block.' };
  const end = text.indexOf('\n---\n', 3);
  const close = end < 0 && text.endsWith('\n---') ? text.length - 4 : end;
  if (close < 0) return { error: 'The frontmatter block must end with a --- line.' };
  const fields = new Map<string, string>();
  for (const line of text.slice(4, close).split('\n')) {
    if (!line.trim() || /^\s/.test(line) || line.startsWith('#')) continue;
    const match = /^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/.exec(line);
    if (!match) return { error: `Frontmatter line is not "key: value": ${line.slice(0, 60)}` };
    if (fields.has(match[1])) return { error: `Frontmatter key "${match[1]}" appears twice.` };
    fields.set(match[1], unquote(match[2].trim()));
  }
  const name = fields.get('name') ?? '', description = (fields.get('description') ?? '').trim();
  if (!SKILL_NAME.test(name) || name.length > SKILL_NAME_CHARS) return { error: `name must be lowercase words joined by hyphens, at most ${SKILL_NAME_CHARS} characters.` };
  if (!description || description.length > SKILL_DESCRIPTION_CHARS) return { error: `description is required, on one line, at most ${SKILL_DESCRIPTION_CHARS} characters.` };
  const body = text.slice(close + 4).replace(/^\n/, '').trim();
  if (!body) return { error: 'The skill body (instructions after the frontmatter) is empty.' };
  return { name, description, body };
}
