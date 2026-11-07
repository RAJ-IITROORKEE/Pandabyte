import {createHash} from 'node:crypto';
import type {CanonicalChunk,Product} from '../retrieval/contracts.ts';

// Private comparison binding. The public v3 wire digest remains rank/text only.
export function playgroundContextProof(product:Product, fingerprint:string, fragments:Array<{handle:string;text:string}>, chunks:CanonicalChunk[]) {
 const byHandle=new Map(chunks.map(c=>[c.handle,c]));
 const provenance=fragments.map((f,i)=>{
  const c=byHandle.get(f.handle);if(!c||c.productId!==product.id)throw Error('Invalid context provenance');
  return {rank:i+1,handle:c.handle,text:f.text,textHash:c.textHash,title:c.title,sourceUrl:c.sourceUrl,capturedAt:c.capturedAt,sectionPath:c.sectionPath,physicalRevision:c.physicalRevision};
 });
 return createHash('sha256').update(JSON.stringify({product,fingerprint,passages:provenance})).digest('hex');
}
