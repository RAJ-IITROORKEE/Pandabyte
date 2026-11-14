// Admin-visible catalog of agent tools and their on/off settings (table panda_agent_tool_settings). Pure: no server imports.
export const TOOL_SETTING_NAMES = ['find_pinout','plan','web_search','web_helper','load_skill','mcp_tools','compile_sketch','device_panel'] as const;
export type ToolSettingName = typeof TOOL_SETTING_NAMES[number];
export const DEFAULT_TOOL_SETTINGS: Record<ToolSettingName, boolean> = {
 find_pinout: true, plan: true, web_search: true, web_helper: false, load_skill: true, mcp_tools: true, compile_sketch: true, device_panel: true,
};
export type ToolSettings = Record<ToolSettingName, { enabled: boolean; version: number | null }>;

const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const known = (v: unknown): v is ToolSettingName => typeof v === 'string' && (TOOL_SETTING_NAMES as readonly string[]).includes(v);

export function parseToolSettings(raw: unknown): ToolSettings {
 const out = {} as ToolSettings;
 for (const n of TOOL_SETTING_NAMES) out[n] = { enabled: DEFAULT_TOOL_SETTINGS[n], version: null };
 if (!Array.isArray(raw)) return out;
 for (const row of raw) {
  if (!record(row) || !known(row.name)) continue;
  if (typeof row.enabled !== 'boolean' || !Number.isSafeInteger(row.version) || (row.version as number) < 1) continue;
  out[row.name] = { enabled: row.enabled, version: row.version as number };
 }
 return out;
}

/** PATCH body: exactly {name, enabled, expectedVersion}. Returns the checked fields or null. */
export function parseToolPatch(v: unknown): { name: ToolSettingName; enabled: boolean; expectedVersion: number } | null {
 if (!record(v) || Object.keys(v).sort().join(',') !== 'enabled,expectedVersion,name') return null;
 if (!known(v.name) || typeof v.enabled !== 'boolean') return null;
 if (!Number.isSafeInteger(v.expectedVersion) || (v.expectedVersion as number) < 1 || (v.expectedVersion as number) > 1000000000) return null;
 return { name: v.name, enabled: v.enabled, expectedVersion: v.expectedVersion as number };
}

export type ToolEntry = { name: string; label: string; description: string; group: 'Core' | 'Product data' | 'Web' | 'Skills and MCP' | 'Device' | 'Display';
 runsOn: string; required: boolean; setting: ToolSettingName | null };
export const TOOL_CATALOG: readonly ToolEntry[] = [
 { name: 'search_catalog', label: 'Search catalog', description: 'Finds PandaByte products by words in their titles (SKU, title and category only).', group: 'Core', runsOn: 'Server', required: true, setting: null },
 { name: 'read_product', label: 'Read product', description: 'Reads cited excerpts of one PandaByte listing and its attached datasheet; never price or stock.', group: 'Core', runsOn: 'Server', required: true, setting: null },
 { name: 'ask_user', label: 'Ask the user', description: 'Asks the user a clarifying question and waits for the answer.', group: 'Core', runsOn: 'Server', required: true, setting: null },
 { name: 'final_answer', label: 'Final answer', description: 'Ends the turn with the cited answer shown to the user.', group: 'Core', runsOn: 'Server', required: true, setting: null },
 { name: 'find_pinout', label: 'Find pinout', description: 'Looks up the pin map of a PandaByte board so wiring and code use real GPIO numbers.', group: 'Product data', runsOn: 'Server', required: false, setting: 'find_pinout' },
 { name: 'plan', label: 'Plan checklist', description: 'Shows a live checklist of the steps the agent is working through.', group: 'Display', runsOn: 'Server', required: false, setting: 'plan' },
 { name: 'web_search', label: 'Web search', description: 'Searches the public web through Tavily when the catalog does not have the answer.', group: 'Web', runsOn: 'Tavily (web)', required: false, setting: 'web_search' },
 { name: 'web_helper', label: 'Web research helper', description: 'Picks the useful passages from web search results in a separate model call. Off by default.', group: 'Web', runsOn: 'OpenRouter model', required: false, setting: 'web_helper' },
 { name: 'load_skill', label: 'Load skill', description: 'Loads an Admin-approved skill so the agent follows its instructions for a task.', group: 'Skills and MCP', runsOn: 'Server', required: false, setting: 'load_skill' },
 { name: 'mcp_tools', label: 'MCP tools', description: 'Lets the agent open Admin-approved remote MCP servers and call their tools; Ask mode needs the user to approve each call.', group: 'Skills and MCP', runsOn: 'External MCP server', required: false, setting: 'mcp_tools' },
 { name: 'compile_sketch', label: 'Arduino CLI compile', description: 'Builds Arduino sketches for PandaByte boards with arduino-cli (ESP32 and ESP8266 cores) on AWS Lambda and returns a firmware card. Off: the agent gives the sketch to build in the Arduino IDE.', group: 'Device', runsOn: 'AWS Lambda', required: false, setting: 'compile_sketch' },
 { name: 'device_panel', label: 'Espressif flash tool', description: 'Device panel using Espressif esptool-js: USB serial monitor, chip check and firmware flashing after the user confirms. Off: no Device panel and no Flash button.', group: 'Device', runsOn: 'Browser (Web Serial)', required: false, setting: 'device_panel' },
];
