// Descriptors only. No provider, feature switch, execution path, or user-facing tool is installed.
const unsupportedOutput={type:'object',additionalProperties:false,required:['state'],properties:{state:{const:'unsupported'}}} as const;
export const futureCapabilities=[
 {id:'mqtt_read',version:1,enabled:false,permission:'mqtt:read',timeoutMs:5000,maxResultBytes:4096,costCap:0,costClass:'none',inputSchema:{type:'object',additionalProperties:false,required:['broker','topic'],properties:{broker:{type:'string',minLength:1,maxLength:80,pattern:'^[A-Za-z0-9_-]+$'},topic:{type:'string',minLength:1,maxLength:200}}},outputSchema:unsupportedOutput},
 {id:'execute_code',version:1,enabled:false,permission:'code:execute',timeoutMs:5000,maxResultBytes:4096,costCap:0,costClass:'none',inputSchema:{type:'object',additionalProperties:false,required:['language','code'],properties:{language:{type:'string',minLength:1,maxLength:40},code:{type:'string',minLength:1,maxLength:4000}}},outputSchema:unsupportedOutput},
 {id:'generate_image',version:1,enabled:false,permission:'image:generate',timeoutMs:5000,maxResultBytes:4096,costCap:0,costClass:'none',inputSchema:{type:'object',additionalProperties:false,required:['prompt'],properties:{prompt:{type:'string',minLength:1,maxLength:1000}}},outputSchema:unsupportedOutput},
] as const;
export type FutureCapability=typeof futureCapabilities[number];
export function createDisabledCapability(capability:FutureCapability,provider?:(input:unknown,signal?:AbortSignal)=>Promise<unknown>){
 void provider;
 return {descriptor:capability,async invoke(input:unknown,signal?:AbortSignal):Promise<{state:'unsupported'}>{void input;void signal;return {state:'unsupported'};}};
}
