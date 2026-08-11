# Security Policy

## Desteklenen sürüm

Yalnız canlıda kullanılan son sürüm güvenlik güncellemesi alır.

## Güvenlik bildirimi

Güvenlik açıklarını herkese açık issue olarak paylaşmayın. Kurumun Bilgi Güvenliği ekibine; etkilenen sürüm, yeniden üretim adımları, etki ve varsa kanıtla özel kanaldan bildirin. Parola, token, kişisel veri veya gerçek müşteri kanıtı eklemeyin.

## Güvenli geliştirme kuralları

- Secret veya `.env` dosyası commit edilmez.
- Yeni API'ler `requireRole` ve sunucu tarafı validasyon kullanır.
- SQL yalnız parametreli sorgularla çalışır.
- Dosya yükleme uzantı/MIME/imza/boyut kontrolünden geçer.
- Her değişiklik lint, test, production audit ve build kapılarından geçer.
- Kritik/yüksek açık varken production yayını yapılmaz.
