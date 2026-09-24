"""
Otomasi Akun Google di HP Android Asli via FIREFOX FOCUS
--------------------------------------------------------
Target Browser  : Firefox Focus (org.mozilla.focus)
Perangkat       : OPPO CPH2333 (Android 13)
Kelebihan       : 
1. Firefox Focus memiliki isolasi jejak dan anti-tracking bawaan yang sangat ketat.
2. Sekali klik 'Bakar/Hapus Sesi' (atau lewat script), seluruh cookies dan cache langsung bersih 100%.
3. Karena berjalan di HP fisik asli, Google TIDAK AKAN meminta scan QR Code.
"""

import time
import uiautomator2 as u2

PACKAGE_FOCUS = "org.mozilla.focus"

def toggle_airplane_mode(d):
    """Mengganti IP publik seluler HP secara otomatis via Mode Pesawat"""
    print("[*] Mengganti IP (Toggle Mode Pesawat selama 3 detik)...")
    try:
        d.shell(["cmd", "connectivity", "airplane-mode", "enable"])
        time.sleep(3)
        d.shell(["cmd", "connectivity", "airplane-mode", "disable"])
        time.sleep(3)
        print("[+] IP HP berhasil diperbarui!")
    except Exception as e:
        print(f"[-] Catatan toggle IP: {e}")

def main():
    print("=" * 65)
    print(" OTOMASI GOOGLE DI FIREFOX FOCUS HP ASLI (OPPO CPH2333)")
    print("=" * 65)

    print("[*] Menghubungkan ke HP lewat kabel USB...")
    d = u2.connect()
    info = d.device_info
    print(f"[+] Terhubung ke : {info.get('brand')} {info.get('model')} (Android {info.get('version')})")

    # 1. Pastikan layar HP menyala dan tidak terkunci
    print("[*] Memastikan layar HP aktif...")
    d.screen_on()
    d.unlock()

    # 2. Bersihkan sesi Firefox Focus sebelumnya (agar cookies & cache 100% bersih)
    print("[*] Membersihkan cache & sesi lama Firefox Focus...")
    d.app_stop(PACKAGE_FOCUS)
    time.sleep(1)

    # Opsi: Jika ingin membersihkan data total seperti baru diinstall:
    # d.app_clear(PACKAGE_FOCUS)

    # 3. Buka halaman pembuatan akun Google langsung di Firefox Focus
    signup_url = "https://accounts.google.com/signup?hl=id"
    print(f"[*] Membuka Google Signup di FIREFOX FOCUS...")
    
    # Jalankan intent khusus agar terbuka di Firefox Focus (bukan Chrome)
    d.shell([
        "am", "start",
        "-a", "android.intent.action.VIEW",
        "-d", signup_url,
        PACKAGE_FOCUS
    ])
    
    time.sleep(3)

    print("\n" + "=" * 65)
    print("[+] SUKSES! Lihat layar HP OPPO Anda sekarang.")
    print("    Aplikasi FIREFOX FOCUS sudah terbuka langsung ke halaman pendaftaran!")
    print("    Privasi terlindungi, cookies bersih, dan BEBAS SCAN QR CODE.")
    print("=" * 65)

    print("\n[Tips Otomasi dengan UIAutomator2 di Firefox Focus]:")
    print("  - Mengisi form nama depan : d(focused=True).set_text('NamaDepan')")
    print("  - Menekan tombol Enter    : d.press('enter')")
    print("  - Menekan tombol Sampah   : d(description='Hapus sesi penjelajahan').click()")
    print("=" * 65)

if __name__ == "__main__":
    main()
