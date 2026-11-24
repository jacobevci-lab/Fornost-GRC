import {fold,type Lang} from './domain';
export type QuestionInput={code:string;category:string;question:string};
export type QuestionColumns={question:number;code:number;category:number};
export function parseDelimited(input:string,delimiter:','|'\t'|';'=','){
 const text=input.replace(/^\uFEFF/,''),rows:string[][]=[];let row:string[]=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){const ch=text[i];if(ch==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(!quoted&&(ch===delimiter||ch==='\n')){row.push(cell.replace(/\r$/,''));cell='';if(ch==='\n'){rows.push(row);row=[];}}else cell+=ch;}
 if(quoted)throw new Error('AI_IMPORT_QUOTES');row.push(cell.replace(/\r$/,''));rows.push(row);return rows.filter(r=>r.some(x=>x.trim()));
}
export function inferQuestionColumns(rows:string[][]):{columns:QuestionColumns;header:boolean}{
 const headings=(rows[0]||[]).map(x=>fold(x).replace(/[^a-z0-9]/g,''));
 const find=(values:string[])=>headings.findIndex(x=>values.includes(x));
 const question=find(['question','questiontext','soru','sorumetni','soruicerigi','securityquestion']),code=find(['code','id','questionid','questioncode','sorukodu','soruno','soruid']),category=find(['category','kategori','domain','alan','section','bolum']);
 return {columns:{question:question>=0?question:0,code,category},header:question>=0};
}
export function questionsFromRows(rows:string[][],columns:QuestionColumns,header:boolean):QuestionInput[]{
 if(rows.length>101||rows.some(r=>r.length>100)||columns.question<0||[columns.code,columns.category].some(c=>c>=0&&c===columns.question)||columns.code>=0&&columns.code===columns.category)throw new Error('AI_IMPORT_COLUMNS');
 return normalizeQuestions(rows.slice(header?1:0).filter(r=>r.some(x=>x.trim())).map((r,i)=>({code:columns.code<0?`Q-${String(i+1).padStart(3,'0')}`:r[columns.code],category:columns.category<0?'':r[columns.category],question:r[columns.question]})));
}
export function normalizeQuestions(input:unknown):QuestionInput[]{
 if(!Array.isArray(input)||!input.length||input.length>100)throw new Error('AI_QUESTIONS');
 const questions=input.map((v,i)=>{const q=typeof v==='string'?{question:v}:v;if(!q||typeof q!=='object'||typeof q.question!=='string'||!q.question.trim()||q.question.length>3000||q.code!==undefined&&typeof q.code!=='string'||q.category!==undefined&&typeof q.category!=='string')throw new Error('AI_QUESTIONS');return {code:String(q.code||`Q-${String(i+1).padStart(3,'0')}`).trim(),category:String(q.category||'').trim(),question:q.question.trim()};});
 if(questions.some(q=>!q.code||q.code.length>80||q.category.length>160)||new Set(questions.map(q=>fold(q.code))).size!==questions.length)throw new Error('AI_QUESTION_CODES');return questions;
}
export function sampleQuestions(lang:Lang):QuestionInput[]{
 const rows=[['IAM-01','ISO 27001 / SOC 2','Üretim sistemlerinde ayrıcalıklı erişim için MFA zorunlu mu?','Is MFA enforced for privileged access to production systems?'],['GOV-01','ISO 27001','Bilgi güvenliği politikası yayımlanmış ve bağımsız olarak onaylanmış mı?','Is the information security policy published and independently approved?'],['SOC-01','SOC 2','Erişim yetkileri düzenli olarak gözden geçiriliyor ve kanıtları saklanıyor mu?','Are access rights periodically reviewed with retained evidence?'],['BCP-01','ISO 27001 / SOC 2','Yedekleme ve geri dönüş testlerinin güncel kanıtları var mı?','Is current evidence available for backup and restoration tests?'],['PRV-01','KVKK','Kişisel verilerin saklama ve silme süreleri tanımlı ve uygulanıyor mu?','Are personal data retention and deletion periods defined and implemented?'],['TPR-01','KVKK / SOC 2','Alt işleyenler ve tedarikçi veri işleme sözleşmeleri düzenli inceleniyor mu?','Are subprocessors and vendor data processing agreements regularly reviewed?'],['AI-01','AI','AI kullanımında hassas veri maskeleme ve insan onayı uygulanıyor mu?','Are sensitive data redaction and human approval enforced for AI use?'],['AI-02','AI','AI araçlarının yetkileri ve kullanım kayıtları izleniyor mu?','Are AI tool permissions and usage audit logs monitored?']];
 return rows.map(([code,category,tr,en])=>({code,category,question:lang==='tr'?tr:en}));
}
