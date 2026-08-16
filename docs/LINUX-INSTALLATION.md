# Fornost GRC Linux On-Prem Kurulum Rehberi

Bu rehber Fornost GRC'yi kurum içi bir Linux sunucuda, kalıcı veri alanı ve TLS etkin Nginx ters proxy ile çalıştırır. Varsayılan adres `https://SUNUCU_IP:8443/fornost-grc/` şeklindedir.

## Desteklenen işletim sistemleri

| İşletim sistemi | Sürümler | Önerilen runtime | Durum |
|---|---:|---|---|
| Red Hat Enterprise Linux | 8, 9 | Podman | Desteklenir |
| Rocky Linux | 8, 9 | Podman | Desteklenir |
| AlmaLinux | 8, 9 | Podman | Desteklenir |
| CentOS Stream | 9, 10 | Podman | Desteklenir |
| Ubuntu Server / Debian | Güncel LTS/stable | Docker veya Podman | Desteklenir |
| CentOS Linux / CentOS Stream 8 | 7, 8 | — | Desteklenmez; işletim sistemi EOL'dur |

Uygulama container içinde Node.js 22 tabanlı Debian kullanıcı alanıyla çalışır. Bu nedenle RHEL 8 ailesindeki `glibc 2.28` değiştirilmez ve host üzerinde görülen `GLIBC_2.29 ... GLIBC_2.35 not found` hatası oluşmaz.

## Mimari ve portlar

- `fornost-grc-app`: uygulama container'ı; yalnız özel container ağına bağlıdır.
- `fornost-grc-proxy`: TLS 1.2/1.3 kullanan Nginx ters proxy; varsayılan olarak host `8443/tcp` portunu yayınlar.
- `fornost-grc-net`: iki container arasındaki özel ağ.
- `fornost-grc-data`: D1 kayıtları ve R2 kanıt dosyaları için kalıcı volume.
- Varsayılan uygulama yolu: `/fornost-grc/`.

Önerilen minimum kaynak: 2 vCPU, 2 GB RAM, **8 GiB boş disk**; rahat güncelleme ve yedekleme için 25–30 GB toplam disk önerilir. Normal kurulum sunucuda uygulama build'i yapmaz. Installer, image indirmeden önce hem cache hem container storage dosya sistemini ölçer; alan yetersizse hiçbir büyük indirme veya image açılımı başlatmadan durur.

## Ağ gereksinimleri

Kurulum sırasında aşağıdaki kaynaklara HTTPS erişimi gerekir:

- `github.com` ve GitHub Release indirme uçları
- `registry-1.docker.io`, `auth.docker.io` ve Docker Hub CDN uçları

Kurulum tamamlandıktan sonra uygulama internet erişimi olmadan kurum içi kullanılabilir; dış SMTP veya başka entegrasyonlar ayrıca ağ erişimi gerektirebilir.

## 1. RHEL, Rocky, AlmaLinux veya CentOS Stream kurulumu

### En kolay yöntem: tek komut

Temiz sunucuda aşağıdaki komut yeterlidir:

```bash
curl -fsSL https://raw.githubusercontent.com/jacobevci-lab/Fornost-GRC/main/scripts/linux/quick-install.sh | sudo bash
```

Bu komut Git'i kurar, repoyu `/opt/fornost-grc` altına indirir ve doğrulanmış bootstrap'ı çalıştırır. Aynı komut daha sonra tekrar çalıştırıldığında checkout'ta yerel değişiklik yoksa yalnız fast-forward güncellemesi yapar; değiştirilmiş dosyaların üzerine yazmaz.

İndirmeden önce scripti incelemek isterseniz:

```bash
curl -fsSLo /tmp/fornost-quick-install.sh \
  https://raw.githubusercontent.com/jacobevci-lab/Fornost-GRC/main/scripts/linux/quick-install.sh
less /tmp/fornost-quick-install.sh
sudo bash /tmp/fornost-quick-install.sh
```

### Manuel yöntem

Podman önerilen runtime'dır:

```bash
sudo dnf install -y git podman curl openssl firewalld
sudo systemctl enable --now firewalld
podman --version
git --version
```

Repo'yu klonlayın ve temiz kurulum bootstrap'ını çalıştırın. Bootstrap gerekli paketleri kurar, aktif firewall zone'una 8443/TCP ekler, Podman reboot servisini etkinleştirir, iki container'ı kurar ve HTTPS sağlık kontrolünü doğrular:

```bash
git clone https://github.com/jacobevci-lab/Fornost-GRC.git
cd Fornost-GRC
sudo bash scripts/linux/bootstrap.sh
```

Installer sırasıyla şunları yapar:

1. Git, Podman, curl, OpenSSL ve firewalld paketlerini kurar.
2. `.env.onprem` yoksa güvenli varsayılanlarla oluşturur.
3. Base path, HTTPS portu, kalıcı sistem dizini ve TLS ayarlarını doğrular.
4. Cache ve container storage üzerinde en az 8 GiB boş alan bulunduğunu doğrular; yetersizse image indirmeden durur.
5. Klonlanan Git commit'ine sabitlenmiş, CI üzerinde hazırlanıp test edilmiş uygulama image paketini GitHub Release üzerinden indirir.
6. Daha önce eksiksiz indirilmiş paket varsa checksum ile doğrulayıp yeniden indirmeden kullanır.
7. İndirilen paketin SHA-256 checksum'unu doğrular ve `podman load` ile runtime'a yükler; sunucuda Node.js/npm çalıştırmaz.
8. `fornost-grc-data` kalıcı volume'ünü ve özel container ağını oluşturur.
9. Sertifika tanımlanmadıysa sunucu IP'sini SAN alanına ekleyen kendinden imzalı sertifikayı `/var/lib/fornost-grc/tls` altında üretir.
10. Uygulama ve TLS etkin Nginx proxy container'larını başlatır.
11. Host üzerindeki HTTPS uç noktasından sınırlı süreli uçtan uca sağlık kontrolü yapar.
12. İki container'ın gerçekten çalıştığını doğrular ve kurulum durumunu `/var/lib/fornost-grc/install-state.env` dosyasına yazar.
13. Hata oluşursa başarısız fazı, container durumlarını ve mevcut logları otomatik gösterir; veri volume'ünü silmez.

## 2. Güvenlik duvarı

Sunucunun aktif zone'unu kontrol edin:

```bash
sudo firewall-cmd --get-active-zones
```

Tüm yerel ağdan erişim gerekiyorsa gerçek aktif zone adını kullanın:

```bash
sudo firewall-cmd --permanent --zone=public --add-port=8443/tcp
sudo firewall-cmd --reload
```

Yalnız belirli bir kurumsal ağdan erişim için daha güvenli örnek:

```bash
sudo firewall-cmd --permanent --zone=public \
  --add-rich-rule='rule family=ipv4 source address=192.168.1.0/24 port protocol=tcp port=8443 accept'
sudo firewall-cmd --reload
```

`public` zone ve `192.168.1.0/24` değerlerini kendi ağ tasarımınıza göre değiştirin.

## 3. İlk erişim ve yönetici oluşturma

Installer'ın gösterdiği adresi tarayıcıda açın:

```text
https://192.168.1.1:8443/fornost-grc/
```

İlk ziyarette **Fornost GRC İlk Kurulum** ekranı açılır. Varsayılan sertifika kendinden imzalı olduğu için tarayıcı ilk bağlantıda güven uyarısı gösterir; sertifikanın sunucuya ait olduğunu doğruladıktan sonra ilerleyin veya aşağıdaki kurum sertifikası ayarını kullanın. Ad soyad, geçerli e-posta ve en az 12 karakterlik güçlü parola ile ilk `Admin` hesabını oluşturun. Aktif bir Admin mevcutsa standart giriş ekranı görüntülenir.

İlk erişimden önce sunucu üzerinde doğrulama çalıştırılabilir:

```bash
cd Fornost-GRC
sudo bash scripts/linux/check.sh
sudo podman ps --filter name=fornost-grc
curl --fail --silent --insecure https://127.0.0.1:8443/fornost-grc/api/auth
```

## 4. Adres ve port yapılandırması

İlk çalıştırmada oluşan `.env.onprem`:

```dotenv
FORNOST_BASE_PATH=/fornost-grc
FORNOST_HTTPS_PORT=8443
FORNOST_MIN_FREE_MB=8192
FORNOST_STATE_DIR=
FORNOST_TLS_CERT_FILE=
FORNOST_TLS_KEY_FILE=
FORNOST_TLS_HOSTNAME=
FORNOST_BUILD_LOCAL=false
```

Örneğin `https://192.168.1.1:9443/grc/` için:

```dotenv
FORNOST_BASE_PATH=/grc
FORNOST_HTTPS_PORT=9443
```

Sonra kurulumu tekrar çalıştırın:

```bash
sudo bash scripts/linux/install.sh
```

Base path `/` ile başlamalı ve yalnız harf, rakam, `/`, `_` veya `-` içermelidir. Port `1-65535` aralığında olmalıdır.

`FORNOST_MIN_FREE_MB` güvenlik eşiğidir. Üretim kurulumunda düşürülmesi önerilmez; mevcut image bundle sıkıştırılmış görünse de container katmanları açılırken birkaç GiB geçici ve kalıcı alan gerekir.

Önceden hazırlanmış image `/fornost-grc` yolu ve x86_64/amd64 sunucular içindir. Farklı bir base path veya mimari için geliştirme amaçlı yerel build açıkça etkinleştirilebilir:

```bash
sudo FORNOST_BUILD_LOCAL=true bash scripts/linux/install.sh
```

Bu seçenek Node/npm image build'ini tekrar sunucuya taşır; standart üretim kurulumu değildir.

## 5. TLS sertifikası

Sertifika alanları boş bırakıldığında rootful installer `/var/lib/fornost-grc/tls/tls.crt` ve `/var/lib/fornost-grc/tls/tls.key` dosyalarını bir kez üretip tekrar kullanır. Rootless kurulumda varsayılan dizin `$HOME/.local/share/fornost-grc` olur. Bu dizin repo dışında kaldığı için kaynak klasörü silinse veya yeniden klonlansa da sertifika korunur. Başlangıç sertifikası bağlantıyı şifreler ancak istemciler sertifikayı otomatik güvenilir saymaz.

Kurumsal CA veya güvenilir bir sertifika sağlayıcısından alınan PEM dosyalarını kullanmak için her iki yolu birlikte tanımlayın. Göreli yollar repo kökünden çözülür:

```dotenv
FORNOST_TLS_CERT_FILE=certs/fornost.example.local.crt
FORNOST_TLS_KEY_FILE=certs/fornost.example.local.key
```

DNS adıyla kendinden imzalı sertifika üretilecekse ilk kurulumdan önce şu değeri verin:

```dotenv
FORNOST_TLS_HOSTNAME=fornost.example.local
```

Kurum sertifikası dosyalarını repoya göndermeyin. Özel anahtarı yalnız root/runtime kullanıcısının okuyabildiği izinlerle saklayın. Sertifika değiştirildikten sonra `scripts/linux/install.sh` komutunu tekrar çalıştırın.

## 6. Rootless Podman veya Docker

Varsayılan 8443 portu rootless Podman veya Docker ile kullanılabilir. `.env.onprem` oluşturup installer'ı `sudo` olmadan çalıştırın:

```bash
cp .env.onprem.example .env.onprem
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

## 7. HTTPS güvenlik notları

Installer HTTP portu yayınlamaz; dış erişim doğrudan HTTPS 8443 üzerinden TLS 1.2/1.3 ile sağlanır. Üretimde kendinden imzalı sertifika yerine kurum istemcilerinin güvendiği bir sertifika kullanın. Ayrı bir load balancer veya ingress TLS sonlandıracaksa upstream doğrulamasını kapatmak yerine Fornost sertifikasını güven deposuna ekleyin ve upstream olarak `https://SUNUCU_IP:8443` kullanın.

Uygulamayı doğrudan internete açmayın. Erişimi VPN, kurumsal ağ veya güvenilir reverse proxy ile sınırlandırın.

## 8. Temiz yeniden kurulum

Runtime'ı kaldırıp uygulama verisini koruyun, eski kaynak klasörünü geri alınabilir biçimde kenara taşıyın ve repoyu yeniden klonlayın:

```bash
cd "$HOME/Fornost-GRC"
sudo bash scripts/linux/uninstall.sh
cd "$HOME"
mv Fornost-GRC "Fornost-GRC.backup-$(date +%Y%m%d-%H%M%S)"
git clone https://github.com/jacobevci-lab/Fornost-GRC.git
cd Fornost-GRC
sudo bash scripts/linux/bootstrap.sh
```

Bu akış `fornost-grc-data` volume'ünü ve `/var/lib/fornost-grc` altındaki TLS durumunu korur. Yeni kurulum doğrulandıktan sonra eski `Fornost-GRC.backup-*` klasörü kaldırılabilir.

## 9. Güncelleme

Önce yedek alın, ardından yalnız fast-forward güncelleme uygulayın:

```bash
cd Fornost-GRC
git status --short
git pull --ff-only origin main
sudo bash scripts/linux/bootstrap.sh
sudo bash scripts/linux/check.sh
```

Installer container'ları yeniden oluşturur ancak `fornost-grc-data` volume'ünü silmez.

## 10. Durum ve loglar

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

## 11. Yedekleme

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

## 12. Kaldırma

Uygulamayı kaldırıp veriyi korumak için:

```bash
sudo bash scripts/linux/uninstall.sh
```

Kalıcı veri volume'ü bu işlemlerle korunur. **Aşağıdaki komut tüm uygulama kayıtlarını ve yüklenen kanıtları geri dönüşsüz siler:**

Kalıcı veriyi bilinçli olarak silmek için iki aşamalı onay gerekir:

```bash
sudo FORNOST_CONFIRM_PURGE=DELETE bash scripts/linux/uninstall.sh --purge-data
```

## 13. Sorun giderme

- `GLIBC_2.xx not found`: Host üzerinde `serve.sh` çalıştırmayın; container tabanlı `install.sh` kullanın.
- `Port 443 requires root privileges`: `sudo` kullanın veya `.env.onprem` içinde varsayılan `FORNOST_HTTPS_PORT=8443` değerini kullanın.
- `address already in use`: Portu değiştirin ya da portu kullanan servisi `sudo ss -lntp | grep ':8443 '` ile belirleyin.
- Tarayıcı sertifika uyarısı: Başlangıç sertifikası kendinden imzalıdır; kurum sertifikası tanımlayın veya kurum CA'sını istemcilere güvenilir olarak dağıtın.
- `prebuilt application image download` hatası: Klonlanan commit için CI paketinin yayımlandığını ve sunucunun GitHub Release indirme uçlarına erişebildiğini doğrulayın. Installer başka bir commit'in paketine geçmez.
- `application image checksum verification` hatası: İndirme bozulmuş veya değiştirilmiştir; `/var/lib/fornost-grc/cache` içindeki ilgili paketi silip kurulumu yeniden çalıştırın. Doğrulama geçmeden image yüklenmez.
- `disk capacity preflight` veya `Insufficient disk space`: İlgili dosya sisteminde en az 8 GiB boş alan oluşturun. `df -h / /var /var/tmp` ve `sudo podman system df` ile kontrol edin; installer alan yeterli olmadan paketi indirmez veya açmaz.
- `read/write on closed pipe` ve `application image build`: Eski installer sunucuda build yapıyordur veya `FORNOST_BUILD_LOCAL=true` verilmiştir. Güncel `main` dalını çekin ve bu değişkeni kaldırın.
- Nginx image indirilemiyor: Proxy/DNS ayarlarını ve Docker Hub erişimini kontrol edin.
- Uygulama sağlıklı olmuyor: `sudo podman logs --tail 200 fornost-grc-app` çalıştırın.
- Proxy sağlıklı olmuyor: `sudo podman logs --tail 200 fornost-grc-proxy` ve `sudo firewall-cmd --get-active-zones` çıktısını kontrol edin.
- İlk yönetici yerine giriş ekranı: Kalıcı volume içinde daha önce oluşturulmuş aktif bir Admin vardır.
- SELinux izin hatası: Volume mount'larda kullanılan `:Z` etiketini kaldırmayın; `sudo ausearch -m AVC -ts recent` ile olayı inceleyin.
- Container listesi boş: `sudo bash scripts/linux/bootstrap.sh` çalıştırın. Yeni installer başarısız fazı ve runtime loglarını aynı terminal çıktısında gösterir.

## 14. Kurulum sonrası kontrol listesi

- [ ] `scripts/linux/bootstrap.sh` sunucuda npm/build çalıştırmadan hata vermeden tamamlandı.
- [ ] Kurulumdan önce en az 8 GiB boş alan doğrulandı.
- [ ] `scripts/linux/check.sh` sağlık kontrolünü geçti.
- [ ] `fornost-grc-app` ve `fornost-grc-proxy` çalışıyor.
- [ ] Tarayıcıda `/fornost-grc/` açılıyor.
- [ ] İlk Admin hesabı oluşturuldu ve tekrar giriş test edildi.
- [ ] Firewall yalnız gerekli kaynak ağlara izin veriyor.
- [ ] HTTPS 8443 erişimi doğrulandı ve üretimde güvenilir kurum sertifikası tanımlandı.
- [ ] `fornost-grc-data` volume yedeği alındı ve saklama politikası belirlendi.
