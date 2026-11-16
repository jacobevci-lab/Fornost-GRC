export function sourceCreationConflictMessage(tr:boolean){
 return tr
  ? 'Bu kayıt isteği daha önce farklı içerikle kullanılmış veya kaydedilen kaynak kaldırılmış. Mevcut kaynağı inceleyin; yeni kaynak oluşturulmadı.'
  : 'This save request was already used with different contents, or its saved source was removed. Review the existing source; no new source was created.';
}
