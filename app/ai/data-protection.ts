import { cleanAiText, redactSensitiveText } from "./security";

export type AiProtectionMode = "redact" | "block";
export type AiInjectionAction = "neutralize" | "block";
export type AiSensitiveCategory = "secret" | "tckn" | "iban" | "payment-card" | "email" | "phone" | "prompt-injection";

export type AiDataProtectionPolicy = {
  enabled: boolean;
  mode: AiProtectionMode;
  tckn: boolean;
  iban: boolean;
  paymentCard: boolean;
  email: boolean;
  phone: boolean;
  injectionDetection: boolean;
  injectionAction: AiInjectionAction;
};

export const DEFAULT_AI_DATA_PROTECTION_POLICY: AiDataProtectionPolicy = {
  enabled: true, mode: "redact", tckn: true, iban: true, paymentCard: true,
  email: true, phone: true, injectionDetection: true, injectionAction: "neutralize",
};

const TCKN = /(?<!\d)[1-9]\d{10}(?!\d)/g;
const IBAN = /\bTR\d{2}(?:[ -]?[A-Z0-9]){22}\b/gi;
const CARD = /(?<!\d)(?:\d[ -]?){12,18}\d(?!\d)/g;
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE = /(?<!\d)(?:(?:\+|00)90[ .()-]?|0)?5\d{2}[ .()-]?\d{3}[ .-]?\d{2}[ .-]?\d{2}(?!\d)/g;
const INJECTION_RULES = [
  /\b(?:ignore|disregard|override|forget)\s+(?:all\s+)?(?:previous|prior|system|developer)\s+(?:instructions?|prompts?|rules?)/gi,
  /\b(?:reveal|show|print|repeat|leak|expose)\s+(?:the\s+)?(?:system|developer|hidden)\s+(?:prompt|instructions?)/gi,
  /\b(?:developer|jailbreak|dan)\s+mode\b/gi,
  /\[(?:system|developer)\]\s*:/gi,
  /\b(?:exfiltrate|extract|dump)\s+(?:all\s+)?(?:secrets?|credentials?|tokens?|passwords?)\b/gi,
];

function validTckn(value: string) {
  if (!/^[1-9]\d{10}$/.test(value)) return false;
  const d = [...value].map(Number);
  return ((d[0]+d[2]+d[4]+d[6]+d[8])*7-(d[1]+d[3]+d[5]+d[7]))%10===d[9]
    && d.slice(0,10).reduce((sum,n)=>sum+n,0)%10===d[10];
}

function validIban(value: string) {
  const compact=value.replace(/[ -]/g,"").toUpperCase();
  if(!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(compact))return false;
  const expanded=`${compact.slice(4)}${compact.slice(0,4)}`.replace(/[A-Z]/g,c=>String(c.charCodeAt(0)-55));
  let remainder=0;for(const digit of expanded)remainder=(remainder*10+Number(digit))%97;
  return remainder===1;
}

function validCard(value:string){const digits=value.replace(/\D/g,"");if(digits.length<13||digits.length>19||/^(\d)\1+$/.test(digits))return false;let sum=0,alternate=false;for(let i=digits.length-1;i>=0;i--){let n=Number(digits[i]);if(alternate){n*=2;if(n>9)n-=9;}sum+=n;alternate=!alternate;}return sum%10===0;}

export type AiProtectionResult={text:string;blocked:boolean;findings:AiSensitiveCategory[];findingCount:number};

export function protectAiText(value:unknown,policy:AiDataProtectionPolicy=DEFAULT_AI_DATA_PROTECTION_POLICY,max=160_000):AiProtectionResult{
  const original=cleanAiText(value,max), findings:AiSensitiveCategory[]=[];
  if(!policy.enabled)return{text:redactSensitiveText(original,max),blocked:false,findings,findingCount:0};
  let text=original,count=0;
  const replace=(pattern:RegExp,category:AiSensitiveCategory,label:string,valid:((v:string)=>boolean)=()=>true)=>{
    text=text.replace(pattern,match=>{if(!valid(match)){return match;}findings.push(category);count++;return `[REDACTED_${label}]`;});
  };
  if(policy.tckn)replace(TCKN,"tckn","TCKN",validTckn);
  if(policy.iban)replace(IBAN,"iban","IBAN",validIban);
  if(policy.paymentCard)replace(CARD,"payment-card","PAYMENT_CARD",validCard);
  if(policy.email)replace(EMAIL,"email","EMAIL");
  if(policy.phone)replace(PHONE,"phone","PHONE");
  const secretRedacted=redactSensitiveText(text,max);if(secretRedacted!==text){findings.push("secret");count++;text=secretRedacted;}
  if(policy.injectionDetection){for(const rule of INJECTION_RULES){text=text.replace(rule,()=>{findings.push("prompt-injection");count++;return "[NEUTRALIZED_UNTRUSTED_INSTRUCTION]";});}}
  const unique=[...new Set(findings)];
  const sensitive=unique.some(item=>item!=="prompt-injection"), injection=unique.includes("prompt-injection");
  return{text,blocked:(policy.mode==="block"&&sensitive)||(policy.injectionAction==="block"&&injection),findings:unique,findingCount:count};
}
