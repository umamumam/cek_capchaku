# Mail Checker by Umam (Gmail Captcha & Verification Suite)

Aplikasi automasi pengecekan massal (bulk) email Google/Gmail untuk mendeteksi apakah email langsung mengarah ke pengisian password (**Clean**) atau memicu verifikasi **CAPTCHA / Konfirmasi Bukan Robot**.

---

## 📋 Persyaratan Sistem (Prerequisites)

Sebelum menjalankan aplikasi di komputer/laptop baru, pastikan:
1. **Python 3.10 atau versi lebih baru** sudah terinstal.
   - *Catatan Penting saat install Python:* Pastikan centang opsi **"Add Python to PATH"**.
2. **Google Chrome** resmi sudah terpasang di Windows (opsional tapi sangat disarankan).

---

## 🛠️ Cara Set Up (Instalasi Pertama Kali)

### Cara 1: Menggunakan `setup.bat` (Otomatis & Termudah)
Cukup **klik ganda (double-click)** file **`setup.bat`**.
Script akan otomatis menginstal seluruh library yang dibutuhkan (`FastAPI`, `Uvicorn`, `Websockets`, `Playwright`) serta mengunduh komponen Chromium.

### Cara 2: Manual via Terminal / Command Prompt
Buka CMD di folder proyek ini (`h:\cekcapcha`), lalu ketik perintah berikut:
```bash
pip install -r requirements.txt
python -m playwright install chromium
```

---

## 🚀 Cara Menjalankan Aplikasi

Setelah setup selesai:

### Cara 1: Klik Ganda `run.bat`
Klik ganda file **`run.bat`**. Jendela aplikasi akan otomatis terbuka di browser Anda di alamat:
👉 **http://localhost:8000**

### Cara 2: Lewat Command Prompt
```bash
python server.py
```
Lalu buka browser Anda ke [http://localhost:8000](http://localhost:8000).

---

## 🌟 Fitur Utama

- **Live Checker**: Pengecekan massal real-time dengan counter langsung.
- **Auto Rapikan**: Tombol otomatis membersihkan format `email:password`, CSV, atau teks acak menjadi email murni.
- **Riwayat Akun**: Seluruh email yang dicek otomatis tersimpan permanen di perangkat lokal (`history.json`).
- **Export Data Interaktif**: Bisa memilih unduh TXT (Hanya Email), TXT (Lengkap), atau CSV Spreadsheet untuk sesi ini maupun seluruh riwayat.
- **Anti-Deteksi Ringan**: Mode headless, resource blocking (media/fonts/trackers nonaktif), dan integrasi Google Chrome asli sistem.
