import os
import sys
import zipfile
import requests
import orjson
import time
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from camoufox.pkgman import CamoufoxFetcher, ensure_browser_profile_dir
from camoufox.multiversion import set_active, BROWSERS_DIR, COMPAT_FLAG, version_folder_name, get_repo_name

def download_part(url, start_byte, end_byte, file_path, part_num, progress_dict):
    headers = {"Range": f"bytes={start_byte}-{end_byte}"}
    resp = requests.get(url, headers=headers, stream=True, timeout=60)
    resp.raise_for_status()
    
    with open(file_path, "r+b") as f:
        f.seek(start_byte)
        for chunk in resp.iter_content(chunk_size=512 * 1024):
            if chunk:
                f.write(chunk)
                progress_dict[part_num] += len(chunk)

def install():
    print("=" * 60)
    print("[*] MEMULAI INSTALLER CEPAT (PARALLEL) CAMOUFOX ANTI-DETECT")
    print("=" * 60)
    
    fetcher = CamoufoxFetcher()
    url = fetcher.url
    repo_name = get_repo_name(fetcher.github_repo)
    folder_name = version_folder_name(fetcher.version, fetcher.build, "")
    install_path = BROWSERS_DIR / repo_name / folder_name
    zip_temp = Path(os.environ.get("TEMP", ".")) / "camoufox_dl.zip"

    print(f"[*] Target URL  : {url}")
    print(f"[*] Install ke   : {install_path}")
    print(f"[*] File Cache   : {zip_temp}")

    # Cek total size
    h = requests.head(url, timeout=30)
    total_size = int(h.headers.get("content-length", 0))
    if not total_size:
        # Fallback jika head tidak ada content-length
        resp = requests.get(url, stream=True, timeout=30)
        total_size = int(resp.headers.get("content-length", 493138806))

    total_mb = round(total_size / (1024 * 1024), 1)
    print(f"[*] Ukuran File  : {total_mb} MB")

    # Alokasi file zip kosong
    print("[*] Menyiapkan file buffer di disk...")
    with open(zip_temp, "wb") as f:
        f.seek(total_size - 1)
        f.write(b"\0")

    # Bagi menjadi 4 thread paralel
    NUM_WORKERS = 4
    chunk_size = total_size // NUM_WORKERS
    progress_dict = {i: 0 for i in range(NUM_WORKERS)}
    
    print(f"[*] Mendownload dengan {NUM_WORKERS} koneksi paralel simultan...")
    t0 = time.time()
    
    with ThreadPoolExecutor(max_workers=NUM_WORKERS) as executor:
        futures = []
        for i in range(NUM_WORKERS):
            start = i * chunk_size
            end = (start + chunk_size - 1) if i < NUM_WORKERS - 1 else (total_size - 1)
            f = executor.submit(download_part, url, start, end, zip_temp, i, progress_dict)
            futures.append(f)
        
        # Monitor progress loop
        while not all(f.done() for f in futures):
            time.sleep(2)
            done_bytes = sum(progress_dict.values())
            done_mb = round(done_bytes / (1024 * 1024), 1)
            pct = round((done_bytes / total_size) * 100, 1)
            elapsed = time.time() - t0
            speed = round((done_bytes / (1024 * 1024)) / max(elapsed, 1), 2)
            print(f"    [Download] {done_mb} / {total_mb} MB ({pct}%) - Kecepatan: {speed} MB/s", flush=True)

        for f in futures:
            f.result()

    print("[*] Unduhan SELESAI 100%! Mengekstrak zip ke folder Camoufox...")
    install_path.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_temp, "r") as zf:
        zf.extractall(install_path)

    # Bersihkan file zip sementara
    try:
        os.remove(zip_temp)
    except Exception:
        pass

    # Tulis metadata version.json
    metadata = {
        "version": str(fetcher.version),
        "build": str(fetcher.build),
        "prerelease": getattr(fetcher, "is_prerelease", False),
        "sha256": getattr(fetcher, "installed_sha256", None),
        "created_at": getattr(fetcher, "installed_created_at", None),
    }
    with open(install_path / "version.json", "wb") as f:
        f.write(orjson.dumps(metadata))

    # Konfigurasi aktif Camoufox
    rel_active = f"browsers/{repo_name}/{folder_name}"
    set_active(rel_active)
    COMPAT_FLAG.touch()
    ensure_browser_profile_dir()

    print("=" * 60)
    print("[+] SUKSES BESAR! Engine Camoufox telah terpasang sempurna!")
    print(f"[+] Lokasi Browser: {install_path}")
    print("=" * 60)

if __name__ == "__main__":
    install()
