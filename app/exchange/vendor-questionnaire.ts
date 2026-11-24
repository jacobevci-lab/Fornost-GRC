export const defaultVendorScope='Erişim & MFA / Access & MFA · Şifreleme / Encryption · Yedekleme & Süreklilik / Backup & Continuity · Alt Yükleniciler / Subprocessors · KVKK/GDPR & Veri Konumu / Data Location';
export const portalQuestions={
 mfa:['Ayrıcalıklı ve uzaktan erişimde MFA zorunlu mu?','Is MFA enforced for privileged and remote access?'],
 backups:['Yedekler korunuyor ve geri yükleme testleri yapılıyor mu?','Are backups protected and restoration tests performed?'],
 privacy:['KVKK/GDPR kapsamı ve veri işleme yükümlülükleri değerlendirildi mi?','Have applicable KVKK/GDPR and data processing obligations been assessed?'],
} as const;
