import 'server-only';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// MCP server API keys are sealed with AES-256-GCM before they reach the database; the key lives only in
// PANDA_AGENT_MCP_SECRET_KEY (64 hex chars). The server name is bound as associated data, so a sealed key
// cannot be moved to another server's row.
const keyOf = (env: NodeJS.ProcessEnv) => {
  const hex = env.PANDA_AGENT_MCP_SECRET_KEY;
  if (!hex || !/^[a-f0-9]{64}$/.test(hex)) throw new Error('mcp_secret_key_missing');
  return Buffer.from(hex, 'hex');
};
const aad = (server: string) => Buffer.from(`panda-mcp-v1:${server}`, 'utf8');

export function sealSecret(server: string, plain: string, env: NodeJS.ProcessEnv = process.env): string {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', keyOf(env), iv);
  cipher.setAAD(aad(server));
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), body.toString('base64url')].join('.');
}

export function openSecret(server: string, sealed: string, env: NodeJS.ProcessEnv = process.env): string {
  const [version, iv, tag, body] = sealed.split('.');
  if (version !== 'v1' || !iv || !tag || !body) throw new Error('mcp_secret_invalid');
  const decipher = createDecipheriv('aes-256-gcm', keyOf(env), Buffer.from(iv, 'base64url'));
  decipher.setAAD(aad(server)); decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]).toString('utf8');
}
