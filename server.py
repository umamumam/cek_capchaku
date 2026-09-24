import asyncio
import json
import csv
import io
import os
import datetime
import uuid
import re
from typing import List, Optional
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Query
from fastapi.responses import HTMLResponse, StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from checker import GoogleEmailChecker

HISTORY_FILE = "history.json"
NOTES_FILE = "notes.json"
CLEAN_CACHE_TTL_SECONDS = 30 * 60  # 30 menit

def load_history() -> list:
    if os.path.exists(HISTORY_FILE):
        try:
            with open(HISTORY_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return []
    return []

def is_recent_clean_history(item: dict, max_age_seconds: int = CLEAN_CACHE_TTL_SECONDS) -> bool:
    """Check if item exists in history, has CLEAN status, and was checked within max_age_seconds."""
    if not item or item.get("status", "").upper() != "CLEAN":
        return False

    now = datetime.datetime.now()

    # 1. Check numeric timestamp if present
    if "timestamp" in item:
        try:
            item_ts = float(item["timestamp"])
            age = now.timestamp() - item_ts
            return 0 <= age <= max_age_seconds
        except (ValueError, TypeError):
            pass

    # 2. Fallback to parsing date and time (e.g. 2026-09-16 00.40.25)
    date_str = item.get("date", "")
    time_str = item.get("time", "")
    if date_str and time_str:
        normalized_time = time_str.replace(":", ".")
        try:
            dt = datetime.datetime.strptime(f"{date_str} {normalized_time}", "%Y-%m-%d %H.%M.%S")
            age = (now - dt).total_seconds()
            return 0 <= age <= max_age_seconds
        except Exception:
            pass

    return False

def get_clean_cached_item(email: str) -> Optional[dict]:
    target = email.strip().lower()
    history = load_history()
    for item in history:
        if item.get("email", "").strip().lower() == target:
            if is_recent_clean_history(item):
                return item
            break
    return None

def save_history_item(item: dict):
    history = load_history()
    # Update if already exists or prepend new
    email_lower = item["email"].lower()
    history = [h for h in history if h.get("email", "").lower() != email_lower]
    history.insert(0, item)
    try:
        with open(HISTORY_FILE, "w", encoding="utf-8") as f:
            json.dump(history, f, indent=2)
    except Exception as e:
        print(f"Error saving history: {e}")

def clear_all_history():
    try:
        with open(HISTORY_FILE, "w", encoding="utf-8") as f:
            json.dump([], f)
    except Exception:
        pass

def delete_history_items(status: Optional[str] = None, email: Optional[str] = None) -> int:
    history = load_history()
    initial_count = len(history)
    
    if email:
        target = email.strip().lower()
        history = [h for h in history if h.get("email", "").strip().lower() != target]
    elif status:
        stat = status.strip().upper()
        if stat in ["BLOCKED", "RECHECK"]:
            history = [h for h in history if h.get("status", "").upper() not in ["BLOCKED", "ERROR", "RATE_LIMITED", "RECHECK"]]
        else:
            history = [h for h in history if h.get("status", "").upper() != stat]
    else:
        history = []

    try:
        with open(HISTORY_FILE, "w", encoding="utf-8") as f:
            json.dump(history, f, indent=2)
    except Exception as e:
        print(f"Error saving history after deletion: {e}")

    return initial_count - len(history)

# Notes & Folders helpers
def load_notes_data() -> dict:
    if os.path.exists(NOTES_FILE):
        try:
            with open(NOTES_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, list):
                    return {"folders": [], "notes": data}
                if isinstance(data, dict):
                    if "folders" not in data or not isinstance(data["folders"], list):
                        data["folders"] = []
                    if "notes" not in data or not isinstance(data["notes"], list):
                        data["notes"] = []
                    return data
        except Exception as e:
            print(f"Error loading notes: {e}")
    return {"folders": [], "notes": []}

def save_notes_data(data: dict):
    try:
        with open(NOTES_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"Error saving notes: {e}")

def update_note_status_from_check(email: str, status: str, detail: str):
    try:
        data = load_notes_data()
        updated = False
        target = email.strip().lower()
        now = datetime.datetime.now()
        for note in data.get("notes", []):
            if note.get("email", "").strip().lower() == target:
                note["status"] = status
                note["detail"] = detail
                note["time"] = now.strftime("%H.%M.%S")
                note["date"] = now.strftime("%Y-%m-%d")
                note["timestamp"] = now.timestamp()
                updated = True
        if updated:
            save_notes_data(data)
    except Exception as e:
        print(f"Error syncing note status: {e}")

def get_folder_summary_list(data: dict) -> list:
    explicit_folders = list(dict.fromkeys([f.strip() for f in data.get("folders", []) if f and f.strip()]))
    notes = data.get("notes", [])
    
    # Collect all unique ortu from notes
    ortu_from_notes = []
    for n in notes:
        o = (n.get("ortu") or "").strip()
        if o and o not in ortu_from_notes:
            ortu_from_notes.append(o)
            
    all_folder_names = list(dict.fromkeys(explicit_folders + ortu_from_notes))
    
    folder_map = {}
    for fname in all_folder_names:
        folder_map[fname] = {
            "name": fname,
            "total": 0,
            "clean": 0,
            "captcha": 0,
            "not_found": 0,
            "other": 0
        }
        
    no_ortu_summary = {
        "name": "(Tanpa Ortu)",
        "total": 0,
        "clean": 0,
        "captcha": 0,
        "not_found": 0,
        "other": 0
    }
    has_no_ortu = False
    
    for n in notes:
        o = (n.get("ortu") or "").strip()
        stat = (n.get("status") or "UNCHECKED").upper()
        
        if not o:
            has_no_ortu = True
            target_dict = no_ortu_summary
        else:
            target_dict = folder_map.get(o)
            
        if target_dict:
            target_dict["total"] += 1
            if stat == "CLEAN":
                target_dict["clean"] += 1
            elif stat == "CAPTCHA":
                target_dict["captcha"] += 1
            elif stat == "NOT_FOUND":
                target_dict["not_found"] += 1
            else:
                target_dict["other"] += 1
                
    result = [folder_map[k] for k in all_folder_names if k != "(Tanpa Ortu)"]
    return result

app = FastAPI(title="Mail Checker by Umam")

# In-memory job state
class JobState:
    def __init__(self):
        self.is_running = False
        self.should_stop = False
        self.current_email = ""
        self.total = 0
        self.processed = 0
        self.clean_count = 0
        self.captcha_count = 0
        self.not_found_count = 0
        self.error_count = 0
        self.results = []
        self.checker_instance: Optional[GoogleEmailChecker] = None
        self.active_task: Optional[asyncio.Task] = None

job = JobState()
active_websockets: List[WebSocket] = []

class CheckRequest(BaseModel):
    emails: List[str]
    delay_seconds: float = 2.0
    headless: bool = True
    use_system_chrome: bool = True

class NoteItemModel(BaseModel):
    id: Optional[str] = None
    email: str
    password: Optional[str] = ""
    ortu: Optional[str] = ""
    status: Optional[str] = "UNCHECKED"
    detail: Optional[str] = ""

class BatchNotesRequest(BaseModel):
    raw_text: str
    default_ortu: Optional[str] = ""

class FolderActionRequest(BaseModel):
    name: str

class RenameFolderRequest(BaseModel):
    old_name: str
    new_name: str

class ImportHistoryRequest(BaseModel):
    target_ortu: Optional[str] = ""
    filter_status: Optional[str] = "ALL"

class MoveNotesRequest(BaseModel):
    emails: List[str]
    target_ortu: Optional[str] = ""

async def broadcast_message(message_type: str, data: dict):
    """Broadcasts a JSON message to all connected WebSockets."""
    payload = json.dumps({"type": message_type, "data": data})
    disconnected = []
    for ws in active_websockets:
        try:
            await ws.send_text(payload)
        except Exception:
            disconnected.append(ws)
    for ws in disconnected:
        if ws in active_websockets:
            active_websockets.remove(ws)

async def run_batch_checker(emails: List[str], delay_seconds: float, headless: bool, use_system_chrome: bool):
    global job
    job.is_running = True
    job.should_stop = False
    job.total = len(emails)
    job.processed = 0
    job.clean_count = 0
    job.captcha_count = 0
    job.not_found_count = 0
    job.error_count = 0
    job.results = []

    await broadcast_message("job_started", {
        "total": job.total,
        "headless": headless,
        "use_chrome": use_system_chrome
    })

    checker: Optional[GoogleEmailChecker] = None

    try:
        for idx, raw_email in enumerate(emails):
            if job.should_stop:
                await broadcast_message("log", {"level": "warning", "message": "Pengecekan dihentikan oleh pengguna."})
                break

            email = raw_email.strip()
            if not email:
                continue

            job.current_email = email
            await broadcast_message("checking", {
                "index": idx + 1,
                "email": email,
                "processed": job.processed,
                "total": job.total
            })

            # Check if this email is already recorded as CLEAN in history within the last 30 minutes
            cached_item = get_clean_cached_item(email)
            if cached_item:
                res = {
                    "email": email,
                    "status": "CLEAN",
                    "detail": cached_item.get("detail") or "Langsung mengarah ke Password (Clean - Siap Login)",
                    "has_captcha": False,
                    "time": cached_item.get("time", datetime.datetime.now().strftime("%H.%M.%S")),
                    "date": cached_item.get("date", datetime.datetime.now().strftime("%Y-%m-%d")),
                    "timestamp": cached_item.get("timestamp"),
                    "cached": True
                }

                job.processed += 1
                job.clean_count += 1
                job.results.append(res)

                await broadcast_message("log", {
                    "level": "success",
                    "message": f"[CLEAN - RIWAYAT] {email} -> Riwayat masih bersih (< 30 mnt), lewati pengecekan browser"
                })

                await broadcast_message("result_item", {
                    "item": res,
                    "stats": {
                        "total": job.total,
                        "processed": job.processed,
                        "clean": job.clean_count,
                        "captcha": job.captcha_count,
                        "not_found": job.not_found_count,
                        "error": job.error_count
                    }
                })

                await asyncio.sleep(0.02)
                continue

            # Email needs fresh verification via browser (e.g. CAPTCHA, ERROR, new email, or > 30 mins)
            if checker is None:
                await broadcast_message("log", {"level": "info", "message": "Inisialisasi engine browser automasi..."})
                checker = GoogleEmailChecker(
                    headless=headless,
                    use_system_chrome=use_system_chrome
                )
                job.checker_instance = checker
                await checker.start()
                await broadcast_message("log", {"level": "success", "message": "Browser siap. Memulai pengecekan email..."})

            res = await checker.check_email(email)

            # Abort saving if user pressed stop during the check
            if job.should_stop:
                await broadcast_message("log", {"level": "warning", "message": f"Pengecekan dibatalkan saat memeriksa {email}."})
                break

            now = datetime.datetime.now()
            res["time"] = now.strftime("%H.%M.%S")
            res["date"] = now.strftime("%Y-%m-%d")
            res["timestamp"] = now.timestamp()

            # Save to persistent history database
            save_history_item(res)
            update_note_status_from_check(res["email"], res["status"], res.get("detail", ""))

            job.processed += 1
            job.results.append(res)

            status = res["status"]
            if status == "CLEAN":
                job.clean_count += 1
                await broadcast_message("log", {"level": "success", "message": f"[CLEAN] {email} -> Langsung ke password"})
            elif status == "CAPTCHA":
                job.captcha_count += 1
                await broadcast_message("log", {"level": "warning", "message": f"[CAPTCHA] {email} -> Ada Captcha / Tantangan Bot"})
            elif status == "NOT_FOUND":
                job.not_found_count += 1
                await broadcast_message("log", {"level": "error", "message": f"[NOT FOUND] {email} -> Akun tidak terdaftar"})
            else:
                job.error_count += 1
                await broadcast_message("log", {"level": "error", "message": f"[{status}] {email} -> {res.get('detail')}"})

            # Send single result update
            await broadcast_message("result_item", {
                "item": res,
                "stats": {
                    "total": job.total,
                    "processed": job.processed,
                    "clean": job.clean_count,
                    "captcha": job.captcha_count,
                    "not_found": job.not_found_count,
                    "error": job.error_count
                }
            })

            # Delay between checks (check should_stop before sleeping)
            if idx < len(emails) - 1 and delay_seconds > 0:
                if job.should_stop:
                    break
                await asyncio.sleep(delay_seconds)

    except asyncio.CancelledError:
        print("[Job] Batch checker task cancelled immediately by stop button.")
        await broadcast_message("log", {"level": "warning", "message": "Pengecekan dihentikan seketika oleh pengguna."})
    except Exception as e:
        await broadcast_message("log", {"level": "error", "message": f"Terjadi kesalahan: {str(e)}"})
    finally:
        if checker:
            try:
                await checker.close()
            except Exception:
                pass
        job.is_running = False
        job.current_email = ""
        job.checker_instance = None
        job.active_task = None
        await broadcast_message("job_finished", {
            "stats": {
                "total": job.total,
                "processed": job.processed,
                "clean": job.clean_count,
                "captcha": job.captcha_count,
                "not_found": job.not_found_count,
                "error": job.error_count
            }
        })
        await broadcast_message("log", {"level": "info", "message": "Pengecekan selesai."})

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    active_websockets.append(websocket)
    # Send current state and history count on connect
    history_items = load_history()
    await websocket.send_text(json.dumps({
        "type": "init_state",
        "data": {
            "is_running": job.is_running,
            "total": job.total if job.is_running else 0,
            "processed": job.processed if job.is_running else 0,
            "stats": {
                "clean": job.clean_count if job.is_running else 0,
                "captcha": job.captcha_count if job.is_running else 0,
                "not_found": job.not_found_count if job.is_running else 0,
                "error": job.error_count if job.is_running else 0
            },
            "results": job.results if job.is_running else [],
            "history_total": len(history_items)
        }
    }))
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        if websocket in active_websockets:
            active_websockets.remove(websocket)

@app.post("/api/start")
async def start_checking(req: CheckRequest):
    global job
    if job.is_running:
        raise HTTPException(status_code=400, detail="Pengecekan sedang berlangsung")
    
    cleaned_emails = [e.strip() for e in req.emails if e.strip()]
    if not cleaned_emails:
        raise HTTPException(status_code=400, detail="Daftar email tidak boleh kosong")

    job.active_task = asyncio.create_task(run_batch_checker(
        emails=cleaned_emails,
        delay_seconds=req.delay_seconds,
        headless=req.headless,
        use_system_chrome=req.use_system_chrome
    ))
    return {"status": "ok", "message": f"Memulai pengecekan {len(cleaned_emails)} email"}

@app.post("/api/stop")
async def stop_checking():
    global job
    if not job.is_running:
        return {"status": "ok", "message": "Tidak ada proses yang sedang berjalan"}
    
    job.should_stop = True
    
    # 1. Cancel active background task immediately
    if job.active_task and not job.active_task.done():
        job.active_task.cancel()

    # 2. Force close browser engine immediately to abort in-flight page actions
    if job.checker_instance:
        asyncio.create_task(job.checker_instance.close())

    return {"status": "ok", "message": "Pengecekan berhasil dihentikan seketika"}

@app.get("/api/status")
async def get_status():
    return {
        "is_running": job.is_running,
        "total": job.total,
        "processed": job.processed,
        "current_email": job.current_email,
        "stats": {
            "clean": job.clean_count,
            "captcha": job.captcha_count,
            "not_found": job.not_found_count,
            "error": job.error_count
        }
    }

# History endpoints
@app.get("/api/history")
async def get_history():
    items = load_history()
    return {"total": len(items), "data": items}

@app.delete("/api/history")
async def delete_history(
    status: Optional[str] = Query(None, description="Status to delete e.g. CAPTCHA, CLEAN"),
    email: Optional[str] = Query(None, description="Specific email to delete")
):
    deleted_count = delete_history_items(status=status, email=email)
    msg = f"Berhasil menghapus {deleted_count} data riwayat"
    if status:
        msg += f" dengan status {status.upper()}"
    elif email:
        msg += f" untuk email {email}"
    else:
        msg = "Seluruh riwayat akun berhasil dibersihkan"
    return {"status": "ok", "deleted_count": deleted_count, "message": msg}

# Export endpoint with customizable options
@app.get("/api/export")
async def export_data(
    source: str = Query("current", description="current or history"),
    filter_status: str = Query("ALL", description="ALL, CLEAN, CAPTCHA, NOT_FOUND, BLOCKED"),
    format: str = Query("txt_email_only", description="txt_email_only, txt_full, csv")
):
    dataset = job.results if source == "current" else load_history()

    # Filter
    filtered = []
    for item in dataset:
        status = item.get("status", "").upper()
        if filter_status.upper() == "ALL":
            filtered.append(item)
        elif filter_status.upper() in ["BLOCKED", "RECHECK"] and status in ["BLOCKED", "RECHECK", "ERROR", "RATE_LIMITED"]:
            filtered.append(item)
        elif status == filter_status.upper():
            filtered.append(item)

    filename_base = f"email_{source}_{filter_status.lower()}"

    if format == "csv":
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["Email", "Status", "Keterangan", "Waktu", "Tanggal", "Ada Captcha"])
        for item in filtered:
            writer.writerow([
                item.get("email", ""),
                item.get("status", ""),
                item.get("detail", ""),
                item.get("time", ""),
                item.get("date", ""),
                "Ya" if item.get("has_captcha") else "Tidak"
            ])
        output.seek(0)
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={filename_base}.csv"}
        )
    elif format == "txt_email_only":
        lines = [item.get("email", "") for item in filtered if item.get("email")]
        content = "\n".join(lines)
        return StreamingResponse(
            iter([content]),
            media_type="text/plain",
            headers={"Content-Disposition": f"attachment; filename={filename_base}_emails.txt"}
        )
    else:  # txt_full
        lines = []
        for item in filtered:
            lines.append(f"{item.get('email', '')} [{item.get('status', '')}] - {item.get('detail', '')} ({item.get('time', '')})")
        content = "\n".join(lines)
        return StreamingResponse(
            iter([content]),
            media_type="text/plain",
            headers={"Content-Disposition": f"attachment; filename={filename_base}_full.txt"}
        )

# ================= NOTES (CATATAN AKUN & FOLDER ORTU) ENDPOINTS =================
@app.get("/api/notes")
async def get_notes():
    data = load_notes_data()
    folders_summary = get_folder_summary_list(data)
    return {
        "total": len(data.get("notes", [])),
        "folders_count": len(folders_summary),
        "folders": folders_summary,
        "data": data.get("notes", [])
    }

@app.post("/api/notes")
async def save_or_update_note(item: NoteItemModel):
    auto_backup_data()
    data = load_notes_data()
    notes = data.get("notes", [])
    folders = data.get("folders", [])
    
    email_clean = item.email.strip()
    if "@" not in email_clean:
        email_clean = f"{email_clean}@gmail.com"
        
    ortu_clean = (item.ortu or "").strip()
    if ortu_clean and ortu_clean not in folders and ortu_clean != "(Tanpa Ortu)":
        folders.append(ortu_clean)
        
    now = datetime.datetime.now()
    note_id = item.id or str(uuid.uuid4())[:8]
    
    existing_idx = -1
    for idx, n in enumerate(notes):
        if (item.id and n.get("id") == item.id) or n.get("email", "").lower() == email_clean.lower():
            existing_idx = idx
            break
            
    note_dict = {
        "id": notes[existing_idx]["id"] if existing_idx >= 0 else note_id,
        "email": email_clean,
        "password": item.password.strip() if item.password else "",
        "ortu": ortu_clean,
        "status": (item.status or "UNCHECKED").upper(),
        "detail": (item.detail or "").strip(),
        "date": now.strftime("%Y-%m-%d"),
        "time": now.strftime("%H.%M.%S"),
        "timestamp": now.timestamp()
    }
    
    if existing_idx >= 0:
        notes[existing_idx] = note_dict
    else:
        notes.insert(0, note_dict)
        
    data["folders"] = folders
    data["notes"] = notes
    save_notes_data(data)
    return {"status": "ok", "item": note_dict}

@app.post("/api/notes/batch")
async def batch_add_notes_endpoint(req: BatchNotesRequest):
    auto_backup_data()
    data = load_notes_data()
    notes = data.get("notes", [])
    folders = data.get("folders", [])
    default_ortu = (req.default_ortu or "").strip()
    if default_ortu and default_ortu not in folders and default_ortu != "(Tanpa Ortu)":
        folders.append(default_ortu)
        
    lines = req.raw_text.strip().splitlines()
    now = datetime.datetime.now()
    added_count = 0
    
    for line in lines:
        raw = line.strip()
        if not raw:
            continue
            
        delims = ['|', '\t', ':', ',']
        matched_delim = None
        for d in delims:
            if d in raw:
                matched_delim = d
                break
                
        email = ""
        password = ""
        ortu = default_ortu
        
        if matched_delim:
            parts = [p.strip() for p in raw.split(matched_delim) if p.strip()]
            if len(parts) >= 3:
                email = parts[0]
                password = parts[1]
                ortu = parts[2]
            elif len(parts) == 2:
                email = parts[0]
                if "@" in parts[1]:
                    ortu = parts[1]
                else:
                    password = parts[1]
            elif len(parts) == 1:
                email = parts[0]
        else:
            email = raw
            
        email = email.strip()
        if not email:
            continue
        if "@" not in email:
            email = f"{email}@gmail.com"
            
        if ortu and ortu not in folders and ortu != "(Tanpa Ortu)":
            folders.append(ortu)
            
        existing_idx = -1
        for idx, n in enumerate(notes):
            if n.get("email", "").lower() == email.lower():
                existing_idx = idx
                break
                
        note_dict = {
            "id": notes[existing_idx]["id"] if existing_idx >= 0 else str(uuid.uuid4())[:8],
            "email": email,
            "password": password,
            "ortu": ortu,
            "status": notes[existing_idx]["status"] if existing_idx >= 0 else "UNCHECKED",
            "detail": notes[existing_idx]["detail"] if existing_idx >= 0 else "",
            "date": now.strftime("%Y-%m-%d"),
            "time": now.strftime("%H.%M.%S"),
            "timestamp": now.timestamp()
        }
        
        if existing_idx >= 0:
            notes[existing_idx] = note_dict
        else:
            notes.insert(0, note_dict)
        added_count += 1
        
    data["folders"] = folders
    data["notes"] = notes
    save_notes_data(data)
    return {"status": "ok", "added_count": added_count, "total_notes": len(notes)}

@app.post("/api/notes/import-history")
async def import_history_endpoint(req: ImportHistoryRequest):
    history = load_history()
    auto_backup_data()
    data = load_notes_data()
    notes = data.get("notes", [])
    folders = data.get("folders", [])
    raw_target = (req.target_ortu or "").strip()
    if raw_target == "(Tanpa Ortu)" or raw_target.lower() == "umum":
        target_ortu = ""
    else:
        target_ortu = raw_target
        
    if target_ortu and target_ortu not in folders:
        folders.append(target_ortu)
        
    filter_stat = (req.filter_status or "ALL").upper()
    now = datetime.datetime.now()
    imported_count = 0
    
    for h in history:
        stat = (h.get("status") or "").upper()
        email = (h.get("email") or "").strip()
        if not email:
            continue
            
        existing_idx = -1
        for idx, n in enumerate(notes):
            if n.get("email", "").lower() == email.lower():
                existing_idx = idx
                break

        # Filter Kategori Pilihan
        if filter_stat == "NOT_IN_NOTES":
            if existing_idx >= 0:
                continue
        elif filter_stat == "CLEAN_NOT_IN_NOTES":
            if existing_idx >= 0 or stat != "CLEAN":
                continue
        elif filter_stat == "UNCHECKED":
            if stat != "UNCHECKED" and stat != "":
                continue
        elif filter_stat != "ALL":
            if stat != filter_stat:
                continue
                
        note_dict = {
            "id": notes[existing_idx]["id"] if existing_idx >= 0 else str(uuid.uuid4())[:8],
            "email": email,
            "password": notes[existing_idx]["password"] if existing_idx >= 0 else "",
            "ortu": target_ortu,
            "status": stat or "UNCHECKED",
            "detail": h.get("detail", ""),
            "date": h.get("date", now.strftime("%Y-%m-%d")),
            "time": h.get("time", now.strftime("%H.%M.%S")),
            "timestamp": h.get("timestamp", now.timestamp())
        }
        
        if existing_idx >= 0:
            notes[existing_idx] = note_dict
        else:
            notes.insert(0, note_dict)
        imported_count += 1
        
    data["folders"] = folders
    data["notes"] = notes
    save_notes_data(data)
    return {"status": "ok", "imported_count": imported_count, "target_ortu": target_ortu, "total_notes": len(notes)}

@app.post("/api/notes/move")
async def move_notes_endpoint(req: MoveNotesRequest):
    auto_backup_data()
    data = load_notes_data()
    notes = data.get("notes", [])
    folders = data.get("folders", [])
    raw_target = (req.target_ortu or "").strip()
    if raw_target == "(Tanpa Ortu)" or raw_target.lower() == "umum":
        target = ""
    else:
        target = raw_target
        
    if target and target not in folders:
        folders.append(target)
        
    email_set = set(e.strip().lower() for e in req.emails if e.strip())
    moved_count = 0
    for n in notes:
        if n.get("email", "").strip().lower() in email_set:
            n["ortu"] = target
            moved_count += 1
            
    data["folders"] = folders
    data["notes"] = notes
    save_notes_data(data)
    return {"status": "ok", "moved_count": moved_count, "target_ortu": target, "total_notes": len(notes)}


def auto_backup_data():
    """Membuat salinan cadangan otomatis notes.json dan history.json ke folder backups, dan membersihkan backup yang sudah lebih dari 3 hari."""
    import datetime, shutil, time
    try:
        b_dir = os.path.join(os.path.dirname(__file__), "backups")
        os.makedirs(b_dir, exist_ok=True)
        ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        if os.path.exists(NOTES_FILE):
            shutil.copy2(NOTES_FILE, os.path.join(b_dir, f"backup_notes_{ts}.json"))
        if os.path.exists(HISTORY_FILE):
            shutil.copy2(HISTORY_FILE, os.path.join(b_dir, f"backup_history_{ts}.json"))
        
        # Bersihkan file backup yang sudah berusia lebih dari 3 hari (3 x 24 jam)
        now_ts = time.time()
        three_days_seconds = 3 * 24 * 60 * 60
        for fname in os.listdir(b_dir):
            fpath = os.path.join(b_dir, fname)
            if os.path.isfile(fpath) and (fname.startswith("backup_notes_") or fname.startswith("backup_history_")):
                try:
                    file_age = now_ts - os.path.getmtime(fpath)
                    if file_age > three_days_seconds:
                        os.remove(fpath)
                except Exception:
                    pass
    except Exception as e:
        print(f"Error auto_backup: {e}")

@app.post("/api/backup")
async def manual_backup_endpoint():
    """Memicu backup manual dari tombol dashboard web dan mereturn waktu backup."""
    import datetime
    try:
        auto_backup_data()
        now_str = datetime.datetime.now().strftime("%d/%m/%Y %H:%M:%S")
        return {
            "status": "ok",
            "message": f"Backup berhasil dibuat pada {now_str}! Cadangan tersimpan aman dan otomatis berlaku selama 3 hari."
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/notes")
async def delete_notes_endpoint(
    id: Optional[str] = Query(None),
    folder: Optional[str] = Query(None),
    email: Optional[str] = Query(None),
    clear_all: bool = Query(False),
    delete_history: bool = Query(False)
):
    auto_backup_data()
    data = load_notes_data()
    notes = data.get("notes", [])
    folders = data.get("folders", [])
    initial_count = len(notes)
    history_deleted_count = 0
    
    if clear_all:
        if delete_history:
            history = load_history()
            history_deleted_count = len(history)
            clear_all_history()
        data["notes"] = []
        data["folders"] = []
        save_notes_data(data)
        msg = f"Seluruh catatan akun ({initial_count}) beserta {history_deleted_count} riwayat berhasil dibersihkan" if delete_history else "Seluruh catatan akun berhasil dibersihkan"
        return {"status": "ok", "deleted_count": initial_count, "history_deleted_count": history_deleted_count, "message": msg}
        
    if folder is not None:
        target_folder = folder.strip()
        emails_in_folder = set()
        if target_folder == "(Tanpa Ortu)":
            for n in notes:
                if not (n.get("ortu") or "").strip():
                    em = (n.get("email") or "").strip().lower()
                    if em:
                        emails_in_folder.add(em)
            notes = [n for n in notes if (n.get("ortu") or "").strip()]
        else:
            for n in notes:
                if (n.get("ortu") or "").strip().lower() == target_folder.lower():
                    em = (n.get("email") or "").strip().lower()
                    if em:
                        emails_in_folder.add(em)
            notes = [n for n in notes if (n.get("ortu") or "").strip().lower() != target_folder.lower()]
            folders = [f for f in folders if f.strip().lower() != target_folder.lower()]
        data["notes"] = notes
        data["folders"] = folders
        save_notes_data(data)
        deleted = initial_count - len(notes)

        if delete_history and emails_in_folder:
            history = load_history()
            init_h_len = len(history)
            history = [h for h in history if h.get("email", "").strip().lower() not in emails_in_folder]
            history_deleted_count = init_h_len - len(history)
            try:
                with open(HISTORY_FILE, "w", encoding="utf-8") as f:
                    json.dump(history, f, indent=2)
            except Exception as e:
                print(f"Error saving history after folder deletion: {e}")

        msg = f"Folder '{folder}' ({deleted} akun) beserta {history_deleted_count} riwayat berhasil dibersihkan" if delete_history else f"Folder '{folder}' beserta {deleted} akun berhasil dihapus"
        return {"status": "ok", "deleted_count": deleted, "history_deleted_count": history_deleted_count, "message": msg}
        
    if id:
        target_note = next((n for n in notes if n.get("id") == id), None)
        notes = [n for n in notes if n.get("id") != id]
        data["notes"] = notes
        save_notes_data(data)
        if delete_history and target_note and target_note.get("email"):
            delete_history_items(email=target_note["email"])
        return {"status": "ok", "deleted_count": initial_count - len(notes)}
        
    if email:
        target = email.strip().lower()
        notes = [n for n in notes if n.get("email", "").strip().lower() != target]
        data["notes"] = notes
        save_notes_data(data)
        if delete_history:
            delete_history_items(email=target)
        return {"status": "ok", "deleted_count": initial_count - len(notes)}
        
    return {"status": "error", "message": "Parameter tidak valid"}

@app.post("/api/notes/folder")
async def create_folder_endpoint(req: FolderActionRequest):
    data = load_notes_data()
    folders = data.get("folders", [])
    name = req.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Nama folder tidak boleh kosong")
    if name not in folders:
        folders.append(name)
        data["folders"] = folders
        save_notes_data(data)
    return {"status": "ok", "folder": name}

@app.post("/api/notes/folder/rename")
async def rename_folder_endpoint(req: RenameFolderRequest):
    data = load_notes_data()
    folders = data.get("folders", [])
    notes = data.get("notes", [])
    old_name = req.old_name.strip()
    new_name = req.new_name.strip()
    
    if not new_name:
        raise HTTPException(status_code=400, detail="Nama folder baru tidak boleh kosong")
        
    folders = [new_name if f.lower() == old_name.lower() else f for f in folders]
    if new_name not in folders:
        folders.append(new_name)
    folders = list(dict.fromkeys([f.strip() for f in folders if f and f.strip()]))
        
    updated_count = 0
    for n in notes:
        if (n.get("ortu") or "").strip().lower() == old_name.lower():
            n["ortu"] = new_name
            updated_count += 1
            
    data["folders"] = folders
    data["notes"] = notes
    save_notes_data(data)
    return {"status": "ok", "updated_count": updated_count}

@app.get("/api/notes/export")
async def export_notes_endpoint(
    folder: Optional[str] = Query(None),
    filter_status: str = Query("ALL"),
    format: str = Query("txt_combo")
):
    auto_backup_data()
    data = load_notes_data()
    notes = data.get("notes", [])
    
    filtered = []
    for item in notes:
        if folder:
            f = folder.strip()
            item_f = (item.get("ortu") or "").strip()
            if f == "(Tanpa Ortu)":
                if item_f:
                    continue
            elif item_f.lower() != f.lower():
                continue
                
        status = item.get("status", "UNCHECKED").upper()
        if filter_status.upper() != "ALL":
            if filter_status.upper() == "BLOCKED" and status in ["BLOCKED", "ERROR", "RATE_LIMITED", "RECHECK"]:
                pass
            elif status != filter_status.upper():
                continue
        filtered.append(item)
        
    filename_base = f"catatan_akun_{filter_status.lower()}"
    if folder:
        safe_f = re.sub(r'[^a-zA-Z0-9_-]', '_', folder)
        filename_base += f"_{safe_f}"
        
    if format == "csv":
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["Email", "Password", "Ortu", "Status", "Keterangan", "Waktu", "Tanggal"])
        for item in filtered:
            writer.writerow([
                item.get("email", ""),
                item.get("password", ""),
                item.get("ortu", ""),
                item.get("status", ""),
                item.get("detail", ""),
                item.get("time", ""),
                item.get("date", "")
            ])
        output.seek(0)
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={filename_base}.csv"}
        )
    elif format == "txt_email_only":
        lines = [item.get("email", "") for item in filtered if item.get("email")]
        content = "\n".join(lines)
        return StreamingResponse(
            iter([content]),
            media_type="text/plain",
            headers={"Content-Disposition": f"attachment; filename={filename_base}_emails.txt"}
        )
    elif format == "txt_combo":
        lines = []
        for item in filtered:
            p = item.get("password", "")
            o = item.get("ortu", "")
            lines.append(f"{item.get('email', '')}:{p}:{o}")
        content = "\n".join(lines)
        return StreamingResponse(
            iter([content]),
            media_type="text/plain",
            headers={"Content-Disposition": f"attachment; filename={filename_base}_combo.txt"}
        )
    else:  # txt_full
        lines = []
        for item in filtered:
            lines.append(f"{item.get('email', '')} | Pass: {item.get('password', '')} | Ortu: {item.get('ortu', '')} [{item.get('status', '')}] - {item.get('detail', '')}")
        content = "\n".join(lines)
        return StreamingResponse(
            iter([content]),
            media_type="text/plain",
            headers={"Content-Disposition": f"attachment; filename={filename_base}_full.txt"}
        )

# Static file serving
os.makedirs("static", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
async def root():
    return FileResponse("static/index.html")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="127.0.0.1", port=8000, reload=False)
