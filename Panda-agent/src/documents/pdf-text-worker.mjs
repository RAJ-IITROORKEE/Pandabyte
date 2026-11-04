import {getDocument,version} from 'pdfjs-dist/legacy/build/pdf.mjs';

// This worker has a parent-enforced heap/output/time bound. It is not an OS
// sandbox. PDF scripts/forms/rendering/OCR and external resources are not used.
globalThis.fetch=async()=>{throw Error('Network disabled');};
try{
 if(version!=='6.4.299')throw Error('Parser version');
 const chunks=[];let size=0;
 for await(const chunk of process.stdin){size+=chunk.length;if(size>3*1024*1024)throw Error('Input limit');chunks.push(chunk);}
 const task=getDocument({data:new Uint8Array(Buffer.concat(chunks)),isEvalSupported:false,disableFontFace:true,useSystemFonts:false,useWorkerFetch:false,disableAutoFetch:true,disableStream:true,maxImageSize:0,verbosity:0});
 let doc;
 try{
  doc=await task.promise;const count=Math.min(doc.numPages,100),segments=[];let remaining=20000,truncated=doc.numPages>100,pagesSeen=0;
  for(let page=1;page<=count;page++){
   const p=await doc.getPage(page);const content=await p.getTextContent();pagesSeen++;
   const text=content.items.filter(item=>typeof item.str==='string').map(item=>item.str+(item.hasEOL?'\n':' ')).join('').trim();
   segments.push({page,text:text.slice(0,remaining)});
   if(text.length>remaining)truncated=true;remaining-=Math.min(remaining,text.length);p.cleanup();
   if(!remaining){if(page<doc.numPages)truncated=true;break;}
  }
  process.stdout.write(JSON.stringify({segments,pagesSeen,truncated}));
 }finally{await task.destroy();}
}catch{process.exitCode=1;}
