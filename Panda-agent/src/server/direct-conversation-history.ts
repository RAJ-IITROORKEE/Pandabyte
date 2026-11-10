import type { ChatTurn } from './chat-contracts.ts';
import { ChatStoreError } from './chat-store.ts';

export type DirectHistoryPair = { question:string; answer:string };

/** Intersect journal eligibility with the already masked, same-thread read. */
export function directHistory(turns:ChatTurn[], request:string, ids:string[]):DirectHistoryPair[] {
  const boundary=turns.findIndex(t=>t.requestId===request);
  if(boundary<0 || turns.findIndex((t,i)=>i!==boundary && t.requestId===request)>=0 || ids.length>6 || new Set(ids).size!==ids.length) throw new ChatStoreError('unavailable');
  let prior=-1;
  return ids.map(id=>{
    const index=turns.findIndex(t=>t.requestId===id), t=turns[index];
    if(index<=prior || index>=boundary || !t || t.status!=='complete' || !t.response || t.response.outcome!=='conversation' || t.response.citations.length!==0
      || !t.question.isWellFormed() || !t.response.text.isWellFormed()) throw new ChatStoreError('unavailable');
    prior=index; return {question:t.question,answer:t.response.text};
  });
}
