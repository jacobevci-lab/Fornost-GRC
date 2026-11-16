export function ruleCreationConflictMessage(tr:boolean){
 return tr
  ? 'Bu kayıt isteği daha önce farklı içerikle kullanılmış veya kaydedilen kontrol kaldırılmış. Mevcut kontrolü inceleyin; yeni kayıt oluşturulmadı.'
  : 'This save request was already used with different contents, or its saved control was removed. Review the existing control; no new record was created.';
}
