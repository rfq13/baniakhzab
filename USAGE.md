# Panduan Org Chart Keluarga

## Menjalankan Aplikasi

1. Instal dependensi:
   - `npm install`
2. Jalankan aplikasi:
   - `npm run dev`
3. Buka URL yang ditampilkan di terminal.

Catatan: file `cleaned_data_v3.json` berada di root proyek dan akan dibaca langsung oleh aplikasi.

## API Backend Utama

- `GET /api/v1/tree`
  - Header: `Authorization: Bearer <access_token>`
  - Response:
    - `200 OK` dengan payload:
      - `persons`: array objek dengan kolom:
        - `id`: string
        - `full_name`: string
        - `gender`: string
        - `father_id`: string|null
        - `mother_id`: string|null
        - `spouse_ids`: array string
        - `generation`: string|null
        - `name`: alias dari `full_name`
        - `parent_id`: salah satu dari `father_id` atau `mother_id`
        - `spouse_id`: salah satu dari `spouse_ids` jika ada
        - `birth_date`: saat ini null
        - `status_mahram`: saat ini null

- `GET /api/v1/persons`
  - Header: `Authorization: Bearer <access_token>`
  - Query:
    - `limit` (opsional)
    - `offset` (opsional)
  - Response `200 OK`: array daftar person.

- `POST /api/v1/persons`
  - Header: `Authorization: Bearer <access_token>`
  - Body JSON:
    - `full_name` (wajib)
    - `gender` (opsional)
    - `wa_number` (opsional)
    - `alamat` (opsional)
    - `father_id` (opsional)
    - `mother_id` (opsional)
    - `spouse_ids` (array string, opsional)
    - `generation` (opsional)
  - Response:
    - `201 Created` dengan objek person yang tersimpan.

- `GET /api/v1/persons/{id}`
  - Header: `Authorization: Bearer <access_token>`
  - Response:
    - `200 OK` jika ditemukan.
    - `404 Not Found` jika tidak ada.

- `PUT /api/v1/persons/{id}`
  - Header: `Authorization: Bearer <access_token>`
  - Body JSON sama seperti `POST /api/v1/persons`.
  - Response `200 OK` jika berhasil.

- `DELETE /api/v1/persons/{id}`
  - Header: `Authorization: Bearer <access_token>`
  - Soft delete, response `204 No Content`.

## Cara Membaca Visualisasi

- Setiap node mewakili satu anggota keluarga.
- Garis menunjukkan hubungan keturunan dari generasi lebih tua ke generasi lebih muda.
- Tombol `+` atau `–` pada node digunakan untuk menyembunyikan atau menampilkan cabang keturunan.
- Panel pencarian digunakan untuk menemukan anggota keluarga, klik hasil untuk memusatkan tampilan.
- Hover pada node menampilkan detail tambahan seperti alamat, kondisi, dan generasi.

## Arti Warna

- Kakek-Nenek: warna utama gelap.
- Orangtua: warna sekunder.
- Anak: warna terang.
- Cucu: warna pastel.

Jika struktur keluarga lebih dalam, warna akan tetap mengikuti urutan tingkat terdekat.

## Simbol dan Interaksi

- Scroll mouse atau tombol kontrol digunakan untuk zoom in/out.
- Drag pada area kosong untuk pan.
- Mini-map di pojok membantu navigasi area besar.
