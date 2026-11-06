export class AgenticBudget {
 readonly deadline:number;readonly clock:()=>number;calls=0;reformulations=0;active=0;fragments=0;units=0;quotes=0;
 constructor(deadlineAt:number,clock:()=>number=Date.now){this.deadline=deadlineAt;this.clock=clock;}
 live(){return this.clock()<this.deadline;}
 admit(){if(!this.live()||this.calls>=4||this.active>=2)return false;this.calls++;this.active++;return true;}
 finish(){this.active=Math.max(0,this.active-1);}
 addEvidence(fragments:number,units:number,quotes:number){if(!Number.isSafeInteger(fragments)||fragments<0||!Number.isSafeInteger(units)||units<0||!Number.isSafeInteger(quotes)||quotes<0||this.fragments+fragments>8||this.units+units>20000||this.quotes+quotes>4)return false;this.fragments+=fragments;this.units+=units;this.quotes+=quotes;return true;}
}
