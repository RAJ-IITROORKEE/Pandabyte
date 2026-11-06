"use client";
import {useState, type FormEvent} from 'react';
import {parseAgenticInput, type AgenticInput} from '../agentic/contracts';
import {convertUnit} from '../agentic/helpers';
import styles from './workspace.module.css';

export function StructuredTaskForm({disabled,onClose,onSubmit}:{disabled:boolean;onClose:()=>void;onSubmit:(input:AgenticInput)=>void}) {
 const [skillId,setSkill]=useState<AgenticInput['skillId']>('panda-documented-firmware-help');
 const [task,setTask]=useState<AgenticInput['task']>('unit-conversion');
 const [question,setQuestion]=useState(''),[sku1,setSku1]=useState(''),[sku2,setSku2]=useState('');
 const [components,setComponents]=useState([{name:'',quantity:'1',unit:''}]);
 const [value,setValue]=useState(''),[from,setFrom]=useState('V'),[to,setTo]=useState('mV');
 const [error,setError]=useState('');
 function submit(event:FormEvent){
  event.preventDefault();
  const products=task==='unit-conversion'?[]:[sku1.trim(),...(task==='mcu-comparison'?[sku2.trim()]:[])].filter(Boolean);
  const rows=components.filter(c=>c.name.trim()||c.unit.trim());
  const input=parseAgenticInput({skillId,task,question:question.trim(),products,frameworkVersion:task==='firmware-gpio'?'5.5.1':null,...(task==='project-outline'?{components:rows.map(c=>({name:c.name.trim(),quantity:Number(c.quantity),...(c.unit.trim()?{unit:c.unit.trim()}:{})}))}:{}),...(task==='unit-conversion'?{conversion:{value:Number(value),from,to}}:{})});
  if(!input || (task==='unit-conversion'&&(!value.trim()||convertUnit(Number(value),from,to)===null)) || (task==='mcu-comparison'&&products.length!==2) || (task==='project-outline'&&rows.some(c=>!c.quantity.trim()))) {setError('Check the fields. Conversion units must have the same dimension, and component quantities must be valid.');return;}
  setError('');onSubmit(input);
 }
 return <form className={styles.structuredForm} onSubmit={submit} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();onClose();}}}>
  <div className={styles.structuredHeader}><strong>Structured task</strong><button type="button" onClick={onClose}>Close</button></div>
  <fieldset disabled={disabled} className={styles.structuredFields}>
  <label>Skill<select value={skillId} onChange={e=>{const next=e.target.value as AgenticInput['skillId'];setSkill(next);if((task==='firmware-gpio'&&next==='panda-project-planner')||(task==='project-outline'&&next!=='panda-project-planner')||(task==='unit-conversion'&&next==='panda-error-triage'))setTask('mcu-comparison');}}><option value="panda-documented-firmware-help">Documented firmware help</option><option value="panda-error-triage">Error triage</option><option value="panda-project-planner">Project planner</option></select></label>
  <label>Task<select value={task} onChange={e=>setTask(e.target.value as AgenticInput['task'])}>{skillId!=='panda-error-triage'&&<option value="unit-conversion">Unit conversion</option>}<option value="mcu-comparison">MCU comparison</option>{skillId!=='panda-project-planner'&&<option value="firmware-gpio">Firmware GPIO reference</option>}{skillId==='panda-project-planner'&&<option value="project-outline">Project outline</option>}</select></label>
  <label>Question<textarea required maxLength={2000} value={question} onChange={e=>setQuestion(e.target.value)} /></label>
  {task!=='unit-conversion'&&<label>Exact product SKU {task!=='mcu-comparison'&&'(optional)'}<input maxLength={128} required={task==='mcu-comparison'} value={sku1} onChange={e=>setSku1(e.target.value)} /></label>}
  {task==='mcu-comparison'&&<label>Second exact product SKU<input required maxLength={128} value={sku2} onChange={e=>setSku2(e.target.value)} /></label>}
  {task==='firmware-gpio'&&<p>Reference scope: ESP32, ESP-IDF 5.5.1. Board applicability is not assumed.</p>}
  {task==='project-outline'&&<fieldset><legend>User-reported components (optional)</legend>{components.map((component,index)=><div className={styles.componentRow} key={index}><label>Component {index+1} name<input maxLength={80} value={component.name} onChange={e=>setComponents(rows=>rows.map((c,i)=>i===index?{...c,name:e.target.value}:c))} /></label><label>Quantity<input type="number" min="0" max="1000000000000" step="any" value={component.quantity} onChange={e=>setComponents(rows=>rows.map((c,i)=>i===index?{...c,quantity:e.target.value}:c))} /></label><label>Unit<input maxLength={12} value={component.unit} onChange={e=>setComponents(rows=>rows.map((c,i)=>i===index?{...c,unit:e.target.value}:c))} /></label><button type="button" onClick={()=>setComponents(rows=>rows.filter((_,i)=>i!==index))}>Remove component {index+1}</button></div>)}<button type="button" disabled={components.length>=12} onClick={()=>setComponents(rows=>[...rows,{name:'',quantity:'1',unit:''}])}>Add component</button></fieldset>}
  {task==='unit-conversion'&&<fieldset><legend>Conversion</legend><label>Value<input required type="number" step="any" min="-1000000000000" max="1000000000000" value={value} onChange={e=>setValue(e.target.value)} /></label>{[['From',from,setFrom],['To',to,setTo]].map(([label,current,set])=><label key={label as string}>{label as string}<select value={current as string} onChange={e=>(set as (v:string)=>void)(e.target.value)}>{['ms','s','Hz','kHz','MHz','mm','cm','m','mV','V','mA','A'].map(u=><option key={u}>{u}</option>)}</select></label>)}</fieldset>}
  {error&&<p role="alert">{error}</p>}<button type="submit">Send structured task</button></fieldset>
 </form>;
}
