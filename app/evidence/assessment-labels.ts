export const assessmentStateText:Record<string,{tr:string;en:string}>={
  current:{tr:'Güncel yapılandırmayla doğrulandı.',en:'Verified against current settings.'},
  'configuration-changed':{tr:'Kaynak veya kontrol ayarı değişti; güncel ayarlarla yeni kanıt toplayın.',en:'Source or control settings changed; collect evidence with current settings.'},
  'configuration-unverified':{tr:'Eski testin ayarları doğrulanamıyor; kontrolü yeniden çalıştırın.',en:'Historical test settings are unverified; run the control again.'},
  'control-scope-changed':{tr:'Onaylanan kontrol eşlemesi değişti; hedef kontrolü inceleyin.',en:'The approved control mapping changed; review the target control.'},
  'source-unavailable':{tr:'Bağlı kaynak veya kontrol eksik ya da duraklatılmış.',en:'The linked source or control is missing or paused.'},
  'evidence-missing':{tr:'Testin bağlı kanıtı bulunamadı; yeni kanıt toplayın.',en:'The test evidence is missing; collect new evidence.'},
  'evidence-mismatch':{tr:'Test ve kanıt bilgileri eşleşmiyor; yeniden doğrulayın.',en:'Test and evidence metadata do not match; verify them again.'},
  'evidence-stale':{tr:'Test kanıtı güncel değil veya tarihi doğrulanamıyor.',en:'Test evidence is outdated or its date is unverified.'},
  'test-failed':{tr:'Kontrol testi başarısız; düzeltmeyi takip edin.',en:'The control test failed; follow up on remediation.'},
  'collection-error':{tr:'Veri toplama veya değerlendirme tamamlanamadı.',en:'Collection or assessment did not complete.'},
  'assessment-unavailable':{tr:'Güncel test bağı kontrol edilemedi; değerlendirmeyi yenileyin.',en:'Current test linkage could not be checked; refresh the evaluation.'},
};
