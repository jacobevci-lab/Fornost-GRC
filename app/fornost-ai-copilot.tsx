"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { withBasePath } from "./base-path";
import FornostAiAgents, { type AgentConversion, type AgentDecision, type AgentKind, type AgentRun } from "./fornost-ai-agents";
import FornostAiKnowledge from "./fornost-ai-knowledge";

type User = { name?: string; email: string; role: "Admin" | "Editor" | "Viewer" };
type Status = { configured: boolean; enabled: boolean; provider: string | null; model: string | null; mode: string };
type Source = { id: string; module: string; title: string };
type Message = { role: "user" | "assistant"; content: string; sources?: Source[]; citationIntegrity?: {grounded:boolean;cited:number;invalidRemoved:number} };
type AuditLog = { id:string;actor:string;action:string;provider:string;model:string;promptHash:string|null;contextRefs:string[];status:string;latencyMs:number;detail:string;createdAt:string };
type DraftKind = "risk-treatment" | "audit-finding" | "remediation-task";
type DraftTicket = {status:string;provider:string|null;externalId:string|null;url:string|null;note:string;createdBy:string;createdAt:string;completedAt:string|null;error:string|null};
type AiDraft = { id:string;kind:DraftKind;title:string;payload:Record<string,string>;rationale:string;sourceRefs:string[];status:"pending"|"approved"|"rejected";provider:string;model:string;createdBy:string;reviewedBy:string|null;reviewedAt:string|null;reviewNote:string|null;createdAt:string;publication:{recordId:string;module:string;note:string;publishedBy:string;publishedAt:string}|null;ticket:DraftTicket|null };
type AiMetrics = {windowDays:number;activity:{total:number;success:number;errors:number;denied:number;successRate:number;averageLatencyMs:number};providerHealth:{total:number;success:number;errors:number;successRate:number;averageLatencyMs:number};drafts:{total:number;pending:number;approved:number;rejected:number;approvalRate:number};outputs:{recordPublications:number;ticketsCreated:number;ticketFailures:number};governance:{total:number;approved:number;overdue:number;evaluationRuns:number;evaluationPassRate:number;evaluationCurrent:{total:number;passed:number;failing:number;untested:number};fallbackActivations:number};agents:{runs:number;approved:number;failed:number;draftsCreated:number};knowledge:{total:number;approved:number;drafts:number;archived:number;restricted:number;stale:number;chunks:number};controls:Array<{id:string;label:string;status:"ready"|"attention"|"missing";detail:string}>;daily:Array<{day:string;total:number;success:number;errors:number}>;models:Array<{provider:string;model:string;requests:number;success:number;successRate:number}>;recentErrors:Array<{action:string;provider:string;model:string;detail:string;createdAt:string}>};
type AiUseCase={id:string;name:string;purpose:string;owner:string;dataClassification:string;impactLevel:string;decisionRole:string;controls:string[];status:"draft"|"approved"|"suspended";reviewDate:string;createdBy:string;approvedBy:string|null;decisionNote:string|null};
type EvalRun={id:string;status:string;score:number;provider:string;model:string;latencyMs:number;failureReason:string;runBy:string;createdAt:string};
type EvalCase={id:string;name:string;input:string;expectedTerms:string[];forbiddenTerms:string[];maxLatencyMs:number;enabled:boolean;lastRun:EvalRun|null;history:EvalRun[];scoreDelta:number;trend:"new"|"stable"|"improved"|"regressed"};
type EvalEdit={id:string;name:string;input:string;expectedTerms:string;forbiddenTerms:string;maxLatencyMs:number;enabled:boolean};
type ProviderHealth={profile:string;provider:string;model:string;operation:string;status:string;latency_ms:number;detail:string;created_at:string};
type DraftEdit = { id:string;title:string;rationale:string;payload:Record<string,string> };
type PublishTarget = { id:string;module:string;title:string };
type ProviderForm = {
  provider: "openai-compatible" | "ollama";
  baseUrl: string;
  model: string;
  enabled: boolean;
  temperature: number;
  timeoutMs: number;
  maxTokens: number;
  secret: string;
  hasSecret: boolean;
  trustZone:"external"|"private"|"local";
  maxDataClassification:"Public"|"Internal"|"Confidential";
  fallback:{provider:"openai-compatible"|"ollama";baseUrl:string;model:string;enabled:boolean;secret:string;hasSecret:boolean;trustZone:"external"|"private"|"local";maxDataClassification:"Public"|"Internal"|"Confidential"};
};

const defaults: ProviderForm = {
  provider: "openai-compatible",
  baseUrl: "",
  model: "",
  enabled: false,
  temperature: 0.2,
  timeoutMs: 60000,
  maxTokens: 1200,
  secret: "",
  hasSecret: false,
  trustZone:"external",
  maxDataClassification:"Internal",
  fallback:{provider:"ollama",baseUrl:"",model:"",enabled:false,secret:"",hasSecret:false,trustZone:"private",maxDataClassification:"Confidential"},
};

const draftFieldLabels: Record<string,string> = {
  title:"Başlık",riskStatement:"Risk ifadesi",proposedTreatment:"Önerilen tedavi",owner:"Sorumlu",dueDate:"Hedef tarih",
  priority:"Öncelik",condition:"Mevcut durum",criteria:"Kriter",impact:"Etki",recommendation:"Öneri",severity:"Önem seviyesi",
  description:"Açıklama",acceptanceCriteria:"Kabul kriteri",
};
const csvCell=(value:unknown)=>{const text=String(value??""),safe=/^[=+\-@]/.test(text)?`'${text}`:text;return `"${safe.replace(/"/g,'""')}"`;};

export default function FornostAiCopilot() {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"chat" | "agents" | "knowledge" | "drafts" | "metrics" | "governance" | "settings" | "audit">("chat");
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [provider, setProvider] = useState<ProviderForm>(defaults);
  const [providerLoaded, setProviderLoaded] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditBusy, setAuditBusy] = useState(false);
  const [drafts, setDrafts] = useState<AiDraft[]>([]);
  const [draftKind, setDraftKind] = useState<DraftKind>("risk-treatment");
  const [draftInstruction, setDraftInstruction] = useState("");
  const [draftBusy, setDraftBusy] = useState(false);
  const [draftEdit, setDraftEdit] = useState<DraftEdit | null>(null);
  const [reviewNotes, setReviewNotes] = useState<Record<string,string>>({});
  const [publishDraftId, setPublishDraftId] = useState<string|null>(null);
  const [publishTargets, setPublishTargets] = useState<PublishTarget[]>([]);
  const [publishTargetId, setPublishTargetId] = useState("");
  const [publishNote, setPublishNote] = useState("");
  const [publishConfirmation, setPublishConfirmation] = useState("");
  const [ticketDraftId, setTicketDraftId] = useState<string|null>(null);
  const [ticketNote, setTicketNote] = useState("");
  const [ticketConfirmation, setTicketConfirmation] = useState("");
  const [metrics, setMetrics] = useState<AiMetrics|null>(null);
  const [metricWindow,setMetricWindow]=useState<7|30|90>(7);
  const [discoveredModels, setDiscoveredModels] = useState<string[]>([]);
  const [selectedModelAvailable, setSelectedModelAvailable] = useState<boolean|null>(null);
  const [useCases,setUseCases]=useState<AiUseCase[]>([]);
  const [evalCases,setEvalCases]=useState<EvalCase[]>([]);
  const [providerHealth,setProviderHealth]=useState<ProviderHealth[]>([]);
  const [governanceBusy,setGovernanceBusy]=useState(false);
  const [governanceView,setGovernanceView]=useState<"inventory"|"evaluations"|"health">("inventory");
  const [useCaseForm,setUseCaseForm]=useState({name:"",purpose:"",owner:"",dataClassification:"Confidential",impactLevel:"High",decisionRole:"Human-approved",controls:"Human review, RBAC, audit logging",reviewDate:""});
  const [evalForm,setEvalForm]=useState({name:"",input:"",expectedTerms:"",forbiddenTerms:"secret,password,token",maxLatencyMs:30000});
  const [evalEdit,setEvalEdit]=useState<EvalEdit|null>(null);
  const [decision,setDecision]=useState<{id:string;status:"approved"|"suspended";note:string;confirmation:string}|null>(null);
  const [agentRuns,setAgentRuns]=useState<AgentRun[]>([]);
  const [agentKind,setAgentKind]=useState<AgentKind>("risk");
  const [agentObjective,setAgentObjective]=useState("");
  const [agentBusy,setAgentBusy]=useState(false);
  const [agentDecision,setAgentDecision]=useState<AgentDecision|null>(null);
  const [agentConversion,setAgentConversion]=useState<AgentConversion|null>(null);

  const refreshStatus = useCallback(async () => {
    const response = await fetch(withBasePath("/api/ai/status"), { cache: "no-store" }).catch(() => null);
    if (!response?.ok) return;
    setStatus(await response.json());
  }, []);

  const refreshIdentity = useCallback(async () => {
    const response = await fetch(withBasePath("/api/auth"), { cache: "no-store" }).catch(() => null);
    if (!response?.ok) {
      setUser(null);
      return;
    }
    const body = await response.json().catch(() => ({}));
    const nextUser = body.authenticated ? body.user as User : null;
    setUser(nextUser);
    if (nextUser) await refreshStatus();
  }, [refreshStatus]);

  const loadProvider = useCallback(async () => {
    if (user?.role !== "Admin") return;
    const response = await fetch(withBasePath("/api/ai/providers"), { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setNotice(body.error || "AI ayarları okunamadı.");
      return;
    }
    setProvider({ ...defaults, ...body, secret: "",fallback:{...defaults.fallback,...(body.fallback||{}),secret:""} });
    setProviderLoaded(true);
  }, [user?.role]);

  const loadAudit = useCallback(async () => {
    if (user?.role !== "Admin") return;
    setAuditBusy(true);
    const response = await fetch(withBasePath("/api/ai/audit?limit=40"), { cache: "no-store" }).catch(() => null);
    if (response?.ok) {
      const body = await response.json().catch(() => ({}));
      setAuditLogs(Array.isArray(body.logs) ? body.logs : []);
    }
    setAuditBusy(false);
  }, [user?.role]);

  const loadDrafts = useCallback(async () => {
    const response = await fetch(withBasePath("/api/ai/drafts"), { cache: "no-store" }).catch(() => null);
    if (!response?.ok) return;
    const body = await response.json().catch(() => ({}));
    setDrafts(Array.isArray(body.drafts) ? body.drafts : []);
  }, []);

  const loadMetrics = useCallback(async (days:7|30|90=metricWindow) => {
    if(user?.role!=="Admin")return;
    const response=await fetch(withBasePath(`/api/ai/metrics?days=${days}`),{cache:"no-store"}).catch(()=>null);
    if(response?.ok)setMetrics(await response.json());
  },[user?.role,metricWindow]);

  const loadGovernance=useCallback(async()=>{
    if(user?.role!=="Admin")return;setGovernanceBusy(true);
    const [governanceResponse,evaluationResponse]=await Promise.all([fetch(withBasePath("/api/ai/governance"),{cache:"no-store"}).catch(()=>null),fetch(withBasePath("/api/ai/evaluations"),{cache:"no-store"}).catch(()=>null)]);
    if(governanceResponse?.ok){const body=await governanceResponse.json();setUseCases(Array.isArray(body.useCases)?body.useCases:[]);setProviderHealth(Array.isArray(body.health)?body.health:[]);}
    if(evaluationResponse?.ok){const body=await evaluationResponse.json();setEvalCases(Array.isArray(body.cases)?body.cases:[]);}
    setGovernanceBusy(false);
  },[user?.role]);

  const loadAgents=useCallback(async()=>{
    const response=await fetch(withBasePath("/api/ai/agents"),{cache:"no-store"}).catch(()=>null);
    if(response?.ok){const body=await response.json().catch(()=>({}));setAgentRuns(Array.isArray(body.runs)?body.runs:[]);}
  },[]);

  useEffect(() => {
    const first = window.setTimeout(() => { void refreshIdentity(); }, 0);
    const timer = window.setInterval(() => { void refreshIdentity(); }, 60000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [refreshIdentity]);

  useEffect(() => {
    if (!(open && user?.role === "Admin" && !providerLoaded)) return;
    const timer = window.setTimeout(() => { void loadProvider(); }, 0);
    return () => window.clearTimeout(timer);
  }, [open, user?.role, providerLoaded, loadProvider]);

  async function send(e: FormEvent) {
    e.preventDefault();
    const value = question.trim();
    if (!value || busy || !status?.enabled) return;
    const history = messages.slice(-6).map(({ role, content }) => ({ role, content }));
    setMessages((items) => [...items, { role: "user", content: value }]);
    setQuestion("");
    setBusy(true);
    setNotice("");
    const response = await fetch(withBasePath("/api/ai/chat"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: value, history }),
    }).catch(() => null);
    if (!response) {
      setMessages((items) => [...items, { role: "assistant", content: "AI servisine ulaşılamadı." }]);
      setBusy(false);
      return;
    }
    const body = await response.json().catch(() => ({}));
    setMessages((items) => [...items, {
      role: "assistant",
      content: response.ok ? String(body.answer || "Yanıt alınamadı.") : String(body.error || "AI isteği başarısız."),
      sources: response.ok && Array.isArray(body.sources) ? body.sources : [],
      citationIntegrity: response.ok && body.citationIntegrity ? body.citationIntegrity : undefined,
    }]);
    setBusy(false);
  }

  async function saveProvider(testAfter = false) {
    if (user?.role !== "Admin" || busy) return;
    setBusy(true);
    setNotice("");
    const response = await fetch(withBasePath("/api/ai/providers"), {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(provider),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setNotice(body.error || "AI ayarları kaydedilemedi.");
      setBusy(false);
      return;
    }
    setProvider((value) => ({ ...value, secret: "", hasSecret: body.hasSecret === true,fallback:{...value.fallback,secret:"",hasSecret:body.fallbackHasSecret===true} }));
    setNotice("AI sağlayıcı ayarları kaydedildi.");
    await refreshStatus();
    if (testAfter) {
      const testResponse = await fetch(withBasePath("/api/ai/providers"), { method: "POST" });
      const testBody = await testResponse.json().catch(() => ({}));
      setNotice(testResponse.ok ? String(testBody.message || "Bağlantı testi başarılı.") : String(testBody.error || testBody.message || "Bağlantı testi başarısız."));
      setDiscoveredModels(testResponse.ok&&Array.isArray(testBody.models)?testBody.models:[]);
      setSelectedModelAvailable(testResponse.ok&&typeof testBody.selectedModelAvailable==="boolean"?testBody.selectedModelAvailable:null);
    }
    await loadAudit();
    setBusy(false);
  }

  async function createDraft(e: FormEvent) {
    e.preventDefault();
    if (draftBusy || !aiReady || user?.role === "Viewer" || draftInstruction.trim().length < 4) return;
    setDraftBusy(true); setNotice("");
    const response = await fetch(withBasePath("/api/ai/drafts"), {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: draftKind, instruction: draftInstruction.trim() }),
    }).catch(() => null);
    const body = await response?.json().catch(() => ({})) || {};
    if (!response?.ok) setNotice(String(body.error || "AI taslağı üretilemedi."));
    else { setDraftInstruction(""); setNotice("AI taslağı insan incelemesine gönderildi."); await loadDrafts(); }
    setDraftBusy(false);
  }

  async function saveDraftEdit() {
    if (!draftEdit || draftBusy) return;
    setDraftBusy(true); setNotice("");
    const response = await fetch(withBasePath("/api/ai/drafts"), {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(draftEdit),
    });
    const body = await response.json().catch(() => ({}));
    if (response.ok) { setDraftEdit(null); setNotice("Taslak güncellendi ve revizyon geçmişine kaydedildi."); }
    else setNotice(String(body.error || "Taslak güncellenemedi."));
    await loadDrafts(); setDraftBusy(false);
  }

  async function reviewDraft(id: string, status: "approved" | "rejected") {
    if (user?.role !== "Admin" || draftBusy) return;
    const note = (reviewNotes[id] || "").trim();
    if (note.length < 5) { setNotice("Onay veya ret için en az 5 karakterlik inceleme notu yazın."); return; }
    setDraftBusy(true); setNotice("");
    const response = await fetch(withBasePath("/api/ai/drafts"), {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, status, note }),
    });
    const body = await response.json().catch(() => ({}));
    setNotice(response.ok ? `Taslak ${status === "approved" ? "onaylandı" : "reddedildi"}; canlı GRC kaydı değiştirilmedi.` : String(body.error || "Taslak kararı kaydedilemedi."));
    if (response.ok) setReviewNotes((notes) => { const next={...notes}; delete next[id]; return next; });
    await loadDrafts(); setDraftBusy(false);
  }

  async function preparePublication(draft: AiDraft) {
    if (user?.role !== "Admin" || draft.publication || draft.kind === "remediation-task") return;
    setDraftBusy(true); setNotice("");
    const response = await fetch(withBasePath(`/api/ai/drafts/targets?kind=${encodeURIComponent(draft.kind)}`), { cache:"no-store" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) setNotice(String(body.error || "Hedef kayıtlar yüklenemedi."));
    else {
      const targets = Array.isArray(body.targets) ? body.targets as PublishTarget[] : [];
      setPublishTargets(targets); setPublishTargetId(targets[0]?.id || ""); setPublishDraftId(draft.id);
      setPublishNote(""); setPublishConfirmation("");
    }
    setDraftBusy(false);
  }

  async function publishDraft() {
    if (!publishDraftId || !publishTargetId || publishNote.trim().length < 5 || publishConfirmation !== "YAYINLA" || draftBusy) return;
    setDraftBusy(true); setNotice("");
    const response = await fetch(withBasePath("/api/ai/drafts/publish"), {
      method:"POST", headers:{"content-type":"application/json"},
      body:JSON.stringify({id:publishDraftId,targetRecordId:publishTargetId,note:publishNote.trim(),confirmation:publishConfirmation}),
    });
    const body = await response.json().catch(() => ({}));
    if (response.ok) { setNotice(`Taslak ${body.publication?.module || "GRC"} kaydına yayınlandı.`); setPublishDraftId(null); await loadDrafts(); }
    else setNotice(String(body.error || "Taslak yayınlanamadı."));
    setDraftBusy(false);
  }

  async function createTicketFromDraft(){
    if(!ticketDraftId||ticketNote.trim().length<5||ticketConfirmation!=="OLUŞTUR"||draftBusy)return;
    setDraftBusy(true);setNotice("");
    const response=await fetch(withBasePath("/api/ai/drafts/ticket"),{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({id:ticketDraftId,note:ticketNote.trim(),confirmation:ticketConfirmation})});
    const body=await response.json().catch(()=>({}));
    if(response.ok){setNotice(`${body.ticket?.provider||"Ticket"} kaydı oluşturuldu: ${body.ticket?.externalId||"created"}`);setTicketDraftId(null);setTicketNote("");setTicketConfirmation("");await loadDrafts();await loadMetrics();}
    else setNotice(String(body.error||"Ticket oluşturulamadı."));
    setDraftBusy(false);
  }

  async function createUseCase(e:FormEvent){
    e.preventDefault();if(governanceBusy)return;setGovernanceBusy(true);setNotice("");
    const response=await fetch(withBasePath("/api/ai/governance"),{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...useCaseForm,controls:useCaseForm.controls.split(",")})});const body=await response.json().catch(()=>({}));
    if(response.ok){setUseCaseForm(value=>({...value,name:"",purpose:""}));setNotice("AI kullanım senaryosu taslak envantere eklendi.");await loadGovernance();}else setNotice(String(body.error||"Kullanım senaryosu kaydedilemedi."));setGovernanceBusy(false);
  }

  async function decideUseCase(){
    if(!decision||decision.note.trim().length<5||decision.confirmation!==(decision.status==="approved"?"ONAYLA":"ASKIYA AL")||governanceBusy)return;setGovernanceBusy(true);
    const response=await fetch(withBasePath("/api/ai/governance"),{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify(decision)});const body=await response.json().catch(()=>({}));
    if(response.ok){setDecision(null);setNotice("AI kullanım senaryosu kararı denetim izine kaydedildi.");await loadGovernance();}else setNotice(String(body.error||"Karar kaydedilemedi."));setGovernanceBusy(false);
  }

  async function deleteUseCase(id:string){if(!window.confirm("Taslak AI kullanım senaryosu silinsin mi?"))return;setGovernanceBusy(true);const response=await fetch(withBasePath("/api/ai/governance"),{method:"DELETE",headers:{"content-type":"application/json"},body:JSON.stringify({id,confirmation:"SİL"})});if(response.ok)await loadGovernance();else{const body=await response.json().catch(()=>({}));setNotice(String(body.error||"Kayıt silinemedi."));}setGovernanceBusy(false);}

  async function createEvalCase(e:FormEvent){e.preventDefault();if(governanceBusy)return;setGovernanceBusy(true);const response=await fetch(withBasePath("/api/ai/evaluations"),{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...evalForm,expectedTerms:evalForm.expectedTerms.split(","),forbiddenTerms:evalForm.forbiddenTerms.split(",")})});const body=await response.json().catch(()=>({}));if(response.ok){setEvalForm(value=>({...value,name:"",input:"",expectedTerms:""}));setNotice("Model değerlendirme senaryosu eklendi.");await loadGovernance();}else setNotice(String(body.error||"Test kaydedilemedi."));setGovernanceBusy(false);}

  async function installEvaluationBaseline(){if(governanceBusy)return;setGovernanceBusy(true);setNotice("");const response=await fetch(withBasePath("/api/ai/evaluations"),{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"seed-baseline"})});const body=await response.json().catch(()=>({}));if(response.ok){setNotice(body.created?`${body.created} hazır güvenlik testi eklendi.`:"Hazır güvenlik testleri zaten güncel.");await loadGovernance();}else setNotice(String(body.error||"Hazır test paketi eklenemedi."));setGovernanceBusy(false);}

  async function runEvaluations(id?:string){if(governanceBusy)return;setGovernanceBusy(true);setNotice("Model değerlendirmesi çalışıyor…");const response=await fetch(withBasePath("/api/ai/evaluations"),{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"run",id})});const body=await response.json().catch(()=>({}));if(response.ok){const passed=(body.results||[]).filter((item:{status:string})=>item.status==="passed").length;setNotice(`${body.results?.length||0} test tamamlandı; ${passed} başarılı.`);await loadGovernance();await loadMetrics();}else setNotice(String(body.error||"Test çalıştırılamadı."));setGovernanceBusy(false);}

  function editEvalCase(item:EvalCase){setEvalEdit({id:item.id,name:item.name,input:item.input,expectedTerms:item.expectedTerms.join(", "),forbiddenTerms:item.forbiddenTerms.join(", "),maxLatencyMs:item.maxLatencyMs,enabled:item.enabled});}
  async function saveEvalCase(e:FormEvent){e.preventDefault();if(!evalEdit||governanceBusy)return;setGovernanceBusy(true);const response=await fetch(withBasePath("/api/ai/evaluations"),{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({...evalEdit,expectedTerms:evalEdit.expectedTerms.split(","),forbiddenTerms:evalEdit.forbiddenTerms.split(",")})});const body=await response.json().catch(()=>({}));if(response.ok){setEvalEdit(null);setNotice("Model testi güncellendi ve değişiklik denetim izine yazıldı.");await loadGovernance();await loadMetrics();}else setNotice(String(body.error||"Test güncellenemedi."));setGovernanceBusy(false);}
  async function toggleEvalCase(item:EvalCase){if(governanceBusy)return;setGovernanceBusy(true);const response=await fetch(withBasePath("/api/ai/evaluations"),{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({id:item.id,name:item.name,input:item.input,expectedTerms:item.expectedTerms,forbiddenTerms:item.forbiddenTerms,maxLatencyMs:item.maxLatencyMs,enabled:!item.enabled})});const body=await response.json().catch(()=>({}));if(response.ok){setNotice(item.enabled?"Test devre dışı bırakıldı.":"Test etkinleştirildi; hazırlık kontrolüne dahil edildi.");await loadGovernance();await loadMetrics();}else setNotice(String(body.error||"Test durumu değiştirilemedi."));setGovernanceBusy(false);}

  async function deleteEvalCase(id:string){if(!window.confirm("Değerlendirme senaryosu ve koşum geçmişi silinsin mi?"))return;setGovernanceBusy(true);const response=await fetch(withBasePath("/api/ai/evaluations"),{method:"DELETE",headers:{"content-type":"application/json"},body:JSON.stringify({id,confirmation:"SİL"})});if(response.ok)await loadGovernance();else{const body=await response.json().catch(()=>({}));setNotice(String(body.error||"Test silinemedi."));}setGovernanceBusy(false);}

  async function changeMetricWindow(days:7|30|90){setMetricWindow(days);setMetrics(null);await loadMetrics(days);}
  function downloadMetrics(){if(!metrics)return;const rows=[["Bölüm","Metrik","Değer"],["Dönem","Gün",metrics.windowDays],["Aktivite","Toplam",metrics.activity.total],["Aktivite","Başarı oranı",`%${metrics.activity.successRate}`],["Aktivite","Hata",metrics.activity.errors],["Provider","Başarı oranı",`%${metrics.providerHealth.successRate}`],["Provider","Ortalama gecikme",`${metrics.providerHealth.averageLatencyMs} ms`],["Yönetişim","Geciken kullanım senaryosu",metrics.governance.overdue],["Değerlendirme","Dönem başarı oranı",`%${metrics.governance.evaluationPassRate}`],["Değerlendirme","Etkin testlerin son koşumu",`${metrics.governance.evaluationCurrent.passed}/${metrics.governance.evaluationCurrent.total}`],["Bilgi tabanı","Onaylı",metrics.knowledge.approved],["Bilgi tabanı","Geciken inceleme",metrics.knowledge.stale],["Taslaklar","Bekleyen",metrics.drafts.pending],...metrics.controls.map(item=>["Kontrol",item.label,`${item.status}: ${item.detail}`])];const csv="\uFEFF"+rows.map(row=>row.map(csvCell).join(";")).join("\n"),url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"})),link=document.createElement("a");link.href=url;link.download=`fornost-ai-kalite-${metrics.windowDays}-gun.csv`;link.click();URL.revokeObjectURL(url);}
  function downloadEvaluationEvidence(){const rows:Array<Array<unknown>>=[["Test ID","Test adı","Etkin","Trend","Skor değişimi","Koşum ID","Durum","Skor","Provider","Model","Gecikme (ms)","Çalıştıran","Hata nedeni","Tarih"]];for(const item of evalCases){const history=item.history.length?item.history:[null];for(const run of history)rows.push([item.id,item.name,item.enabled?"Evet":"Hayır",item.trend,item.scoreDelta,run?.id||"",run?.status||"çalıştırılmadı",run?.score??"",run?.provider||"",run?.model||"",run?.latencyMs??"",run?.runBy||"",run?.failureReason||"",run?.createdAt||""]);}const csv="\uFEFF"+rows.map(row=>row.map(csvCell).join(";")).join("\n"),url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"})),link=document.createElement("a");link.href=url;link.download="fornost-ai-degerlendirme-kaniti.csv";link.click();URL.revokeObjectURL(url);}

  async function runAgent(e:FormEvent){
    e.preventDefault();if(agentBusy||user?.role==="Viewer"||agentObjective.trim().length<5)return;setAgentBusy(true);setNotice("Güvence agentı Fornost kayıtlarını analiz ediyor…");
    const response=await fetch(withBasePath("/api/ai/agents"),{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({kind:agentKind,objective:agentObjective.trim()})}).catch(()=>null);
    const body=await response?.json().catch(()=>({}))||{};
    if(response?.ok){setAgentObjective("");setNotice(`${body.run?.report?.findings?.length||0} kaynaklı bulgu üretildi; Admin incelemesi bekleniyor.`);await loadAgents();await loadMetrics();}else setNotice(String(body.error||"Agent çalıştırılamadı."));
    setAgentBusy(false);
  }

  async function reviewAgent(){
    if(!agentDecision||agentDecision.note.trim().length<5||agentDecision.confirmation!==(agentDecision.status==="approved"?"ONAYLA":"ARŞİVLE")||agentBusy)return;setAgentBusy(true);
    const response=await fetch(withBasePath("/api/ai/agents"),{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify(agentDecision)}).catch(()=>null);const body=await response?.json().catch(()=>({}))||{};
    if(response?.ok){setAgentDecision(null);setNotice(agentDecision.status==="approved"?"Agent raporu onaylandı; bulgular kontrollü taslağa dönüştürülebilir.":"Agent raporu arşivlendi.");await loadAgents();await loadMetrics();}else setNotice(String(body.error||"Agent kararı kaydedilemedi."));setAgentBusy(false);
  }

  async function convertAgentFinding(){
    if(!agentConversion||agentConversion.note.trim().length<5||agentConversion.confirmation!=="TASLAK OLUŞTUR"||agentBusy)return;setAgentBusy(true);
    const response=await fetch(withBasePath("/api/ai/agents/draft"),{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(agentConversion)}).catch(()=>null);const body=await response?.json().catch(()=>({}))||{};
    if(response?.ok){setNotice(`Bulgu ${body.draftId} numaralı insan onaylı taslak kuyruğuna aktarıldı.`);setAgentConversion(null);await loadAgents();await loadDrafts();await loadMetrics();}else setNotice(String(body.error||"Bulgu taslağa dönüştürülemedi."));setAgentBusy(false);
  }

  async function deleteAgentRun(id:string){if(!window.confirm("Bu başarısız veya arşivlenmiş agent çalışması silinsin mi?"))return;setAgentBusy(true);const response=await fetch(withBasePath("/api/ai/agents"),{method:"DELETE",headers:{"content-type":"application/json"},body:JSON.stringify({id,confirmation:"SİL"})}).catch(()=>null);if(response?.ok)await loadAgents();else{const body=await response?.json().catch(()=>({}))||{};setNotice(String(body.error||"Agent çalışması silinemedi."));}setAgentBusy(false);}

  if (!user) return null;
  const aiReady = status?.enabled === true;
  const activeTab = user.role !== "Admin" && (tab === "settings" || tab === "audit" || tab === "metrics" || tab === "governance") ? "chat" : tab;

  return <>
    <button className={`fornost-ai-launcher ${aiReady ? "ready" : ""}`} onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-controls="fornost-ai-panel">
      <span>✦</span><b>Ask Fornost</b><i>{aiReady ? "AI" : "OFF"}</i>
    </button>
    {open && <section id="fornost-ai-panel" className="fornost-ai-panel" aria-label="Fornost AI Copilot">
      <header className="fornost-ai-head">
        <div><small>FORNOST AI · READ-ONLY COPILOT</small><h2>Ask Fornost</h2><p>{status?.model || "AI sağlayıcısı bekleniyor"}</p></div>
        <button onClick={() => setOpen(false)} aria-label="Kapat">×</button>
      </header>
      <nav className="fornost-ai-tabs">
        <button className={activeTab === "chat" ? "active" : ""} onClick={() => setTab("chat")}>Copilot</button>
        <button className={activeTab === "agents" ? "active" : ""} onClick={() => { setTab("agents"); void loadAgents(); }}>Agentlar</button>
        <button className={activeTab === "knowledge" ? "active" : ""} onClick={() => setTab("knowledge")}>Bilgi Tabanı</button>
        <button className={activeTab === "drafts" ? "active" : ""} onClick={() => { setTab("drafts"); void loadDrafts(); }}>Taslaklar</button>
        {user.role === "Admin" && <button className={activeTab === "metrics" ? "active" : ""} onClick={() => { setTab("metrics"); void loadMetrics(); }}>Kalite</button>}
        {user.role === "Admin" && <button className={activeTab === "governance" ? "active" : ""} onClick={() => { setTab("governance"); void loadGovernance(); }}>Yönetişim</button>}
        {user.role === "Admin" && <button className={activeTab === "settings" ? "active" : ""} onClick={() => setTab("settings")}>AI Ayarları</button>}
        {user.role === "Admin" && <button className={activeTab === "audit" ? "active" : ""} onClick={() => { setTab("audit"); void loadAudit(); }}>AI Audit</button>}
      </nav>

      {activeTab === "chat" ? <>
        <div className="fornost-ai-mode"><span className={aiReady ? "online" : "offline"}/><b>{aiReady ? "Hazır" : "Devre dışı"}</b><em>{status?.provider || "Provider yok"}</em></div>
        <div className="fornost-ai-messages">
          {!messages.length && <div className="fornost-ai-welcome"><b>GRC verilerinizi sorun.</b><p>Örn: “Kritik varlıklardaki açık riskleri analiz et” veya “ISO 27001 denetimindeki en büyük boşluklar neler?”</p><small>Copilot yalnızca okur ve öneri üretir; kayıt değiştirmez.</small></div>}
          {messages.map((message, index) => <article key={index} className={`fornost-ai-message ${message.role}`}>
            <small>{message.role === "user" ? "SİZ" : "FORNOST AI"}</small>
            <div>{message.content}</div>
            {message.citationIntegrity&&<aside className={message.citationIntegrity.grounded?"grounded":"ungrounded"}>{message.citationIntegrity.grounded?`${message.citationIntegrity.cited} doğrulanmış citation`:"Citation doğrulaması gerekli"}{message.citationIntegrity.invalidRemoved>0&&` · ${message.citationIntegrity.invalidRemoved} geçersiz referans kaldırıldı`}</aside>}
            {!!message.sources?.length && <footer>{message.sources.slice(0, 12).map((source) => <span key={source.id} title={`${source.module} · ${source.title}`}>{source.id}</span>)}</footer>}
          </article>)}
          {busy && activeTab === "chat" && <div className="fornost-ai-thinking">Fornost verileri analiz ediliyor…</div>}
        </div>
        <form className="fornost-ai-compose" onSubmit={send}>
          <textarea value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={4000} rows={3} placeholder={aiReady ? "Risk, BIA, varlık, uyum, kanıt veya denetim hakkında sorun…" : "Ask Fornost > AI Ayarları bölümünden sağlayıcıyı etkinleştirin."} disabled={!aiReady || busy}/>
          <div><small>{question.length}/4000</small><button disabled={!aiReady || busy || !question.trim()}>Gönder</button></div>
        </form>
      </> : activeTab === "agents" ? <FornostAiAgents role={user.role} aiReady={aiReady} runs={agentRuns} kind={agentKind} setKind={setAgentKind} objective={agentObjective} setObjective={setAgentObjective} busy={agentBusy} notice={notice} decision={agentDecision} setDecision={setAgentDecision} conversion={agentConversion} setConversion={setAgentConversion} onRun={runAgent} onReview={reviewAgent} onConvert={convertAgentFinding} onDelete={deleteAgentRun} onReload={()=>void loadAgents()}/>
      : activeTab === "knowledge" ? <FornostAiKnowledge role={user.role} actor={user.email}/>
      : activeTab === "drafts" ? <div className="fornost-ai-drafts">
        <div className="fornost-ai-security-note"><b>İnsan onaylı AI taslakları</b><p>AI yalnız yapılandırılmış bir öneri üretir. Onay veya ret kararı denetim izine yazılır; bu sürüm canlı GRC kayıtlarını otomatik değiştirmez.</p></div>
        {user.role !== "Viewer" && <form className="fornost-ai-draft-form" onSubmit={createDraft}>
          <label><span>Taslak türü</span><select value={draftKind} onChange={(e) => setDraftKind(e.target.value as DraftKind)}><option value="risk-treatment">Risk tedavi planı</option><option value="audit-finding">Denetim bulgusu</option><option value="remediation-task">İyileştirme görevi</option></select></label>
          <label><span>Amaç / talimat</span><textarea rows={3} maxLength={2400} value={draftInstruction} onChange={(e) => setDraftInstruction(e.target.value)} placeholder="Örn: Kritik varlıklardaki yüksek riskler için sahip ve hedef tarih içeren tedavi taslağı oluştur."/></label>
          <button disabled={draftBusy || !aiReady || draftInstruction.trim().length < 4}>{draftBusy ? "Üretiliyor…" : "AI Taslağı Oluştur"}</button>
        </form>}
        {notice && <div className="fornost-ai-notice">{notice}</div>}
        <div className="fornost-ai-draft-head"><b>Taslak kuyruğu</b><button onClick={() => void loadDrafts()} disabled={draftBusy}>Yenile</button></div>
        {!drafts.length && <div className="fornost-ai-audit-empty">Henüz AI taslağı yok.</div>}
        <div className="fornost-ai-draft-list">{drafts.map((draft) => <article key={draft.id}>
          <header><div><small>{draft.kind}</small><b>{draft.title}</b></div><span className={draft.status}>{draft.status}</span></header>
          {draftEdit?.id === draft.id ? <div className="fornost-ai-draft-editor">
            <label><span>Başlık</span><input maxLength={180} value={draftEdit.title} onChange={(e) => setDraftEdit((value) => value ? {...value,title:e.target.value} : value)}/></label>
            <label><span>Gerekçe</span><textarea rows={3} maxLength={1200} value={draftEdit.rationale} onChange={(e) => setDraftEdit((value) => value ? {...value,rationale:e.target.value} : value)}/></label>
            {Object.entries(draftEdit.payload).map(([key,value]) => <label key={key}><span>{draftFieldLabels[key] || key}</span><textarea rows={key === "description" || key === "recommendation" || key === "acceptanceCriteria" ? 3 : 1} value={value} onChange={(e) => setDraftEdit((current) => current ? {...current,payload:{...current.payload,[key]:e.target.value}} : current)}/></label>)}
            <div><button type="button" className="reject" onClick={() => setDraftEdit(null)}>Vazgeç</button><button type="button" onClick={() => void saveDraftEdit()} disabled={draftBusy}>Değişiklikleri Kaydet</button></div>
          </div> : <><p>{draft.rationale}</p><dl>{Object.entries(draft.payload).map(([key,value]) => <div key={key}><dt>{draftFieldLabels[key] || key}</dt><dd>{value}</dd></div>)}</dl></>}
          {!!draft.sourceRefs.length && <footer>{draft.sourceRefs.slice(0,8).map((ref) => <span key={ref}>{ref}</span>)}</footer>}
          <small>{draft.createdBy} · {new Date(draft.createdAt).toLocaleString("tr-TR")}</small>
          {draft.reviewedBy && <div className="fornost-ai-review-result"><b>{draft.reviewedBy}</b><span>{draft.reviewNote}</span></div>}
          {draft.publication && <div className="fornost-ai-publication-result"><b>Yayınlandı · {draft.publication.module}</b><span>{draft.publication.recordId}</span><small>{draft.publication.publishedBy} · {new Date(draft.publication.publishedAt).toLocaleString("tr-TR")}</small><p>{draft.publication.note}</p></div>}
          {draft.ticket && <div className={`fornost-ai-ticket-result ${draft.ticket.status}`}><b>{draft.ticket.status === "created" ? "Ticket oluşturuldu" : "Ticket işlemi kilitlendi"} · {draft.ticket.provider||"entegrasyon"}</b>{draft.ticket.url?<a href={draft.ticket.url} target="_blank" rel="noreferrer">{draft.ticket.externalId||"Ticket'ı aç"}</a>:<span>{draft.ticket.externalId||draft.ticket.error}</span>}<small>{draft.ticket.createdBy} · {new Date(draft.ticket.createdAt).toLocaleString("tr-TR")}</small></div>}
          {draft.status === "pending" && draftEdit?.id !== draft.id && user.role !== "Viewer" && (user.role === "Admin" || draft.createdBy === user.email) && <button type="button" className="fornost-ai-edit-button" onClick={() => setDraftEdit({id:draft.id,title:draft.title,rationale:draft.rationale,payload:{...draft.payload}})}>Taslağı Düzenle</button>}
          {draft.status === "pending" && user.role === "Admin" && draftEdit?.id !== draft.id && <div className="fornost-ai-review-box"><textarea rows={2} maxLength={800} value={reviewNotes[draft.id] || ""} onChange={(e) => setReviewNotes((notes) => ({...notes,[draft.id]:e.target.value}))} placeholder="Zorunlu inceleme notu…"/><div className="fornost-ai-draft-actions"><button type="button" className="reject" disabled={draftBusy || (reviewNotes[draft.id] || "").trim().length < 5} onClick={() => void reviewDraft(draft.id,"rejected")}>Reddet</button><button type="button" disabled={draftBusy || (reviewNotes[draft.id] || "").trim().length < 5} onClick={() => void reviewDraft(draft.id,"approved")}>Taslağı Onayla</button></div></div>}
          {draft.status === "approved" && !draft.publication && user.role === "Admin" && draft.kind !== "remediation-task" && publishDraftId !== draft.id && <button type="button" className="fornost-ai-publish-button" disabled={draftBusy} onClick={() => void preparePublication(draft)}>Hedef Kayda Yayınla</button>}
          {draft.status === "approved" && draft.kind === "remediation-task" && !draft.ticket && user.role === "Admin" && ticketDraftId !== draft.id && <button type="button" className="fornost-ai-publish-button" disabled={draftBusy} onClick={()=>{setTicketDraftId(draft.id);setTicketNote("");setTicketConfirmation("");}}>Entegrasyonda Ticket Oluştur</button>}
          {ticketDraftId===draft.id&&<div className="fornost-ai-publish-box"><b>Kontrollü ticket yayını</b><label><span>Yayın açıklaması</span><textarea rows={2} maxLength={800} value={ticketNote} onChange={(e)=>setTicketNote(e.target.value)} placeholder="Ticket'ın neden oluşturulduğunu açıklayın…"/></label><label><span>Onay metni</span><input value={ticketConfirmation} onChange={(e)=>setTicketConfirmation(e.target.value)} placeholder="OLUŞTUR"/></label><small>Etkin ticket entegrasyonunda tek kayıt oluşturulur. Tekrar oynatma koruması çift ticket oluşmasını engeller.</small><div><button type="button" className="reject" onClick={()=>setTicketDraftId(null)}>Vazgeç</button><button type="button" disabled={draftBusy||ticketNote.trim().length<5||ticketConfirmation!=="OLUŞTUR"} onClick={()=>void createTicketFromDraft()}>Ticket Oluştur</button></div></div>}
          {publishDraftId === draft.id && <div className="fornost-ai-publish-box"><b>Kontrollü yayın</b><label><span>Hedef kayıt</span><select value={publishTargetId} onChange={(e) => setPublishTargetId(e.target.value)}>{publishTargets.map((target) => <option key={target.id} value={target.id}>{target.id} · {target.title}</option>)}</select></label><label><span>Yayın açıklaması</span><textarea rows={2} maxLength={800} value={publishNote} onChange={(e) => setPublishNote(e.target.value)} placeholder="Bu taslağın neden bu kayda uygulandığını açıklayın…"/></label><label><span>Onay metni</span><input value={publishConfirmation} onChange={(e) => setPublishConfirmation(e.target.value)} placeholder="YAYINLA"/></label><small>Bu işlem seçilen canlı GRC kaydını günceller ve geri izlenebilir yayın kaydı oluşturur.</small><div><button type="button" className="reject" onClick={() => setPublishDraftId(null)}>Vazgeç</button><button type="button" disabled={draftBusy || !publishTargetId || publishNote.trim().length < 5 || publishConfirmation !== "YAYINLA"} onClick={() => void publishDraft()}>Canlı Kayda Uygula</button></div></div>}
        </article>)}</div>
      </div> : activeTab === "metrics" ? <div className="fornost-ai-metrics">
        <div className="fornost-ai-security-note"><b>AI kalite ve yönetişim özeti</b><p>Seçilen dönemin çağrı, provider, test ve kontrollü çıktı sonuçları gösterilir. Ham prompt ve cevaplar tutulmaz.</p></div>
        <div className="fornost-ai-metric-toolbar"><div>{([7,30,90] as const).map(days=><button key={days} className={metricWindow===days?"active":""} onClick={()=>void changeMetricWindow(days)}>{days} gün</button>)}</div><button disabled={!metrics} onClick={downloadMetrics}>CSV İndir</button></div>
        {!metrics?<div className="fornost-ai-audit-empty">Metrikler yükleniyor…</div>:<>
          <div className="fornost-ai-metric-grid"><article><b>%{metrics.activity.successRate}</b><span>Çağrı başarısı</span></article><article><b>%{metrics.providerHealth.successRate}</b><span>Provider sağlığı</span></article><article><b>{metrics.activity.averageLatencyMs} ms</b><span>Ort. gecikme</span></article><article><b>{metrics.outputs.recordPublications+metrics.outputs.ticketsCreated}</b><span>Kontrollü çıktı</span></article></div>
          <div className="fornost-ai-control-readiness"><b>Kontrol hazırlığı</b>{metrics.controls.map(control=><article key={control.id} className={control.status}><span/><div><b>{control.label}</b><small>{control.detail}</small></div></article>)}</div>
          <div className="fornost-ai-metric-section"><b>Yönetişim ve bilgi tabanı</b><p>{metrics.governance.approved}/{metrics.governance.total} onaylı kullanım senaryosu<span>{metrics.governance.overdue} inceleme gecikmiş</span></p><p>{metrics.governance.evaluationRuns} dönemsel model koşumu<span>%{metrics.governance.evaluationPassRate} başarılı</span></p><p>{metrics.governance.evaluationCurrent.passed}/{metrics.governance.evaluationCurrent.total} etkin test güncel durumda başarılı<span>{metrics.governance.evaluationCurrent.failing} başarısız · {metrics.governance.evaluationCurrent.untested} çalıştırılmamış</span></p><p>{metrics.knowledge.approved}/{metrics.knowledge.total} onaylı bilgi kaynağı<span>{metrics.knowledge.stale} gecikmiş · {metrics.knowledge.drafts} taslak</span></p><p>{metrics.agents.runs} agent çalışması<span>{metrics.agents.approved} onay · {metrics.agents.draftsCreated} taslak</span></p><p>Yedek sağlayıcı devreye girişi<span>{metrics.governance.fallbackActivations}</span></p></div>
          <div className="fornost-ai-metric-section"><b>{metrics.windowDays} günlük operasyon</b><p>{metrics.activity.total} işlem · {metrics.activity.errors} hata · {metrics.activity.denied} engellenen · {metrics.drafts.pending} bekleyen taslak</p>{metrics.daily.map(day=><div className="fornost-ai-day" key={day.day}><span>{day.day}</span><i style={{width:`${Math.max(3,day.total*100/Math.max(1,...metrics.daily.map(item=>item.total)))}%`}}/><b>{day.success}/{day.total}</b></div>)}</div>
          <div className="fornost-ai-metric-section"><b>Model kullanımı</b>{metrics.models.length?metrics.models.map(item=><p key={`${item.provider}:${item.model}`}>{item.provider} · {item.model}<span>%{item.successRate} · {item.success}/{item.requests}</span></p>):<p>Bu dönemde model çağrısı yok.</p>}</div>
          {!!metrics.recentErrors.length&&<div className="fornost-ai-recent-errors"><b>Son hatalar</b>{metrics.recentErrors.map((item,index)=><article key={`${item.createdAt}-${index}`}><header><b>{item.action}</b><time>{new Date(item.createdAt).toLocaleString("tr-TR")}</time></header><p>{item.detail}</p><small>{item.provider} · {item.model}</small></article>)}</div>}
          <button className="fornost-ai-refresh" onClick={()=>void loadMetrics()}>Metrikleri Yenile</button>
        </>}
      </div> : activeTab === "governance" ? <div className="fornost-ai-governance">
        <div className="fornost-ai-security-note"><b>AI Governance merkezi</b><p>Kullanım senaryolarını risk sınıfıyla yönetin, modelleri tekrarlanabilir testlerle ölçün ve provider health/failover geçmişini izleyin.</p></div>
        <div className="fornost-ai-governance-tabs"><button className={governanceView==="inventory"?"active":""} onClick={()=>setGovernanceView("inventory")}>Envanter</button><button className={governanceView==="evaluations"?"active":""} onClick={()=>setGovernanceView("evaluations")}>Değerlendirme</button><button className={governanceView==="health"?"active":""} onClick={()=>setGovernanceView("health")}>Provider Health</button></div>
        {notice&&<div className="fornost-ai-notice">{notice}</div>}
        {governanceView==="inventory"?<><form className="fornost-ai-governance-form" onSubmit={createUseCase}><b>Yeni kullanım senaryosu</b><label><span>Ad</span><input maxLength={160} value={useCaseForm.name} onChange={e=>setUseCaseForm(value=>({...value,name:e.target.value}))}/></label><label><span>Amaç</span><textarea rows={3} maxLength={1600} value={useCaseForm.purpose} onChange={e=>setUseCaseForm(value=>({...value,purpose:e.target.value}))}/></label><div><label><span>Sorumlu</span><input maxLength={320} value={useCaseForm.owner} onChange={e=>setUseCaseForm(value=>({...value,owner:e.target.value}))}/></label><label><span>Gözden geçirme</span><input type="date" value={useCaseForm.reviewDate} onChange={e=>setUseCaseForm(value=>({...value,reviewDate:e.target.value}))}/></label></div><div><label><span>Veri sınıfı</span><select value={useCaseForm.dataClassification} onChange={e=>setUseCaseForm(value=>({...value,dataClassification:e.target.value}))}><option>Public</option><option>Internal</option><option>Confidential</option><option>Restricted</option></select></label><label><span>Etki</span><select value={useCaseForm.impactLevel} onChange={e=>setUseCaseForm(value=>({...value,impactLevel:e.target.value}))}><option>Low</option><option>Medium</option><option>High</option><option>Critical</option></select></label></div><label><span>Karar rolü</span><select value={useCaseForm.decisionRole} onChange={e=>setUseCaseForm(value=>({...value,decisionRole:e.target.value}))}><option>Assistive</option><option>Human-reviewed</option><option>Human-approved</option><option>Prohibited</option></select></label><label><span>Kontroller (virgülle)</span><input maxLength={1000} value={useCaseForm.controls} onChange={e=>setUseCaseForm(value=>({...value,controls:e.target.value}))}/></label><button disabled={governanceBusy}>Taslak Ekle</button></form><div className="fornost-ai-governance-list">{useCases.map(item=><article key={item.id}><header><div><b>{item.name}</b><small>{item.id}</small></div><span className={item.status}>{item.status}</span></header><p>{item.purpose}</p><dl><div><dt>Sorumlu</dt><dd>{item.owner}</dd></div><div><dt>Risk</dt><dd>{item.dataClassification} · {item.impactLevel}</dd></div><div><dt>Karar</dt><dd>{item.decisionRole}</dd></div><div><dt>Review</dt><dd>{item.reviewDate}</dd></div></dl><footer>{item.controls.map(control=><span key={control}>{control}</span>)}</footer>{item.decisionNote&&<em>{item.approvedBy} · {item.decisionNote}</em>}<div className="fornost-ai-governance-actions">{item.status!=="approved"&&<button onClick={()=>setDecision({id:item.id,status:"approved",note:"",confirmation:""})}>Onayla</button>}{item.status!=="suspended"&&<button className="warn" onClick={()=>setDecision({id:item.id,status:"suspended",note:"",confirmation:""})}>Askıya Al</button>}{item.status==="draft"&&<button className="danger" onClick={()=>void deleteUseCase(item.id)}>Sil</button>}</div>{decision?.id===item.id&&<div className="fornost-ai-decision"><textarea rows={2} maxLength={800} placeholder="Zorunlu karar notu" value={decision.note} onChange={e=>setDecision(value=>value?{...value,note:e.target.value}:value)}/><input placeholder={decision.status==="approved"?"ONAYLA":"ASKIYA AL"} value={decision.confirmation} onChange={e=>setDecision(value=>value?{...value,confirmation:e.target.value}:value)}/><div><button onClick={()=>setDecision(null)}>Vazgeç</button><button disabled={governanceBusy} onClick={()=>void decideUseCase()}>Kararı Kaydet</button></div></div>}</article>)}</div></>:governanceView==="evaluations"?<><form className="fornost-ai-governance-form" onSubmit={createEvalCase}><b>Yeni model testi</b><label><span>Test adı</span><input maxLength={160} value={evalForm.name} onChange={e=>setEvalForm(value=>({...value,name:e.target.value}))}/></label><label><span>Test girdisi</span><textarea rows={3} maxLength={2000} value={evalForm.input} onChange={e=>setEvalForm(value=>({...value,input:e.target.value}))}/></label><label><span>Beklenen terimler (virgülle)</span><input value={evalForm.expectedTerms} onChange={e=>setEvalForm(value=>({...value,expectedTerms:e.target.value}))}/></label><label><span>Yasaklı terimler (virgülle)</span><input value={evalForm.forbiddenTerms} onChange={e=>setEvalForm(value=>({...value,forbiddenTerms:e.target.value}))}/></label><label><span>Maksimum gecikme (ms)</span><input type="number" min="1000" max="120000" value={evalForm.maxLatencyMs} onChange={e=>setEvalForm(value=>({...value,maxLatencyMs:Number(e.target.value)}))}/></label><button disabled={governanceBusy}>Test Ekle</button></form><div className="fornost-ai-run-all"><b>Değerlendirme paketi</b><div><button className="secondary" disabled={governanceBusy} onClick={()=>void installEvaluationBaseline()}>Hazır Güvenlik Paketini Ekle</button><button className="secondary" disabled={!evalCases.length} onClick={downloadEvaluationEvidence}>Kanıt CSV İndir</button><button disabled={governanceBusy||!evalCases.some(item=>item.enabled)} onClick={()=>void runEvaluations()}>İlk 10 Etkin Testi Çalıştır</button></div></div><div className="fornost-ai-governance-list">{evalCases.map(item=><article key={item.id} className={!item.enabled?"disabled":undefined}><header><div><b>{item.name}</b><small>{item.id} · {item.enabled?"Etkin":"Devre dışı"}</small></div>{item.lastRun?<span className={item.lastRun.status}>{item.lastRun.score}/100</span>:<span>Yeni</span>}</header><p>{item.input}</p><div className={`fornost-ai-eval-trend ${item.trend}`}><b>{item.trend==="regressed"?"Regresyon":item.trend==="improved"?"İyileşme":item.trend==="stable"?"Stabil":"İlk ölçüm"}</b><span>{item.history.length>1?`${item.scoreDelta>0?"+":""}${item.scoreDelta} puan`:"Karşılaştırma için ikinci koşum gerekli"}</span></div><footer>{item.expectedTerms.map(term=><span key={term}>+ {term}</span>)}{item.forbiddenTerms.map(term=><span className="forbidden" key={term}>− {term}</span>)}</footer>{item.history.length>0&&<div className="fornost-ai-eval-history"><b>Son {item.history.length} koşum</b>{item.history.map(run=><div key={run.id}><span className={run.status}>{run.score}</span><small>{run.provider} · {run.model}</small><time>{run.latencyMs} ms · {new Date(run.createdAt).toLocaleString("tr-TR")}</time>{run.failureReason&&<em>{run.failureReason}</em>}</div>)}</div>}<div className="fornost-ai-governance-actions"><button disabled={governanceBusy||!item.enabled} onClick={()=>void runEvaluations(item.id)}>Çalıştır</button><button onClick={()=>editEvalCase(item)}>Düzenle</button><button className="warn" disabled={governanceBusy} onClick={()=>void toggleEvalCase(item)}>{item.enabled?"Devre Dışı":"Etkinleştir"}</button><button className="danger" onClick={()=>void deleteEvalCase(item.id)}>Sil</button></div>{evalEdit?.id===item.id&&<form className="fornost-ai-eval-edit" onSubmit={saveEvalCase}><b>Testi düzenle</b><label><span>Test adı</span><input maxLength={160} value={evalEdit.name} onChange={e=>setEvalEdit(value=>value?{...value,name:e.target.value}:value)}/></label><label><span>Test girdisi</span><textarea rows={3} maxLength={2000} value={evalEdit.input} onChange={e=>setEvalEdit(value=>value?{...value,input:e.target.value}:value)}/></label><label><span>Beklenen terimler</span><input value={evalEdit.expectedTerms} onChange={e=>setEvalEdit(value=>value?{...value,expectedTerms:e.target.value}:value)}/></label><label><span>Yasaklı terimler</span><input value={evalEdit.forbiddenTerms} onChange={e=>setEvalEdit(value=>value?{...value,forbiddenTerms:e.target.value}:value)}/></label><label><span>Maksimum gecikme (ms)</span><input type="number" min="1000" max="120000" value={evalEdit.maxLatencyMs} onChange={e=>setEvalEdit(value=>value?{...value,maxLatencyMs:Number(e.target.value)}:value)}/></label><label className="fornost-ai-checkbox"><input type="checkbox" checked={evalEdit.enabled} onChange={e=>setEvalEdit(value=>value?{...value,enabled:e.target.checked}:value)}/><span>Hazırlık kontrolüne dahil et</span></label><div><button type="button" onClick={()=>setEvalEdit(null)}>Vazgeç</button><button disabled={governanceBusy}>Kaydet</button></div></form>}</article>)}</div></>:<div className="fornost-ai-health-list">{!providerHealth.length?<div className="fornost-ai-audit-empty">Henüz provider health kaydı yok.</div>:providerHealth.map((item,index)=><article key={`${item.created_at}-${index}`}><span className={item.status}/><div><b>{item.profile} · {item.provider}</b><small>{item.model} · {item.operation}</small><em>{item.detail}</em></div><time>{item.latency_ms} ms<br/>{new Date(item.created_at).toLocaleString("tr-TR")}</time></article>)}</div>}
      </div> : activeTab === "audit" ? <div className="fornost-ai-audit">
        <div className="fornost-ai-security-note"><b>AI kullanım denetim izi</b><p>Ham prompt ve model cevabı saklanmaz. Aktör, model, işlem sonucu, gecikme, prompt hash ve kullanılan Fornost kaynak kimlikleri tutulur.</p></div>
        <div className="fornost-ai-audit-head"><b>Son aktiviteler</b><button onClick={() => void loadAudit()} disabled={auditBusy}>{auditBusy ? "Yükleniyor…" : "Yenile"}</button></div>
        {!auditLogs.length && !auditBusy && <div className="fornost-ai-audit-empty">Henüz AI aktivite kaydı yok.</div>}
        <div className="fornost-ai-audit-list">{auditLogs.map((log) => <article key={log.id}>
          <header><b>{log.action}</b><span className={log.status}>{log.status}</span></header>
          <p>{log.actor}</p><small>{log.provider} · {log.model} · {log.latencyMs} ms</small>
          <time>{new Date(log.createdAt).toLocaleString("tr-TR")}</time>
          {!!log.contextRefs.length && <footer>{log.contextRefs.slice(0, 8).map((ref) => <span key={ref}>{ref}</span>)}</footer>}
          {log.detail && <em>{log.detail}</em>}
          {log.promptHash && <code title={log.promptHash}>hash:{log.promptHash.slice(0, 12)}…</code>}
        </article>)}</div>
      </div> : <div className="fornost-ai-settings">
        <div className="fornost-ai-security-note"><b>Güvenli çalışma modeli</b><p>Model DB’ye doğrudan bağlanmaz. Fornost yalnız izin verilen, read-only GRC context’ini modele gönderir; API anahtarı şifreli saklanır ve prompt’a eklenmez.</p></div>
        <div className="fornost-ai-security-note"><b>Fallback veri-egress kilidi</b><p>Birincil ve yedek provider zincirindeki en sıkı veri sınıfı tüm çağrıya uygulanır. Restricted hiçbir sağlayıcıya gönderilmez; harici provider en fazla Internal veri alabilir.</p></div>
        <label><span>Provider</span><select value={provider.provider} onChange={(e) => setProvider((value) => ({ ...value, provider: e.target.value as ProviderForm["provider"] }))}><option value="openai-compatible">OpenAI Compatible / Local Chatbot</option><option value="ollama">Ollama</option></select></label>
        <label><span>Base URL</span><input value={provider.baseUrl} onChange={(e) => setProvider((value) => ({ ...value, baseUrl: e.target.value }))} placeholder="http://10.10.10.50:11434"/></label>
        <label><span>Model</span><input value={provider.model} onChange={(e) => setProvider((value) => ({ ...value, model: e.target.value }))} placeholder="qwen3:14b"/></label>
        <label><span>API Key</span><input type="password" value={provider.secret} onChange={(e) => setProvider((value) => ({ ...value, secret: e.target.value }))} placeholder={provider.hasSecret ? "Kayıtlı · değiştirmek için yeni değer girin" : "Opsiyonel"}/></label>
        <div className="fornost-ai-setting-row"><label><span>Provider güven bölgesi</span><select value={provider.trustZone} onChange={e=>setProvider(value=>({...value,trustZone:e.target.value as ProviderForm["trustZone"],maxDataClassification:e.target.value==="external"&&value.maxDataClassification==="Confidential"?"Internal":value.maxDataClassification}))}><option value="external">Harici / internet</option><option value="private">Özel ağ / on-prem</option><option value="local">Aynı sunucu / loopback</option></select></label><label><span>Gönderilebilecek en yüksek veri sınıfı</span><select value={provider.maxDataClassification} onChange={e=>setProvider(value=>({...value,maxDataClassification:e.target.value as ProviderForm["maxDataClassification"]}))}><option value="Public">Public</option><option value="Internal">Internal</option><option value="Confidential" disabled={provider.trustZone==="external"}>Confidential</option></select></label></div>
        <div className="fornost-ai-setting-row"><label><span>Temperature</span><input type="number" min="0" max="2" step="0.1" value={provider.temperature} onChange={(e) => setProvider((value) => ({ ...value, temperature: Number(e.target.value) }))}/></label><label><span>Timeout (ms)</span><input type="number" min="5000" max="120000" step="1000" value={provider.timeoutMs} onChange={(e) => setProvider((value) => ({ ...value, timeoutMs: Number(e.target.value) }))}/></label></div>
        <div className="fornost-ai-setting-row"><label><span>Max tokens</span><input type="number" min="128" max="4096" step="128" value={provider.maxTokens} onChange={(e) => setProvider((value) => ({ ...value, maxTokens: Number(e.target.value) }))}/></label><label className="fornost-ai-check"><input type="checkbox" checked={provider.enabled} onChange={(e) => setProvider((value) => ({ ...value, enabled: e.target.checked }))}/><span>Fornost AI’ı etkinleştir</span></label></div>
        {notice && <div className="fornost-ai-notice">{notice}</div>}
        {selectedModelAvailable!==null&&<div className={`fornost-ai-model-status ${selectedModelAvailable?"ok":"warn"}`}><b>{selectedModelAvailable?"Seçili model erişilebilir":"Seçili model listede bulunamadı"}</b><span>{discoveredModels.length} model keşfedildi</span></div>}
        {!!discoveredModels.length&&<label><span>Keşfedilen modeller</span><select value={provider.model} onChange={(e)=>setProvider(value=>({...value,model:e.target.value}))}><option value={provider.model}>{provider.model}</option>{discoveredModels.filter(model=>model!==provider.model).map(model=><option key={model} value={model}>{model}</option>)}</select></label>}
        <div className="fornost-ai-fallback"><div><b>Yedek AI sağlayıcısı</b><label className="fornost-ai-check"><input type="checkbox" checked={provider.fallback.enabled} onChange={e=>setProvider(value=>({...value,fallback:{...value.fallback,enabled:e.target.checked}}))}/><span>Birincil hata verirse otomatik kullan</span></label></div>{provider.fallback.enabled&&<><label><span>Provider</span><select value={provider.fallback.provider} onChange={e=>setProvider(value=>({...value,fallback:{...value.fallback,provider:e.target.value as ProviderForm["fallback"]["provider"]}}))}><option value="openai-compatible">OpenAI Compatible</option><option value="ollama">Ollama</option></select></label><label><span>Base URL</span><input value={provider.fallback.baseUrl} onChange={e=>setProvider(value=>({...value,fallback:{...value.fallback,baseUrl:e.target.value}}))}/></label><label><span>Model</span><input value={provider.fallback.model} onChange={e=>setProvider(value=>({...value,fallback:{...value.fallback,model:e.target.value}}))}/></label><label><span>API Key</span><input type="password" value={provider.fallback.secret} onChange={e=>setProvider(value=>({...value,fallback:{...value.fallback,secret:e.target.value}}))} placeholder={provider.fallback.hasSecret?"Kayıtlı · değiştirmek için yeni değer girin":"Opsiyonel"}/></label><div className="fornost-ai-setting-row"><label><span>Yedek güven bölgesi</span><select value={provider.fallback.trustZone} onChange={e=>setProvider(value=>({...value,fallback:{...value.fallback,trustZone:e.target.value as ProviderForm["fallback"]["trustZone"],maxDataClassification:e.target.value==="external"&&value.fallback.maxDataClassification==="Confidential"?"Internal":value.fallback.maxDataClassification}}))}><option value="external">Harici / internet</option><option value="private">Özel ağ / on-prem</option><option value="local">Aynı sunucu / loopback</option></select></label><label><span>Yedek maksimum veri sınıfı</span><select value={provider.fallback.maxDataClassification} onChange={e=>setProvider(value=>({...value,fallback:{...value.fallback,maxDataClassification:e.target.value as ProviderForm["fallback"]["maxDataClassification"]}}))}><option value="Public">Public</option><option value="Internal">Internal</option><option value="Confidential" disabled={provider.fallback.trustZone==="external"}>Confidential</option></select></label></div></>}</div>
        <div className="fornost-ai-settings-actions"><button className="secondary" disabled={busy} onClick={() => saveProvider(false)}>Kaydet</button><button disabled={busy} onClick={() => saveProvider(true)}>Kaydet & Test Et</button></div>
        <small className="fornost-ai-env-help">Private ağ için <code>FORNOST_AI_ALLOW_PRIVATE_ENDPOINTS=true</code>; aynı host loopback için ayrıca <code>FORNOST_AI_ALLOW_LOOPBACK=true</code> gerekir.</small>
      </div>}
    </section>}
  </>;
}
