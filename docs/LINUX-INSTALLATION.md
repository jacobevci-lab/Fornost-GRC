# Fornost GRC Linux On-Prem Kurulum Rehberi

Bu rehber Fornost GRC'yi kurum içi bir Linux sunucuda, kalıcı veri alanı ve Nginx ters proxy ile çalıştırır. Varsayılan adres `http://SUNUCU_IP/fornost-grc/` şeklindedir.

## Desteklenen işletim sistemleri

| İşletim sistemi | Sürümler | Önerilen runtime | Durum |
|---|---:|---|---|
| Red Hat Enterprise Linux | 8, 9 | Podman | Desteklenir |
| Rocky Linux | 8, 9 | Podman | Desteklenir |
| AlmaLinux | 8, 9 | Podman | Desteklenir |
| CentOS Stream | 8, 9 | Podman | Desteklenir |
| Ubuntu Server / Debian | Güncel LTS/stable | Docker veya Podman | Desteklenir |
| CentOS Linux | 7 | — | Desteklenmez; işletim sistemi EOL'dur |

Uygulama container içinde Node.js 22 tabanlı Debian kullanıcı alanıyla çalışır. Bu nedenle RHEL 8 ailesindeki `glibc 2.28` değiştirilmez ve host üzerinde görülen `GLIBC_2.29 ... GLIBC_2.35 not found` hatası oluşmaz.

## Mimari ve portlar

- `fornost-grc-app`: uygulama container'ı; yalnız özel container ağına bağlıdır.
- `fornost-grc-proxy`: Nginx ters proxy; varsayılan olarak host `80/tcp` portunu yayınlar.
- `fornost-grc-net`: iki container arasındaki özel ağ.
- `fornost-grc-data`: D1 kayıtları ve R2 kanıt dosyaları için kalıcı volume.
- Varsayılan uygulama yolu: `/fornost-grc/`.

Önerilen minimum kaynak: 2 vCPU, 2 GB RAM, 5 GB boş disk. Build sırasında 4 GB RAM daha rahattır.

## Ağ gereksinimleri

Kurulum sırasında aşağıdaki kaynaklara HTTPS erişimi gerekir:

- `github.com` ve `raw.githubusercontent.com`
- `registry.npmjs.org`
- `registry-1.docker.io`, `auth.docker.io` ve Docker Hub CDN uçları

Kurulum tamamlandıktan sonra uygulama internet erişimi olmadan kurum içi kullanılabilir; dış SMTP veya başka entegrasyonlar ayrıca ağ erişimi gerektirebilir.

## 1. RHEL, Rocky, AlmaLinux veya CentOS Stream kurulumu

Podman önerilen runtime'dır:

```bash
sudo dnf install -y git podman curl firewalld
sudo systemctl enable --now firewalld
podman --version
git --version
```

Repo'yu klonlayın ve installer'ı root olarak çalıştırın. Port 80 yayınlandığı için `sudo` kullanılır:

```bash
git clone https://github.com/jacobevci-lab/Fornost-GRC.git
cd Fornost-GRC
sudo bash scripts/linux/install.sh
```

Installer sırasıyla şunları yapar:

1. `.env.onprem` yoksa güvenli varsayılanlarla oluşturur.
2. Base path ve port değerlerini doğrular.
3. Podman'ı, yoksa Docker'ı seçer ve runtime erişimini kontrol eder.
4. Uygulama image'ını Node.js 22 ile build eder.
5. Kalıcı volume ve özel container ağını oluşturur.
6. Uygulama container'ını başlatıp dahili `/api/auth` sağlık kontrolünü bekler.
7. Nginx proxy'yi başlatıp host üzerinden uçtan uca sağlık kontrolü yapar.
8. Yalnız tüm kontroller geçerse ilk kurulum adresini gösterir.

## 2. Güvenlik duvarı

Sunucunun aktif zone'unu kontrol edin:

```bash
sudo firewall-cmd --get-active-zones
```

Tüm yerel ağdan erişim gerekiyorsa gerçek aktif zone adını kullanın:

```bash
sudo firewall-cmd --permanent --zone=public --add-port=80/tcp
sudo firewall-cmd --reload
```

Yalnız belirli bir kurumsal ağdan erişim için daha güvenli örnek:

```bash
sudo firewall-cmd --permanent --zone=public \
  --add-rich-rule='rule family=ipv4 source address=192.168.1.0/24 port protocol=tcp port=80 accept'
sudo firewall-cmd --reload
```

`public` zone ve `192.168.1.0/24` değerlerini kendi ağ tasarımınıza göre değiştirin.

## 3. İlk erişim ve yönetici oluşturma

Installer'ın gösterdiği adresi tarayıcıda açın:

```text
http://192.168.1.1/fornost-grc/
```

İlk ziyarette **Fornost GRC İlk Kurulum** ekranı açılır. Ad soyad, geçerli e-posta ve en az 12 karakterlik güçlü parola ile ilk `Admin` hesabını oluşturun. Aktif bir Admin mevcutsa standart giriş ekranı görüntülenir.

İlk erişimden önce sunucu üzerinde doğrulama çalıştırılabilir:

```bash
cd Fornost-GRC
sudo bash scripts/linux/check.sh
sudo podman ps --filter name=fornost-grc
curl --fail --silent http://127.0.0.1/fornost-grc/api/auth
```

## 4. Adres ve port yapılandırması

İlk çalıştırmada oluşan `.env.onprem`:

```dotenv
FORNOST_BASE_PATH=/fornost-grc
FORNOST_HTTP_PORT=80
```

Örneğin `http://192.168.1.1:8080/grc/` için:

```dotenv
FORNOST_BASE_PATH=/grc
FORNOST_HTTP_PORT=8080
```

Sonra kurulumu tekrar çalıştırın:

```bash
sudo bash scripts/linux/install.sh
```

Base path `/` ile başlamalı ve yalnız harf, rakam, `/`, `_` veya `-` içermelidir. Port `1-65535` aralığında olmalıdır.

## 5. Rootless Podman veya Docker

Rootless kullanıcılar varsayılan Linux ayarlarında port 80'i yayınlayamaz. `.env.onprem` içinde `FORNOST_HTTP_PORT=8080` kullanın ve installer'ı `sudo` olmadan çalıştırın:

```bash
cp .env.onprem.example .env.onprem
sed -i 's/FORNOST_HTTP_PORT=80/FORNOST_HTTP_PORT=8080/' .env.onprem
bash scripts/linux/install.sh
```

Belirli runtime'ı zorlamak mümkündür:

```bash
sudo FORNOST_CONTAINER_ENGINE=podman bash scripts/linux/install.sh
# veya
sudo FORNOST_CONTAINER_ENGINE=docker bash scripts/linux/install.sh
```

Docker kullanılıyorsa daemon çalışıyor olmalıdır:

```bash
sudo systemctl enable --now docker
sudo docker info
sudo FORNOST_CONTAINER_ENGINE=docker bash scripts/linux/install.sh
```

## 6. HTTPS kullanımı

Installer varsayılan olarak kurum içi HTTP sunar. Üretimde TLS sonlandırması için kurumsal load balancer, mevcut Nginx/Apache proxy veya ingress üzerinde geçerli sertifika kullanın; upstream olarak `http://SUNUCU_IP:80` tanımlayın ve `/fornost-grc/` yolunu koruyun.

Uygulamayı doğrudan internete açmayın. Erişimi VPN, kurumsal ağ veya güvenilir reverse proxy ile sınırlandırın.

## 7. Güncelleme

Önce yedek alın, ardından yalnız fast-forward güncelleme uygulayın:

```bash
cd Fornost-GRC
git status --short
git pull --ff-only origin main
sudo bash scripts/linux/install.sh
sudo bash scripts/linux/check.sh
```

Installer container'ları yeniden oluşturur ancak `fornost-grc-data` volume'ünü silmez.

## 8. Durum ve loglar

```bash
sudo bash scripts/linux/status.sh
sudo bash scripts/linux/check.sh
sudo bash scripts/linux/logs.sh
```

Proxy logları için:

```bash
sudo podman logs --tail 200 fornost-grc-proxy
```

Docker kullanıyorsanız komutlardaki `podman` yerine `docker` yazın veya `FORNOST_CONTAINER_ENGINE=docker` değişkenini kullanın.

## 9. Yedekleme

Önce bir yedek klasörü oluşturun:

```bash
mkdir -p "$PWD/backups"
```

Podman ile kalıcı volume yedeği:

```bash
sudo podman run --rm \
  --volume fornost-grc-data:/data:ro \
  --volume "$PWD/backups:/backup:Z" \
  docker.io/library/alpine:3.21 \
  tar czf /backup/fornost-grc-data-$(date +%F-%H%M).tar.gz -C /data .
```

Yedek dosyasını sunucu dışında şifreli ve erişim kontrollü bir alana aktarın. Geri yükleme veri üzerine yazan bir işlemdir; önce mevcut volume'ün ayrıca yedeğini alın ve uygulama container'larını durdurun.

## 10. Kaldırma

Uygulamayı kaldırıp veriyi korumak için:

```bash
sudo podman rm -f fornost-grc-proxy fornost-grc-app
sudo podman network rm fornost-grc-net
```

Kalıcı veri volume'ü bu işlemlerle korunur. **Aşağıdaki komut tüm uygulama kayıtlarını ve yüklenen kanıtları geri dönüşsüz siler:**

```bash
sudo podman volume rm fornost-grc-data
```

## 11. Sorun giderme

- `GLIBC_2.xx not found`: Host üzerinde `serve.sh` çalıştırmayın; container tabanlı `install.sh` kullanın.
- `Port 80 requires root privileges`: `sudo` kullanın veya `.env.onprem` içinde portu `8080` yapın.
- `address already in use`: Portu değiştirin ya da portu kullanan servisi `sudo ss -lntp | grep ':80 '` ile belirleyin.
- Image indirilemiyor: Proxy/DNS ayarlarını ve Docker Hub/npm erişimini kontrol edin.
- Uygulama sağlıklı olmuyor: `sudo podman logs --tail 200 fornost-grc-app` çalıştırın.
- Proxy sağlıklı olmuyor: `sudo podman logs --tail 200 fornost-grc-proxy` ve `sudo firewall-cmd --get-active-zones` çıktısını kontrol edin.
- İlk yönetici yerine giriş ekranı: Kalıcı volume içinde daha önce oluşturulmuş aktif bir Admin vardır.
- SELinux izin hatası: Volume mount'larda kullanılan `:Z` etiketini kaldırmayın; `sudo ausearch -m AVC -ts recent` ile olayı inceleyin.

## 12. Kurulum sonrası kontrol listesi

- [ ] `scripts/linux/install.sh` hata vermeden tamamlandı.
- [ ] `scripts/linux/check.sh` sağlık kontrolünü geçti.
- [ ] `fornost-grc-app` ve `fornost-grc-proxy` çalışıyor.
- [ ] Tarayıcıda `/fornost-grc/` açılıyor.
- [ ] İlk Admin hesabı oluşturuldu ve tekrar giriş test edildi.
- [ ] Firewall yalnız gerekli kaynak ağlara izin veriyor.
- [ ] HTTPS/VPN veya kurumsal erişim katmanı planlandı.
- [ ] `fornost-grc-data` volume yedeği alındı ve saklama politikası belirlendi.
