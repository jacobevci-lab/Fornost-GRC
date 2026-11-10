export const policyImportFileLimit = (name:string) => /\.docx$/i.test(name) ? 8 * 1024 * 1024 : /\.pdf$/i.test(name) ? 10 * 1024 * 1024 : 0;
export const policyImportTextLimit = 50_000;
const messages:Record<string,[string,string]>={
 file:["Word (.docx) veya PDF seçin. Eski .doc belgelerini .docx olarak kaydedin.","Choose Word (.docx) or PDF. Save legacy .doc files as .docx first."],
 size:["Dosya boş veya boyut sınırını aşıyor. DOCX için 8 MB, PDF için 10 MB.","The file is empty or exceeds the limit of 8 MB for DOCX or 10 MB for PDF."],
 invalid:["Dosya biçimi doğrulanamadı. Geçerli, şifresiz bir PDF veya makrosuz DOCX seçin.","The file format could not be verified. Choose a valid unencrypted PDF or macro-free DOCX."],
 text:["Okunabilir metin çıkarılamadı. Taranmış PDF için OCR uygulanmış bir kopya seçin.","No readable text could be extracted. For a scanned PDF, choose a copy processed with OCR."],
 length:["Politika metni 80–50.000 karakter olmalı. Kaydetmeden önce metni düzenleyin.","Policy text must be 80–50,000 characters. Edit the preview before saving."],
 conflict:["Kayıt değişti, politika kodu kullanımda veya açık bir sürüm var. Hedef kaydı kontrol edin.","The record changed, the policy code is already used, or an open version exists. Check the target."],
 access:["Bu işlem için Yönetici veya Editör erişimi gerekir.","Administrator or Editor access is required."],
 store:["Kaynak dosya deposuna ulaşılamadı. Tekrar deneyin.","The source file store is unavailable. Try again."],
 input:["Politika bilgilerini, tarihi ve en az bir eşlemeyi kontrol edin.","Check the policy fields, effective date and at least one mapping."],
 person:["Etkin bir politika sahibi ve bağımsız inceleyen seçin.","Select an eligible policy owner and independent reviewer."],
 reference:["Bağlı kontrol veya risk bulunamadı. Eşlemeyi kontrol edin.","A linked control or risk was not found. Check your mappings."],
 unavailable:["İşlem doğrulanamadı. Aynı dosya ve bilgilerle tekrar deneyin.","The result could not be confirmed. Retry with the same file and details."]
};
export function importMessage(code:string,tr:boolean){return (messages[code]||messages.unavailable)[tr?0:1];}
