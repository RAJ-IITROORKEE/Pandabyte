export type PlaygroundUsage = Readonly<{ inputTokens:number; outputTokens:number; costNanoUsd:number }>;
/** Guard-accounted nanoUSD, not an invoice or provider-billed total. */
export function isPlaygroundUsage(value:unknown):value is PlaygroundUsage {
 if(!value || typeof value!=='object' || Array.isArray(value))return false;
 const v=value as Record<string,unknown>;
 if(Object.keys(v).sort().join(',')!=='costNanoUsd,inputTokens,outputTokens')return false;
 const {inputTokens,outputTokens,costNanoUsd}=v;
 return typeof inputTokens==='number' && Number.isSafeInteger(inputTokens) && inputTokens>=0 && inputTokens<=128000 && typeof outputTokens==='number' && Number.isSafeInteger(outputTokens) && outputTokens>=0 && outputTokens<=1000 && typeof costNanoUsd==='number' && Number.isSafeInteger(costNanoUsd) && costNanoUsd>=inputTokens*150+outputTokens*600 && costNanoUsd<=19800000;
}

export function observePlaygroundUsage(callback:((usage:PlaygroundUsage)=>void|Promise<void>)|undefined, usage:PlaygroundUsage):void {
 try { void Promise.resolve(callback?.(Object.freeze({...usage}))).catch(()=>{}); } catch { /* Observation cannot affect the operation. */ }
}
