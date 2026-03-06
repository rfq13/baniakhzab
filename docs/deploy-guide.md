# Panduan Deployment CI/CD (DigitalOcean + GitHub Actions)

Dokumen ini menjelaskan langkah-langkah untuk mendeploy aplikasi **Bani Akhzab** ke DigitalOcean Droplet menggunakan GitHub Actions secara otomatis.

## 1. Persiapan Server (DigitalOcean Droplet)

### Rekomendasi Spesifikasi
- **OS**: Ubuntu 22.04 LTS atau terbaru.
- **Size**: Minimal 2GB RAM (untuk menjalankan build Docker dengan lancar).
- **Service**: Aktifkan Monitoring (opsional).

### Langkah-langkah di Droplet:
1. **Instal Docker & Docker Compose**:
   Ikuti panduan resmi Docker atau gunakan shortcut:
   ```bash
   sudo apt update
   sudo apt install docker.io docker-compose-v2 -y
   sudo systemctl enable --now docker
   ```

2. **Setup SSH Key untuk GitHub**:
   - Generate key baru (jika belum ada): `ssh-keygen -t ed25519 -C "github-actions"`
   - Tambahkan public key ke `~/.ssh/authorized_keys`.
   - Simpan **Private Key**-nya untuk dimasukkan ke GitHub Secrets.

3. **Clone Repositori (Opsional - Dilakukan otomatis oleh script deploy)**:
   GitHub Action akan melakukan `git clone` jika direktori belum ada.

## 2. Konfigurasi GitHub Secrets

Buka repositori Anda di GitHub, masuk ke **Settings > Secrets and variables > Actions**. Tambahkan secret berikut untuk otomatisasi penuh:

| Nama Secret | Deskripsi | Format / Contoh |
|-------------|-----------|---------|
| `SERVER_HOST` | Alamat IP Droplet | `139.59.101.205` |
| `SERVER_USER` | Username SSH | `root` |
| `SERVER_SSH_KEY` | Private Key SSH | `-----BEGIN OPENSSH PRIVATE KEY----- ...` |
| `ENV_PRODUCTION` | Seluruh isi `.env` untuk Backend | Masukkan semua variabel backend (lihat di bawah) |
| `GOWA_ENV_PRODUCTION` | Isi `.env` untuk WhatsApp API | Masukkan variabel GoWA |

### Isi `ENV_PRODUCTION` (Salin & Tempel ke Secret GitHub)
```ini
DATABASE_URL=postgres://user:pass@db-host:5432/dbname?sslmode=require
APP_ENV=production
GOWA_BASE_URL=http://gowa:3000
GOWA_BASIC_USER=admin
GOWA_BASIC_PASS=admin
GOWA_SETUP_PASSWORD=replace_with_strong_password
AUTH_JWT_SECRET=generate_random_long_string
AUTH_FRONTEND_BASE_URL=https://silsilahku.com
LLM_API_KEY=your_openai_api_key
LLM_MODEL=gpt-4.1-mini
```

Catatan: `GOWA_BASE_URL` sengaja menggunakan host internal Docker (`http://gowa:3000`). Backend akan menormalisasi `qr_link` login WhatsApp agar tetap bisa dirender browser publik.

### Isi `GOWA_ENV_PRODUCTION` (Salin & Tempel ke Secret GitHub)
Berikut adalah konfigurasi minimal yang diperlukan agar GoWA berjalan lancar dan terintegrasi dengan backend:
```ini
# Application Settings
APP_PORT=3000
APP_HOST=0.0.0.0
APP_DEBUG=false
APP_OS=Chrome
# Gunakan format user:pass untuk Basic Auth yang akan digunakan Backend
APP_BASIC_AUTH=admin:admin
APP_TRUSTED_PROXIES=0.0.0.0/0

# Database Settings (Menggunakan SQLite di dalam volume Docker)
DB_URI="file:storages/whatsapp.db?_foreign_keys=on"

# WhatsApp Settings
WHATSAPP_AUTO_MARK_READ=true
WHATSAPP_CHAT_STORAGE=true
# Webhook: Gunakan URL internal Docker (backend:8080) agar trafik tidak keluar ke internet
WHATSAPP_WEBHOOK=http://backend:8080/api/v1/whatsapp/webhook
WHATSAPP_WEBHOOK_SECRET=generate_random_secret_for_webhook
WHATSAPP_WEBHOOK_EVENTS=message,message.ack
```

## 3. Alur Deployment Otomatis

Aplikasi sekarang menggunakan alur **Fully Automated CI/CD**:
1. Anda melakukan `git push origin main`.
2. GitHub Actions menjalankan test.
3. Jika test lulus, GitHub Actions melakukan SSH ke Droplet.
4. **Otomatisasi File ENV**: Skrip deploy akan mengambil isi dari `secrets.ENV_PRODUCTION` dan `secrets.GOWA_ENV_PRODUCTION`, lalu menuliskannya ke file `.env.production` di server secara otomatis sebelum Docker dijalankan.
5. Docker akan build dan restart container dengan environment terbaru.

## 5. Konfigurasi Nginx & SSL (Production)

File `nginx/default.conf` di repo adalah konfigurasi Nginx **di dalam container frontend**.
Untuk HTTPS production, gunakan Nginx + Certbot di **host server** sebagai reverse proxy ke container frontend.

### Menambahkan HTTPS (Let's Encrypt + Cloudflare)
1. Pastikan frontend container dipublish ke loopback host (contoh: `127.0.0.1:8081:80` di `docker-compose.prod.yml`).
2. Instal Nginx + Certbot di host:
   - `sudo apt update && sudo apt install -y nginx certbot python3-certbot-nginx`
3. Buat server block host Nginx:
   - `sudo nano /etc/nginx/sites-available/baniakhzab`
   - Isi minimal:
     - `server_name domainanda.com www.domainanda.com;`
     - `location / { proxy_pass http://127.0.0.1:8081; }`
4. Aktifkan site dan nonaktifkan default:
   - `sudo ln -sf /etc/nginx/sites-available/baniakhzab /etc/nginx/sites-enabled/baniakhzab`
   - `sudo rm -f /etc/nginx/sites-enabled/default`
   - `sudo nginx -t && sudo systemctl reload nginx`
5. Jika DNS memakai Cloudflare (proxy/orange-cloud), ubah record domain ke **DNS only** sementara saat issuance sertifikat.
6. Generate sertifikat dan redirect HTTPS:
   - `sudo certbot --nginx -d domainanda.com -d www.domainanda.com --redirect`
7. Aktifkan auto-renew:
   - `sudo systemctl enable --now certbot.timer`
   - `sudo certbot renew --dry-run`

## 6. Monitoring & Troubleshooting

- **Cek Status Container**: `docker compose -f docker-compose.prod.yml ps`
- **Cek Log Backend**: `docker compose -f docker-compose.prod.yml logs -f backend`
- **Restart Manual**: `docker compose -f docker-compose.prod.yml restart`
- **Jika domain menampilkan default page Nginx**:
  - Pastikan `sites-enabled/default` sudah dihapus.
  - Pastikan `server_name` di site `baniakhzab` sesuai domain.
  - Validasi konfigurasi aktif: `sudo nginx -T | grep -nE "server_name|proxy_pass|listen 443"`

## 7. Konfigurasi DNS & Cloudflare (Domain dari Provider Lokal)

Jika Anda membeli domain di provider lokal (Niagahoster, Rumahweb, DomaiNesia, dll.) dan ingin menggunakan Cloudflare sebagai DNS Manager:

### A. Setup Cloudflare
1. **Tambah Situs**: Login ke Cloudflare, klik "Add a Site", masukkan domain Anda (misal: `silsilahku.com`).
2. **Pilih Plan**: Pilih plan "Free".
3. **Scan DNS**: Cloudflare akan memindai record DNS yang ada. Klik "Continue".
4. **Ganti Nameserver**: Cloudflare akan memberikan 2 Nameserver (misal: `arya.ns.cloudflare.com` dan `heather.ns.cloudflare.com`).

### B. Konfigurasi di Provider Lokal (Client Area)
1. Login ke panel provider tempat Anda membeli domain.
2. Cari menu **Domain Management** > **Nameservers**.
3. Ubah tipe Nameserver ke "Custom Nameserver".
4. Masukkan kedua Nameserver dari Cloudflare tadi.
5. Simpan. (Proses propagasi biasanya memakan waktu 1-24 jam).

### C. Menghubungkan Cloudflare ke DigitalOcean
1. Di Dashboard Cloudflare, buka menu **DNS > Records**.
2. Tambahkan **A Record**:
   - **Type**: `A`
   - **Name**: `@` (atau domain utama)
   - **IPv4 address**: Masukkan IP Droplet DigitalOcean Anda.
   - **Proxy Status**: `Proxied` (Awan Oranye) agar mendapatkan proteksi DDoS dan SSL Cloudflare.
3. Tambahkan **CNAME** untuk `www` jika diperlukan.

### D. Konfigurasi SSL di Cloudflare
1. Buka menu **SSL/TLS > Overview**.
2. Pilih Mode SSL:
   - **Flexible**: Jika server Anda belum punya SSL (Cloudflare ke User pakai HTTPS, Cloudflare ke Droplet pakai HTTP).
   - **Full (Strict)**: (Direkomendasikan) Jika Anda sudah mengikuti langkah **Certbot** di poin 5. Cloudflare akan memverifikasi sertifikat SSL di server Anda.

### E. Security (Opsional)
Aktifkan "Always Use HTTPS" di menu **SSL/TLS > Edge Certificates** agar semua trafik otomatis dialihkan ke HTTPS.

---
*Catatan: Pastikan database (PostgreSQL) sudah siap dan DSN-nya dimasukkan dengan benar di `.env.production`. Jika menggunakan database di dalam Docker, tambahkan service db di `docker-compose.prod.yml`.*


DATABASE_URL=postgresql://postgres.kpbkxicderaacvavcger:ao7LKq7tWy5SYTss@aws-1-ap-southeast-2.pooler.supabase.com:6543/postgres
GOWA_BASE_URL=http://gowa:3000
GOWA_BASIC_USER=admin
GOWA_BASIC_PASS=admin
GOWA_SETUP_PASSWORD=oyehSheT777-0
AUTH_JWT_SECRET=d0261692208c81bbb3dd6b0f558298bd
LLM_BASE_URL=https://llm.chutes.ai/v1 
LLM_API_KEY=cpk_5124d608e122482ab5e59e1ac097bb26.b392beeb15db5b269525c28f9c649c79.JFFHQ4o3RHDRsNxRmURNhn64AQ9mbrER
LLM_MODEL=openai/gpt-oss-120b-TEE
AUTH_FRONTEND_BASE_URL=https://baniakhzab.my.id/tree
