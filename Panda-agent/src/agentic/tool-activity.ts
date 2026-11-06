import type {ToolActivity} from './contracts.ts';
export function parseToolActivity(v:unknown):ToolActivity|null{
 if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).sort().join(',')!=='origin,state,toolId')return null;
 const c=v as Record<string,unknown>;
 if(!['panda_scoped_rag','fetch_public_docs_mcp','convert_units','format_bom'].includes(c.toolId as string))return null;
 if(!['running:execution','complete:execution','complete:recorded','unknown:execution','unknown:existing'].includes(`${c.state}:${c.origin}`))return null;
 return {toolId:c.toolId,state:c.state,origin:c.origin} as ToolActivity;
}
