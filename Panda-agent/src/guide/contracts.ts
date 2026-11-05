export type GuideInput={goal:string;board:string;revision?:string;components:string[];expectedVersion:number};
export type GuideSkill={id:'embedded-project-guide';version:1|2;hash:string};
export type ProjectMemory={version:number;guideTurns:number;compactions:number;intent:Omit<GuideInput,'expectedVersion'>|null;questions:Array<'revision'|'wiring'|'framework'|'component-specifications'>;recentGoals:string[]};
const record=(v:unknown):v is Record<string,unknown>=>!!v && typeof v==='object' && !Array.isArray(v);
const clean=(v:unknown,max:number):string|null=>typeof v==='string' && v.trim().length>0 && v.trim().length<=max && !/\p{Surrogate}/u.test(v)?v.trim():null;
export function parseGuideInput(value:unknown):GuideInput|null {
  if(!record(value) || Object.keys(value).some(k=>!['goal','board','revision','components','expectedVersion'].includes(k)))return null;
  const goal=clean(value.goal,600),board=clean(value.board,128),revision=value.revision===undefined?undefined:clean(value.revision,80);
  if(!goal || !board || revision===null || !Array.isArray(value.components) || value.components.length>8 || !Number.isSafeInteger(value.expectedVersion) || (value.expectedVersion as number)<0)return null;
  const components=value.components.map(c=>clean(c,80));if(components.some(c=>!c))return null;
  return {goal,board,...(revision===undefined?{}:{revision}),components:components as string[],expectedVersion:value.expectedVersion as number};
}
export function guideQuestion(input:GuideInput):string {return `Project guide: ${input.goal}`;}
export function parseProjectMemory(value:unknown):ProjectMemory|null {
 if(!record(value) || Object.keys(value).length!==6 || !['version','guideTurns','compactions','intent','questions','recentGoals'].every(k=>Object.hasOwn(value,k)))return null;
 const bounded=(v:unknown,max:number)=>Number.isSafeInteger(v) && (v as number)>=0 && (v as number)<=max;
 if(!bounded(value.version,1_000_000_000) || !bounded(value.guideTurns,100) || !bounded(value.compactions,12) || !Array.isArray(value.questions) || value.questions.length>4 || new Set(value.questions).size!==value.questions.length || value.questions.some(q=>!['revision','wiring','framework','component-specifications'].includes(q)) || !Array.isArray(value.recentGoals) || value.recentGoals.length>7 || value.recentGoals.some(g=>!clean(g,600) || clean(g,600)!==g))return null;
 let intent:ProjectMemory['intent']=null;
 if(value.intent!==null){
  if(!record(value.intent) || Object.keys(value.intent).some(k=>!['goal','board','revision','components'].includes(k)))return null;
  const components=value.intent.components;
  const p=parseGuideInput({...value.intent,expectedVersion:0});
  if(!p || p.goal!==value.intent.goal || p.board!==value.intent.board || p.revision!==value.intent.revision || !Array.isArray(components) || p.components.some((c,i)=>c!==components[i]))return null;
  intent={goal:p.goal,board:p.board,...(p.revision===undefined?{}:{revision:p.revision}),components:p.components};
 }
 return {version:value.version as number,guideTurns:value.guideTurns as number,compactions:value.compactions as number,intent,questions:value.questions as ProjectMemory['questions'],recentGoals:value.recentGoals as string[]};
}
