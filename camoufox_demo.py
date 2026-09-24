"""
Camoufox Anti-Detect Browser (Optimized for Google & Hotspot HP)
----------------------------------------------------------------
Konfigurasi:
1. addons=[]        -> Adblocker (uBlock Origin) DIMATIKAN TOTAL agar telemetri Google tidak curiga
2. block_webrtc=False -> WebRTC AKTIF NORMAL agar IP Hotspot HP terdeteksi asli
3. block_images=False -> Seluruh gambar & script visual Google dimuat utuh
4. humanize=True    -> Pergerakan mouse & delay input disimulasikan seperti manusia
5. enable_cache=True -> Browser menyimpan cache alami seperti pemakaian normal
"""

import time
import sys
from camoufox.sync_api import Camoufox

def run_optimized_browser():
    print("=" * 65)
    print(" CAMOUFOX ANTI-DETECT (OPTIMAL UNTUK JARINGAN HP & GOOGLE)")
    print("=" * 65)
    print("Pilih mode browser yang ingin dijalankan:")
    print("  [1] Mode Emulasi HP Android (Direkomendasikan agar TIDAK kena QR Code)")
    print("  [2] Mode Laptop / Desktop Windows (Tanpa Adblocker & Natural)")
    print("=" * 65)
    
    # Baca input pilihan dari user (default 1 jika langsung enter)
    try:
        pilihan = input("Pilih [1 atau 2] (Default: 1): ").strip()
    except (EOFError, KeyboardInterrupt):
        pilihan = "1"
        
    if pilihan == "2":
        is_mobile_mode = False
        print("\n[*] Menjalankan MODE DESKTOP WINDOWS (Tanpa Adblocker)...")
    else:
        is_mobile_mode = True
        print("\n[*] Menjalankan MODE EMULASI HP ANDROID (Anti Scan QR Code)...")

    # Konfigurasi dasar Camoufox (Adblocker OFF, WebRTC ON, Images ON)
    camoufox_kwargs = {
        "headless": False,
        "humanize": True,
        "addons": [],              # MEMATIKAN UBO / ADBLOCKER TOTAL
        "block_webrtc": False,     # WebRTC aktif alami
        "block_images": False,     # Gambar aktif utuh
        "enable_cache": True,      # Cache browser aktif
    }

    if is_mobile_mode:
        # Menyamar dengan resolusi layar ponsel
        camoufox_kwargs["os"] = "windows"
        camoufox_kwargs["screen"] = {"width": 412, "height": 915}

    with Camoufox(**camoufox_kwargs) as browser:
        if is_mobile_mode:
            # Buat context dengan touch support & mobile user-agent
            context = browser.new_context(
                is_mobile=True,
                has_touch=True,
                viewport={"width": 412, "height": 892},
                user_agent="Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36"
            )
        else:
            context = browser.new_context(
                viewport={"width": 1280, "height": 800}
            )

        page = context.new_page()

        print("[*] Melakukan warm-up awal di Google.com agar mendapatkan cookie alami...")
        page.goto("https://www.google.com", wait_until="domcontentloaded")
        time.sleep(2)

        print("[*] Mengarahkan ke halaman pendaftaran Google...")
        # Buka halaman pendaftaran akun Google
        page.goto("https://accounts.google.com/signup?hl=id", wait_until="domcontentloaded")

        print("\n" + "=" * 65)
        print("[+] BROWSER SUDAH TERBUKA DI LAYAR!")
        print("    - Adblocker  : DIMATIKAN (Google Analytics/telemetri lolos wajar)")
        print("    - WebRTC     : DIAKTIFKAN (Menggunakan IP jaringan Hotspot HP Anda)")
        if is_mobile_mode:
            print("    - Tampilan   : Emulasi HP Android (QR code tidak akan muncul)")
        else:
            print("    - Tampilan   : Desktop Windows Normal")
        print("=" * 65)
        print("Silakan isi nama, tanggal lahir, dan lanjutkan proses pendaftaran di browser.")
        print("Tekan Enter di terminal ini jika sudah selesai untuk menutup browser...")
        
        try:
            input()
        except (EOFError, KeyboardInterrupt):
            time.sleep(60)

        print("\nMenutup browser. Selesai!")

if __name__ == "__main__":
    run_optimized_browser()
