import 'server-only';
import { authenticateLightweight } from './lightweight-connection';
import { parseToolSettings, type ToolSettings } from '../agent-loop/tool-catalog.ts';

/** Admin tool switches for the chat page (Device button, web search); the defaults when they cannot be read. */
export async function pageToolSettings(): Promise<ToolSettings> {
  try {
    const actor = await authenticateLightweight();
    if (!actor) return parseToolSettings(null);
    const { data, error } = await actor.client.database.rpc('panda_agent_tool_settings');
    return parseToolSettings(error ? null : data);
  } catch { return parseToolSettings(null); }
}
