import {createHash} from 'node:crypto';

const common={version:1,costClass:'local-zero-api-fee',maxCallsPerTurn:4,modelCalls:0,deadlineMs:30000,concurrency:2};
const entries=[
 {id:'panda_scoped_rag',transport:'in-process',allowedTools:['canonical_mcu','approved_gpio'],allowedHosts:[],timeoutMs:30000,maxResultBytes:24000},
 {id:'fetch_public_docs_mcp',transport:'stdio',allowedTools:['fetch_document'],allowedHosts:['docs.espressif.com'],catalog:['espressif-esp-idf-5.5.1-esp32-gpio'],sdk:'mcp==2.3.0',referenceReviewedNotCopied:'36380287ed3b15d115b55f546617d723072b1296',timeoutMs:10000,maxResultBytes:4096,maxHttpRequests:2,maxHttpBytes:262144,redirects:0},
 {id:'convert_units',transport:'in-process',allowedTools:['convert_units'],allowedHosts:[],timeoutMs:100,maxResultBytes:1024},
 {id:'format_bom',transport:'in-process',allowedTools:['format_bom'],allowedHosts:[],timeoutMs:100,maxResultBytes:4096},
];
export const agenticManifests=Object.freeze(entries.map(entry=>{const manifest=Object.freeze({...common,...entry});return Object.freeze({id:entry.id,manifest,hash:createHash('sha256').update(JSON.stringify(manifest)).digest('hex')});}));
