# Linux Kurulum Rehberi

Bu rehber Nexora GRC'yi Ubuntu/Debian veya RHEL/Fedora tabanlı bir Linux sunucuda, repodan çekerek yerel ve kalıcı D1/R2 depolama ile çalıştırır.

> Bu kurulum, Cloudflare D1 ve R2'nin yerel Miniflare emülasyonunu kullanır. Kurumsal production yayını ve yönetilen yedekleme için OpenAI Sites/Cloudflare dağıtımı kullanılmalıdır.

## Sistem gereksinimleri

- 64-bit Linux
- glibc `>=2.28` kullanan x86_64 veya arm64 Linux (Ubuntu 20.04+, Debian 10+, RHEL/Rocky/Alma 8+)
- Node.js `>=22.13.0`; yoksa veya eskiyse kurulum resmi Node.js 22 arşivini checksum doğrulamasıyla proje içine otomatik kurar
- npm, Git, curl, GNU coreutils (`timeout`, `sha256sum`) ve util-linux (`flock`)
- En az 2 GB RAM, 2 vCPU ve 5 GB boş disk
- Uygulama portuna erişim (varsayılan `3000/tcp`)

Ubuntu/Debian araçları:

```bash
sudo apt-get update
sudo apt-get install -y curl git coreutils util-linux xz-utils
```

RHEL/Fedora araçları:

```bash
sudo dnf install -y curl git coreutils util-linux xz
```

Node.js sürümünü doğrulayın:

```bash
node --version
npm --version
```

Sistemde Node.js 10/12/16/18 gibi eski bir sürüm bulunması kurulumu engellemez. `npm run setup:linux`, desteklenen işletim sistemlerinde `.sites-runtime/node` altında izole Node.js 22 kurar ve uygulama komutlarında onu kullanır. Sistem genelindeki Node.js değiştirilmez.

## Tek komutla uygulama kurulumu

```bash
git clone https://github.com/jacobevci-lab/CISO-GRC.git
cd CISO-GRC
git switch production
npm run setup:linux
```

Kurulum; kilitli bağımlılıkları yükler, lint ve testleri çalıştırır, production Worker çıktısını üretir ve yerel kalıcı D1/R2 alanını hazırlar.

## Yapılandırma

Kurulum ilk çalıştırmada `.env.example` dosyasını `.env` olarak kopyalar:

```dotenv
PORT=3000
HOST=0.0.0.0
```

Portu değiştirdikten sonra servisi yeniden başlatın. `.env` dosyasını repoya göndermeyin.

## Elle çalıştırma

```bash
npm run serve:linux
```

Tarayıcıdan `http://SUNUCU_IP:3000` adresini açın. Güvenlik duvarı kullanılıyorsa yalnız güvenilen ağlardan erişim verin:

```bash
sudo ufw allow from 10.0.0.0/8 to any port 3000 proto tcp
```

## systemd servisi

Repo sahibi olan normal kullanıcı ile kurulumu tamamladıktan sonra:

```bash
sudo bash scripts/linux/install-systemd.sh
```

Farklı kullanıcı veya port:

```bash
sudo APP_USER=nexora PORT=8080 bash scripts/linux/install-systemd.sh
```

Yönetim komutları:

```bash
sudo systemctl status nexora-grc
sudo systemctl restart nexora-grc
sudo journalctl -u nexora-grc -f
sudo systemctl disable --now nexora-grc
```

## Güncelleme

```bash
cd CISO-GRC
git pull --ff-only origin production
npm run setup:linux
sudo systemctl restart nexora-grc
```

Yerel veriler `.sites-runtime/data` altında tutulur ve güncellemede silinmez.

## Ters proxy ve TLS

Uygulamayı doğrudan internete açmak yerine Nginx, Caddy veya kurumsal load balancer arkasında TLS ile yayınlayın. Proxy'nin `127.0.0.1:3000` hedefine yönlenmesi için `.env` içindeki `HOST=127.0.0.1` değerini kullanabilirsiniz.

## Sorun giderme

```bash
git status -sb
node --version
npm run lint
npm test
npm run validate:artifact
sudo journalctl -u nexora-grc -n 200 --no-pager
```

- `GNU timeout` veya `flock` bulunamıyorsa işletim sistemi paketlerini yükleyin.
- `glibc >=2.28` hatası alırsanız işletim sistemi RHEL/CentOS 7 veya benzeri eski bir tabandadır; işletim sistemini desteklenen sürüme yükseltin.
- Node.js indirmesi başarısızsa sunucunun `nodejs.org:443` adresine erişebildiğini doğrulayın.
- Port kullanımda ise `.env` içindeki `PORT` değerini değiştirin.
- Kurulum yarıda kalırsa aynı `npm run setup:linux` komutunu yeniden çalıştırabilirsiniz.
