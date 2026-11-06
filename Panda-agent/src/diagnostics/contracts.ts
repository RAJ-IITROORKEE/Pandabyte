export type DiagnosticChip='esp32'|'esp32c3'|'esp32c6'|'esp32s3';
export type DiagnosticInput={errorText:string;chip:DiagnosticChip;framework:'esp-idf';frameworkVersion:'5.5.1';screenshotId?:string};
export type VendorCitation={kind:'vendor';vendor:'espressif';chip:DiagnosticChip;framework:'esp-idf';frameworkVersion:'5.5.1';id:string;title:string;sourceUrl:string;capturedAt:string;quote:string;sectionPath:string[]};
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export function parseDiagnosticInput(v:unknown):DiagnosticInput|null {
 if(!record(v)||Object.keys(v).some(k=>!['errorText','chip','framework','frameworkVersion','screenshotId'].includes(k))||typeof v.errorText!=='string'||!v.errorText.trim()||v.errorText.trim().length>1500||/\p{Surrogate}/u.test(v.errorText)||!['esp32','esp32c3','esp32c6','esp32s3'].includes(v.chip as string)||v.framework!=='esp-idf'||v.frameworkVersion!=='5.5.1'||(v.screenshotId!==undefined&&(typeof v.screenshotId!=='string'||!uuid.test(v.screenshotId))))return null;
 return {errorText:v.errorText.trim(),chip:v.chip as DiagnosticChip,framework:'esp-idf',frameworkVersion:'5.5.1',...(v.screenshotId===undefined?{}:{screenshotId:v.screenshotId as string})};
}
export function diagnosticQuestion(v:DiagnosticInput):string{return `Diagnostic (${v.chip}, ${v.framework} ${v.frameworkVersion}): ${v.errorText}`;}
export function parseVendorCitation(v:unknown):VendorCitation|null {
 if(!record(v)||Object.keys(v).sort().join(',')!=='capturedAt,chip,framework,frameworkVersion,id,kind,quote,sectionPath,sourceUrl,title,vendor'||v.kind!=='vendor'||v.vendor!=='espressif'||v.chip!=='esp32'||v.framework!=='esp-idf'||v.frameworkVersion!=='5.5.1'||v.title!=='GPIO & RTC GPIO'||v.sourceUrl!=='https://docs.espressif.com/projects/esp-idf/en/v5.5.1/esp32/api-reference/peripherals/gpio.html'||!Array.isArray(v.sectionPath)||v.sectionPath.length!==2||v.sectionPath[0]!=='API Reference - Normal GPIO'||v.sectionPath[1]!=='Header File'||v.id!=='S1'||typeof v.capturedAt!=='string'||!Number.isFinite(Date.parse(v.capturedAt))||typeof v.quote!=='string'||!v.quote.trim()||v.quote.length>600||/\p{Surrogate}/u.test(v.quote))return null;
 return v as VendorCitation;
}
// Composite history uses distinct display IDs; diagnostic admission keeps its S1 validator.
export function parseCompositeVendorCitation(v:unknown):VendorCitation|null {
 if(!record(v)||typeof v.id!=='string'||!/^S[2-4]$/.test(v.id))return null;
 const checked=parseVendorCitation({...v,id:'S1'});return checked?{...checked,id:v.id}:null;
}
