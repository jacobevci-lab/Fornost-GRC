/** A saved schedule or successful HTTP response is not a passing control. */
export function connectorSetupOutcome(status: string, hasEvidence: boolean, tr: boolean) {
  if (status === "pass" && hasEvidence) return {
    tone: "success",
    label: tr ? "Başarılı" : "Passed",
    title: tr ? "İlk kontrol başarılı" : "First control check passed",
    detail: tr ? "İlk çalışma kanıt üretti ve kontrol koşulunu sağladı. Kanıtı inceleyebilir, sonraki çalışmaları mevcut kuraldan takip edebilirsiniz." : "The first run produced evidence and met the control condition. Review the evidence and follow subsequent runs in the existing rule.",
  };
  if (status === "fail" && hasEvidence) return {
    tone: "warning",
    label: tr ? "Koşul sağlanmadı" : "Condition not met",
    title: tr ? "İlk kontrol dikkat gerektiriyor" : "First control check needs attention",
    detail: tr ? "Kanıt toplandı, ancak kontrol koşulu sağlanmadı. Kanıtı ve kuralı inceleyin; varsa bağlı otomasyon bulgusunu takip edin." : "Evidence was collected, but the control condition was not met. Review the evidence and rule; follow the linked automation finding if one was created.",
  };
  if (status === "error") return {
    tone: "error",
    label: tr ? "Çalışma hatası" : "Run error",
    title: tr ? "İlk kontrol doğrulanamadı" : "First control check could not be verified",
    detail: tr ? "İzleme kuralı kaydedildi, ancak ilk çalışma hata verdi. Kaynağı ve mevcut kuralın çalışma ayrıntılarını inceleyin; bu sonuç başarılı kontrol anlamına gelmez." : "The monitoring rule was saved, but its first run encountered an error. Inspect the source and the existing rule's run details; this is not a passing control result.",
  };
  return {
    tone: "unknown",
    label: tr ? "Doğrulanamadı" : "Unconfirmed",
    title: tr ? "İlk çalışma sonucu doğrulanamadı" : "First run result is unconfirmed",
    detail: tr ? "İzleme kuralı kaydedildi. İlk çalışmanın sonucu veya kanıtı doğrulanamadı; yeni kural oluşturmadan mevcut kuralı inceleyin." : "The monitoring rule was saved. The first run result or evidence could not be confirmed; inspect the existing rule before creating another one.",
  };
}
