@echo off
title Setup Mail Checker by Umam
echo ========================================================
echo       Setup Mail Checker by Umam (Instalasi)            
echo ========================================================
echo.
echo [1/2] Menginstal paket Python (FastAPI, Uvicorn, Playwright)...
pip install -r requirements.txt
echo.
echo [2/2] Memastikan browser Chromium terpasang...
python -m playwright install chromium
echo.
echo ========================================================
echo   Instalasi Selesai! Sekarang buka aplikasi via: run.bat
echo ========================================================
pause
