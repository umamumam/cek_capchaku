"""
Demo Camoufox Async API (Cocok untuk Backend / FastAPI / Script Otomasi Paralel)
-------------------------------------------------------------------------------
"""

import asyncio
from camoufox.async_api import AsyncCamoufox

async def check_email_with_camoufox(email: str):
    print(f"[*] Menjalankan Camoufox untuk cek email: {email}")
    
    # headless=False agar browser Firefox terlihat di monitor
    # Jika ingin berjalan di background tanpa jendela, ubah ke headless=True
    async with AsyncCamoufox(headless=False, humanize=True) as browser:
        page = await browser.new_page()
        
        print(f"[*] Membuka halaman login Google...")
        await page.goto("https://accounts.google.com/signin/v2/identifier?flowName=GlifWebSignIn&flowEntry=ServiceLogin")
        
        # Isi input email
        email_input = page.locator('input[type="email"]')
        await email_input.wait_for(state="visible", timeout=15000)
        await email_input.fill(email)
        
        # Klik tombol Berikutnya
        btn_next = page.locator('#identifierNext button, button:has-text("Berikutnya"), button:has-text("Next")')
        await btn_next.click()
        
        print("[*] Menunggu respon halaman Google (5 detik)...")
        await asyncio.sleep(5)
        
        url_after = page.url
        print(f"[*] URL setelah submit: {url_after}")
        
        # Cek apakah terdeteksi / kena CAPTCHA / minta password
        content = await page.content()
        if "captcha" in content.lower() or "recaptcha" in content.lower():
            print("[-] Hasil: Terdeteksi CAPTCHA")
        elif "password" in content.lower() or "challenge/pwd" in url_after:
            print("[+] Hasil: Email VALID, diminta masukkan password!")
        else:
            print("[?] Hasil: Cek tampilan browser langsung.")

if __name__ == "__main__":
    test_email = "contoh.email123@gmail.com"
    asyncio.run(check_email_with_camoufox(test_email))
