# Panduan Org Chart Keluarga

## Menjalankan Aplikasi

1. Instal dependensi:
   - `npm install`
2. Jalankan aplikasi:
   - `npm run dev`
3. Buka URL yang ditampilkan di terminal.

Catatan: file `cleaned_data_v3.json` berada di root proyek dan akan dibaca langsung oleh aplikasi.

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
