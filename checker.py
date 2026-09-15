import asyncio
import os
import sys
from typing import Dict, Any, Optional, Callable
from playwright.async_api import async_playwright, Browser, BrowserContext, Page

# Path to installed real Google Chrome if available
DEFAULT_CHROME_PATH = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
if not os.path.exists(DEFAULT_CHROME_PATH):
    alt_path = r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
    if os.path.exists(alt_path):
        DEFAULT_CHROME_PATH = alt_path
    else:
        DEFAULT_CHROME_PATH = None

class GoogleEmailChecker:
    def __init__(
        self,
        headless: bool = True,
        use_system_chrome: bool = True,
        timeout_ms: int = 15000,
        status_callback: Optional[Callable[[Dict[str, Any]], None]] = None
    ):
        self.headless = headless
        self.use_system_chrome = use_system_chrome
        self.timeout_ms = timeout_ms
        self.status_callback = status_callback
        self._playwright = None
        self._browser: Optional[Browser] = None
        self.is_running = False

    async def start(self):
        """Initializes Playwright and launches the browser."""
        self._playwright = await async_playwright().start()
        launch_args = [
            "--disable-blink-features=AutomationControlled",
            "--no-sandbox",
            "--disable-dev-shm-usage",
            "--disable-infobars",
            "--disable-gpu",
            "--disable-extensions",
            "--disable-component-update",
            "--disable-background-networking",
            "--blink-settings=imagesEnabled=false",
            "--window-size=1280,800",
            "--lang=id-ID,id,en-US,en"
        ]
        
        launch_kwargs = {
            "headless": self.headless,
            "args": launch_args
        }

        # Use system Chrome if requested and present
        if self.use_system_chrome and DEFAULT_CHROME_PATH and os.path.exists(DEFAULT_CHROME_PATH):
            launch_kwargs["executable_path"] = DEFAULT_CHROME_PATH
        
        try:
            self._browser = await self._playwright.chromium.launch(**launch_kwargs)
        except Exception as e:
            if "executable_path" in launch_kwargs:
                del launch_kwargs["executable_path"]
                self._browser = await self._playwright.chromium.launch(**launch_kwargs)
            else:
                raise e

        self.is_running = True

    async def close(self):
        """Closes browser instances and playwright."""
        self.is_running = False
        if self._browser:
            try:
                await self._browser.close()
            except Exception:
                pass
            self._browser = None
        if self._playwright:
            try:
                await self._playwright.stop()
            except Exception:
                pass
            self._playwright = None

    async def check_email(self, email: str) -> Dict[str, Any]:
        """Checks a single email on Google Login."""
        email = email.strip()
        if not email:
            return {"email": email, "status": "INVALID", "detail": "Format email kosong", "has_captcha": False}

        if not self._browser:
            await self.start()

        context: BrowserContext = await self._browser.new_context(
            viewport={"width": 1280, "height": 800},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
            locale="id-ID"
        )

        page: Page = await context.new_page()

        # Mask webdriver property for stealth
        await page.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined
            });
        """)

        result = {
            "email": email,
            "status": "UNKNOWN",
            "detail": "",
            "has_captcha": False
        }

        # Block heavy resources (media, fonts, tracking) to save RAM & CPU
        await page.route(
            "**/*",
            lambda route: route.abort() if route.request.resource_type in ["media", "font"]
            or any(t in route.request.url for t in ["google-analytics", "doubleclick", "googletagmanager"])
            else route.continue_()
        )

        try:
            # Navigate to Google ServiceLogin
            await page.goto("https://accounts.google.com/ServiceLogin?hl=id", timeout=self.timeout_ms)
            
            # Wait for identifier input
            email_input = await page.wait_for_selector(
                'input#identifierId, input[name="identifier"]',
                timeout=10000
            )

            if not email_input:
                result["status"] = "ERROR"
                result["detail"] = "Kolom input email Google tidak ditemukan"
                return result

            # Fill email
            await email_input.fill(email)
            await asyncio.sleep(0.3)

            # Click Next button
            next_btn = await page.query_selector('#identifierNext button, #identifierNext')
            if next_btn:
                await next_btn.click()
            else:
                await email_input.press("Enter")

            # Polling up to 7 seconds for Google's decision
            start_time = asyncio.get_event_loop().time()
            classified = False

            while asyncio.get_event_loop().time() - start_time < 7.0:
                await asyncio.sleep(0.6)
                body_text = (await page.inner_text("body")).lower()

                # 1. Check if CAPTCHA or Bot Challenge appears
                ca_input = await page.query_selector('input#ca, input[name="ca"]')
                ca_visible = await ca_input.is_visible() if ca_input else False
                captcha_img = await page.query_selector('img#captchaimg')
                img_visible = await captcha_img.is_visible() if captcha_img else False
                recaptcha_frame = await page.query_selector('iframe[src*="recaptcha"]')
                frame_visible = await recaptcha_frame.is_visible() if recaptcha_frame else False

                is_captcha = (
                    ca_visible or
                    img_visible or
                    frame_visible or
                    "konfirmasi bahwa anda bukan robot" in body_text or
                    "confirm you’re not a robot" in body_text or
                    "ketik teks yang anda dengar atau lihat" in body_text or
                    ("verifikasi diri anda" in body_text and "bukan robot" in body_text)
                )

                if is_captcha:
                    result["status"] = "CAPTCHA"
                    result["has_captcha"] = True
                    result["detail"] = "Muncul verifikasi CAPTCHA / Konfirmasi Bukan Robot"
                    classified = True
                    break

                # 2. Check if CLEAN -> transitions directly to password input
                pwd_input = await page.query_selector('input[type="password"]:not([name="hiddenPassword"])')
                pwd_visible = await pwd_input.is_visible() if pwd_input else False
                is_clean = (
                    pwd_visible or
                    "masukkan sandi anda" in body_text or
                    "masukkan sandi" in body_text or
                    "enter your password" in body_text
                )

                if is_clean:
                    result["status"] = "CLEAN"
                    result["has_captcha"] = False
                    result["detail"] = "Langsung mengarah ke Password (Clean - Siap Login)"
                    classified = True
                    break

                # 3. Check if Account Not Found
                is_not_found = (
                    "tidak dapat menemukan akun" in body_text or
                    "couldn’t find your google account" in body_text or
                    "couldn't find your google account" in body_text
                )
                if is_not_found:
                    result["status"] = "NOT_FOUND"
                    result["has_captcha"] = False
                    result["detail"] = "Akun tidak terdaftar di Google"
                    classified = True
                    break

                # 4. Check if Blocked / Insecure browser
                is_blocked = (
                    "browser atau aplikasi ini mungkin tidak aman" in body_text or
                    "this browser or app may not be secure" in body_text
                )
                if is_blocked:
                    result["status"] = "BLOCKED"
                    result["has_captcha"] = False
                    result["detail"] = "Google mendeteksi browser automasi (Coba mode Chrome sistem)"
                    classified = True
                    break

                # 5. Check if Rate limited
                if "terlalu banyak upaya yang gagal" in body_text or "coba lagi dalam beberapa saat" in body_text:
                    result["status"] = "RATE_LIMITED"
                    result["has_captcha"] = False
                    result["detail"] = "IP Terkena limit sementara oleh Google"
                    classified = True
                    break

            if not classified:
                # Fallback inspection
                body_text = (await page.inner_text("body")).lower()
                if "sandi" in body_text or "password" in body_text:
                    result["status"] = "CLEAN"
                    result["has_captcha"] = False
                    result["detail"] = "Langsung mengarah ke Password"
                elif "robot" in body_text or "captcha" in body_text:
                    result["status"] = "CAPTCHA"
                    result["has_captcha"] = True
                    result["detail"] = "Terdeteksi CAPTCHA"
                else:
                    result["status"] = "UNKNOWN"
                    result["detail"] = "Respon tidak dapat diklasifikasikan secara pasti"

        except Exception as ex:
            result["status"] = "ERROR"
            result["detail"] = f"Kesalahan: {str(ex)}"
        finally:
            try:
                await page.close()
                await context.close()
            except Exception:
                pass

        return result
