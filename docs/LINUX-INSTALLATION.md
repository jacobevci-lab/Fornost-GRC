# Fornost GRC Linux On-Prem Kurulum Rehberi

Bu kurulum Fornost GRC'yi kurum içi bir Linux sunucuda kalıcı veri alanı ve ters proxy ile çalıştırır. Varsayılan kullanıcı adresi `http://SUNUCU_IP/fornost-grc/` şeklindedir.

## Neden container kullanılıyor?

Güncel Cloudflare `workerd` ikilisi yeni bir GNU C Library sürümü ister. RHEL/Rocky/Alma 8 sistemlerinde bulunan `glibc 2.28` doğrudan çalıştırmada `GLIBC_2.29 ... GLIBC_2.35 not found` hatasına neden olabilir. Podman/Docker image kendi uyumlu kullanıcı alanını taşıdığı için host işletim sisteminin glibc veya Node.js paketleri değiştirilmez.

## Gereksinimler

- 64-bit Linux sunucu
- Podman veya Docker
- Image indirme ve npm paket kurulumu için geçici internet erişimi
- Varsayılan olarak `80/tcp` portu
- En az 2 vCPU, 2 GB RAM ve 5 GB boş disk

RHEL/Rocky/Alma için Podman:

```bash
sudo dnf install -y podman
```

## Kurulum

```bash
git clone https://github.com/jacobevci-lab/Fornost-GRC.git
cd Fornost-GRC
bash scripts/linux/install.sh
```

Kurulum tamamlandığında terminalde algılanan sunucu IP adresiyle birlikte ilk kurulum bağlantısı gösterilir:

```text
http://192.168.1.1/fornost-grc/
```

Tarayıcı ilk açılışta **Fornost GRC İlk Kurulum** ekranını gösterir. Ad soyad, e-posta ve güçlü parola girilerek ilk `Admin` hesabı oluşturulur. İlk yönetici oluşturulduktan sonra aynı adres standart giriş ekranını gösterir.

## Adres ve port ayarı

İlk çalıştırmada `.env.onprem` dosyası otomatik oluşturulur:

```dotenv
FORNOST_BASE_PATH=/fornost-grc
FORNOST_HTTP_PORT=80
```

Örneğin `http://192.168.1.1:8080/grc/` kullanmak için:

```dotenv
FORNOST_BASE_PATH=/grc
FORNOST_HTTP_PORT=8080
```

Değişiklikten sonra kurulumu yeniden çalıştırın:

```bash
bash scripts/linux/install.sh
```

## Güvenlik duvarı

RHEL tabanlı sistemlerde yalnız kurumsal ağdan erişim örneği:

```bash
sudo firewall-cmd --permanent --zone=internal --add-port=80/tcp
sudo firewall-cmd --reload
```

Kurumsal ağ aralığı ve zone adı mevcut güvenlik tasarımına göre sınırlandırılmalıdır. İnternet erişimi için HTTP yerine kurum sertifikası kullanan TLS terminasyonu uygulanmalıdır.

## Yönetim

Container durumları:

```bash
npm run onprem:status
```

Uygulama logları:

```bash
npm run onprem:logs
```

Podman kullanılıyorsa doğrudan:

```bash
podman ps --filter name=fornost-grc
podman logs --tail 200 fornost-grc-app
podman logs --tail 200 fornost-grc-proxy
```

## Kalıcı veri

Yerel D1 kayıtları ve R2 kanıt dosyaları `fornost-grc-data` adlı volume içinde saklanır. Kurulum scripti uygulama ve proxy container'larını yeniler fakat bu volume alanını silmez.

Volume silinirse uygulama yeni kurulum durumuna döner. Üretim ortamında container runtime'ın volume yedekleme prosedürü ayrıca uygulanmalıdır.

## Sorun giderme

- Adres açılmıyorsa `npm run onprem:status` ile iki container'ın da çalıştığını kontrol edin.
- Port 80 başka servis tarafından kullanılıyorsa `.env.onprem` içinde `FORNOST_HTTP_PORT=8080` tanımlayın.
- Image indirilemiyorsa sunucunun `docker.io`, `nodejs.org` ve `registry.npmjs.org` erişimini kontrol edin.
- İlk yönetici ekranı yerine giriş ekranı geliyorsa kalıcı veri alanında daha önce oluşturulmuş aktif bir Admin hesabı vardır.
- `glibc` hatası görülüyorsa doğrudan `serve.sh` yerine `install.sh` ile oluşturulan container kurulumunu kullanın.
