import 'server-only';
import { SignatureV4 } from '@smithy/signature-v4';
import { HttpRequest } from '@smithy/protocol-http';
import { Sha256 } from '@aws-crypto/sha256-js';
import { awsCredentialsProvider } from '@vercel/oidc-aws-credentials-provider';

type Credentials = { accessKeyId:string; secretAccessKey:string; sessionToken?:string; expiration?:Date };
type Input = Readonly<{ url:string; method:'POST'|'GET'; headers:Record<string,string>; body:string }>;
type Config = { roleArn:string; credentials?:()=>Promise<Credentials> };

// Unmounted. Production uses Vercel OIDC only; optional credentials are a trusted
// server-side test seam and must still be short-lived STS session credentials.
export function createAwsGatewaySigner(config:Config) {
  if (!/^arn:aws:iam::\d{12}:role\/[A-Za-z0-9+=,.@_/-]{1,512}$/.test(config?.roleArn ?? '')) throw Error('Gateway signer unavailable');
  const provider=config.credentials ?? awsCredentialsProvider({roleArn:config.roleArn,durationSeconds:900,clientConfig:{region:'ap-south-1'}});
  const signer=new SignatureV4({service:'execute-api',region:'ap-south-1',sha256:Sha256,credentials:async()=>{
    const credentials=await provider();
    if (!credentials.accessKeyId || !credentials.secretAccessKey || !credentials.sessionToken || !(credentials.expiration instanceof Date) || !Number.isFinite(credentials.expiration.valueOf()) || credentials.expiration.valueOf()<=Date.now()+5000 || credentials.expiration.valueOf()>Date.now()+12*60*60*1000) throw Error('Gateway signer unavailable');
    return credentials;
  }});
  return async (input:Input):Promise<Record<string,string>> => {
    const url=new URL(input.url);
    if (!['POST','GET'].includes(input.method) || url.protocol!=='https:' || !/^[a-z0-9]{10}\.execute-api\.ap-south-1\.amazonaws\.com$/.test(url.hostname) || !(input.method === 'GET' ? url.pathname === '/agent/v1/status' && input.body === '' : ['/synthetic/v1/turns','/agent/v1/turns'].includes(url.pathname)) || url.port || url.username || url.password || url.search || url.hash || typeof input.body!=='string' || Buffer.byteLength(input.body)>16384) throw Error('Gateway signer unavailable');
    const headers=Object.fromEntries(Object.entries(input.headers).map(([key,value])=>[key.toLowerCase(),value]));
    if (Object.keys(headers).length!==(input.method === 'GET' ? 3 : 4) || (input.method === 'POST' && headers['content-type']!=='application/json') || !(input.method === 'GET' ? headers.accept === 'application/json' : ['application/json','text/event-stream'].includes(headers.accept)) || !/^[a-f0-9]{64}$/.test(headers['x-panda-service-token']??'') || !/^[A-Za-z0-9._~-]{16,8192}$/.test(headers['x-panda-user-token']??'')) throw Error('Gateway signer unavailable');
    const request=new HttpRequest({protocol:'https:',hostname:url.hostname,method:input.method,path:url.pathname,headers:{...headers,host:url.hostname},body:input.body});
    return (await signer.sign(request)).headers;
  };
}
