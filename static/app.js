// Mail Checker by Umam - Client Logic
// ==========================================================================
// SWEETALERT2 NOTIFICATION SUITE (DARK GLASSMORPHISM)
// ==========================================================================
const Toast = (typeof Swal !== 'undefined') ? Swal.mixin({
    toast: true,
    position: 'top-end',
    showConfirmButton: false,
    timer: 2800,
    timerProgressBar: true,
    didOpen: (toast) => {
        toast.addEventListener('mouseenter', Swal.stopTimer);
        toast.addEventListener('mouseleave', Swal.resumeTimer);
    }
}) : null;

function showToast(icon, title) {
    if (Toast) {
        Toast.fire({ icon, title });
    } else {
        console.log(`[Toast ${icon}] ${title}`);
    }
}

function showSwalAlert(icon, title, text = '') {
    if (typeof Swal !== 'undefined') {
        return Swal.fire({
            icon: icon, // 'success', 'error', 'warning', 'info'
            title: title,
            html: text,
            customClass: {
                popup: 'swal-custom-popup',
                confirmButton: icon === 'error' ? 'btn-danger-swal' : ''
            }
        });
    } else {
        alert(`${title}\n${text}`);
    }
}

async function showSwalConfirm(title, text, confirmText = 'Ya, Lanjutkan', isDanger = false) {
    if (typeof Swal !== 'undefined') {
        const result = await Swal.fire({
            title: title,
            html: text,
            icon: isDanger ? 'warning' : 'question',
            showCancelButton: true,
            confirmButtonText: confirmText,
            cancelButtonText: 'Batal',
            reverseButtons: true,
            customClass: {
                popup: 'swal-custom-popup',
                confirmButton: isDanger ? 'btn-danger-swal' : ''
            }
        });
        return result.isConfirmed;
    } else {
        return confirm(title + '\n' + text.replace(/<[^>]+>/g, ''));
    }
}

// Override native window.alert agar konsisten menggunakan SweetAlert2
window.alert = function(msg) {
    showSwalAlert('info', 'Pemberitahuan', msg);
};

let allResults = [];
let historyList = [];
let currentFilter = 'ALL';
let historyFilter = 'ALL';
let isRunning = false;
let ws = null;

// DOM Navigation
const tabNavChecker = document.getElementById('tab-nav-checker');
const tabNavHistory = document.getElementById('tab-nav-history');
const tabNavNotes = document.getElementById('tab-nav-notes');
const viewChecker = document.getElementById('view-checker');
const viewHistory = document.getElementById('view-history');
const viewNotes = document.getElementById('view-notes');
const navHistoryCount = document.getElementById('nav-history-count');
const navNotesCount = document.getElementById('nav-notes-count');

// Input & Settings Elements
const emailInput = document.getElementById('email-input');
const emailCountLabel = document.getElementById('email-count-label');
const estimateLabel = document.getElementById('estimate-label');
const btnAutoFormat = document.getElementById('btn-auto-format');
const delayInput = document.getElementById('delay-input');
const headlessCheck = document.getElementById('headless-check');
const useChromeCheck = document.getElementById('use-chrome-check');

const btnStart = document.getElementById('btn-start');
const btnStop = document.getElementById('btn-stop');

const statusPill = document.getElementById('status-pill');
const statusText = document.getElementById('status-text');

// Metric Elements
const statTotal = document.getElementById('stat-total');
const statClean = document.getElementById('stat-clean');
const statCaptcha = document.getElementById('stat-captcha');
const statNotFound = document.getElementById('stat-notfound');
const statBlocked = document.getElementById('stat-blocked');

const savedInfoText = document.getElementById('saved-info-text');
const remainLabel = document.getElementById('remain-label');
const percentLabel = document.getElementById('percent-label');
const progressFill = document.getElementById('progress-fill');

// Live Tab Counts
const countAll = document.getElementById('count-all');
const countClean = document.getElementById('count-clean');
const countCaptcha = document.getElementById('count-captcha');
const countNotFound = document.getElementById('count-notfound');
const countBlocked = document.getElementById('count-blocked');

const btnCopyFiltered = document.getElementById('btn-copy-filtered');
const copyBtnText = document.getElementById('copy-btn-text');
const btnToggleShowHistory = document.getElementById('btn-toggle-show-history');
const showHistoryBtnText = document.getElementById('show-history-btn-text');
const btnHistCount = document.getElementById('btn-hist-count');
const resultsTbody = document.getElementById('results-tbody');

let isShowingHistory = false;

function getActiveDataset() {
    return isShowingHistory ? historyList : allResults;
}

// Export Modal Elements
const btnOpenExport = document.getElementById('btn-open-export');
const exportModal = document.getElementById('export-modal');
const btnCloseExport = document.getElementById('btn-close-export');
const btnCancelExport = document.getElementById('btn-cancel-export');
const btnConfirmExport = document.getElementById('btn-confirm-export');
const modalCurrCount = document.getElementById('modal-curr-count');
const modalHistCount = document.getElementById('modal-hist-count');
const exportStatusSelect = document.getElementById('export-status-select');

// History View Elements
const historyTbody = document.getElementById('history-tbody');
const btnRefreshHistory = document.getElementById('btn-refresh-history');
const btnExportHistoryModal = document.getElementById('btn-export-history-modal');
const btnClearCaptchaHistory = document.getElementById('btn-clear-captcha-history');
const btnQuickDelCaptcha = document.getElementById('btn-quick-del-captcha');
const btnClearHistory = document.getElementById('btn-clear-history');
const historySearchInput = document.getElementById('history-search-input');
const histCountAll = document.getElementById('hist-count-all');
const histCountClean = document.getElementById('hist-count-clean');
const histCountCaptcha = document.getElementById('hist-count-captcha');
const histCountNotFound = document.getElementById('hist-count-notfound');

// Navigation switching
function switchMainTab(target) {
    tabNavChecker.classList.remove('active');
    tabNavHistory.classList.remove('active');
    if (tabNavNotes) tabNavNotes.classList.remove('active');

    viewChecker.style.display = 'none';
    viewHistory.style.display = 'none';
    if (viewNotes) viewNotes.style.display = 'none';

    if (target === 'checker') {
        tabNavChecker.classList.add('active');
        viewChecker.style.display = 'grid';
    } else if (target === 'history') {
        tabNavHistory.classList.add('active');
        viewHistory.style.display = 'flex';
        loadHistory();
    } else if (target === 'notes') {
        if (tabNavNotes) tabNavNotes.classList.add('active');
        if (viewNotes) viewNotes.style.display = 'grid';
        loadNotes();
    }
}

tabNavChecker.addEventListener('click', () => switchMainTab('checker'));
tabNavHistory.addEventListener('click', () => switchMainTab('history'));
if (tabNavNotes) tabNavNotes.addEventListener('click', () => switchMainTab('notes'));

// Helper: Parse and auto-complete inputs into valid emails
function parseAndCompleteEmails(text) {
    if (!text) return [];
    const lines = text.split(/\r?\n/);
    const seen = new Set();
    const result = [];

    for (let rawLine of lines) {
        let line = rawLine.trim();
        if (!line) continue;

        // If line has format user:pass, user;pass, etc.
        if (line.includes(':')) {
            line = line.split(':')[0].trim();
        } else if (line.includes(';')) {
            line = line.split(';')[0].trim();
        } else if (line.includes(',') && !line.includes('@')) {
            line = line.split(',')[0].trim();
        }

        // Clean quotes or brackets
        line = line.replace(/^[<"'\s]+|[>"'\s]+$/g, '');
        if (!line) continue;

        let email = '';
        if (line.includes('@')) {
            // Already has @
            if (line.endsWith('@')) {
                email = line + 'gmail.com';
            } else if (line.endsWith('@gmail')) {
                email = line + '.com';
            } else {
                email = line;
            }
        } else {
            // Pure username like "umam123" -> becomes "umam123@gmail.com"
            email = line + '@gmail.com';
        }

        email = email.toLowerCase().trim();
        if (email.includes('@') && email.includes('.') && !seen.has(email)) {
            seen.add(email);
            result.push(email);
        }
    }
    return result;
}

// Alias for compatibility
function extractEmails(text) {
    return parseAndCompleteEmails(text);
}

// Auto Complete Button
btnAutoFormat.addEventListener('click', () => {
    const raw = emailInput.value;
    const emails = parseAndCompleteEmails(raw);
    if (emails.length === 0) {
        showToast('warning', 'Tidak ada username atau email yang terdeteksi.');
        return;
    }
    emailInput.value = emails.join('\n');
    updateInputMeta();
    showToast('success', `Berhasil memformat ${emails.length} email.`);
});

// Update input stats
function updateInputMeta() {
    const emails = extractEmails(emailInput.value);
    const count = emails.length;
    emailCountLabel.textContent = `${count} email`;
    
    const delay = parseFloat(delayInput.value) || 2.0;
    const estSec = Math.round(count * (delay + 1.2));
    estimateLabel.textContent = `Estimasi: ~${estSec} dtk`;
}

emailInput.addEventListener('input', updateInputMeta);
delayInput.addEventListener('input', updateInputMeta);

// WebSocket Setup
function initWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        updateRunStatus(isRunning);
    };

    ws.onmessage = (e) => {
        try {
            const msg = JSON.parse(e.data);
            handleMessage(msg);
        } catch (err) {
            console.error('WS parse error:', err);
        }
    };

    ws.onclose = () => {
        setTimeout(initWebSocket, 2000);
    };
}

function handleMessage(msg) {
    const { type, data } = msg;

    switch (type) {
        case 'init_state':
            if (data.is_running && data.results && data.results.length > 0) {
                allResults = data.results;
                renderTable();
                if (data.stats) updateStats(data.stats);
            } else {
                allResults = [];
                renderTable();
                updateStats({ total: 0, clean: 0, captcha: 0, not_found: 0, error: 0 });
                updateTabCounts();
            }
            if (data.history_total !== undefined) {
                navHistoryCount.textContent = data.history_total;
            }
            updateRunStatus(data.is_running);
            break;

        case 'job_started':
            allResults = [];
            renderTable();
            updateRunStatus(true);
            statTotal.textContent = data.total;
            savedInfoText.textContent = `0 hasil tersimpan di perangkat`;
            remainLabel.textContent = `Sisa: ${data.total}`;
            percentLabel.textContent = `0%`;
            progressFill.style.width = `0%`;
            break;

        case 'checking':
            const remain = Math.max(0, data.total - data.processed);
            remainLabel.textContent = `Sisa: ${remain}`;
            const pct = Math.round((data.processed / data.total) * 100);
            percentLabel.textContent = `${pct}%`;
            progressFill.style.width = `${pct}%`;
            break;

        case 'result_item':
            allResults.push(data.item);
            appendTableRow(data.item, allResults.length);
            updateStats(data.stats);
            updateTabCounts();
            // Update history count
            const currentHistCount = parseInt(navHistoryCount.textContent || '0') + 1;
            navHistoryCount.textContent = currentHistCount;
            break;

        case 'job_finished':
            updateRunStatus(false);
            remainLabel.textContent = `Sisa: 0`;
            percentLabel.textContent = `100%`;
            progressFill.style.width = `100%`;
            if (data.stats) updateStats(data.stats);
            loadHistory();
            break;
    }
}

function updateRunStatus(running) {
    isRunning = running;
    btnStart.disabled = running;
    btnStop.disabled = !running;
    btnStop.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12"></rect></svg> Stop`;
    
    if (statusPill) {
        const dot = statusPill.querySelector('.idle-dot');
        if (dot) dot.className = running ? 'idle-dot running' : 'idle-dot';
        if (statusText) statusText.textContent = running ? 'Running' : 'Idle';
    }
}

function updateStats(stats) {
    if (!stats) return;
    statTotal.textContent = stats.total ?? 0;
    statClean.textContent = stats.clean ?? 0;
    statCaptcha.textContent = stats.captcha ?? 0;
    statNotFound.textContent = stats.not_found ?? 0;
    statBlocked.textContent = stats.error ?? 0;

    if (isShowingHistory) {
        savedInfoText.textContent = `Menampilkan ${historyList.length} akun dari riwayat tersimpan`;
    } else {
        savedInfoText.textContent = `${allResults.length} hasil tersimpan di perangkat`;
    }
}

function updateTabCounts() {
    const dataset = getActiveDataset();
    countAll.textContent = dataset.length;
    countClean.textContent = dataset.filter(r => r.status === 'CLEAN').length;
    countCaptcha.textContent = dataset.filter(r => r.status === 'CAPTCHA').length;
    countNotFound.textContent = dataset.filter(r => r.status === 'NOT_FOUND').length;
    countBlocked.textContent = dataset.filter(r => r.status === 'BLOCKED' || r.status === 'ERROR' || r.status === 'RATE_LIMITED').length;
}

// Start Checking Button
btnStart.addEventListener('click', async () => {
    const emails = extractEmails(emailInput.value);
    if (emails.length === 0) {
        showSwalAlert('warning', 'Daftar Email Kosong', 'Masukkan atau tempel daftar email terlebih dahulu!');
        return;
    }

    // Switch back to session view if was showing history
    if (isShowingHistory) {
        toggleShowHistory(false);
    }

    const payload = {
        emails: emails,
        delay_seconds: parseFloat(delayInput.value) || 2.0,
        headless: headlessCheck.checked,
        use_system_chrome: useChromeCheck.checked
    };

    try {
        const res = await fetch('/api/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) {
            showSwalAlert('error', 'Gagal Memulai', data.detail || 'Gagal memulai pengecekan');
            return;
        }

        // Auto-clear input area as requested:
        emailInput.value = '';
        updateInputMeta();

    } catch (err) {
        showSwalAlert('error', 'Koneksi Terputus', 'Gagal menghubungi server: ' + err.message);
    }
});

// Stop Checking
btnStop.addEventListener('click', async () => {
    btnStop.disabled = true;
    btnStop.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 14 14"></polyline></svg> Menghentikan...`;
    try {
        await fetch('/api/stop', { method: 'POST' });
    } catch (e) {
        console.error('Stop error:', e);
    }
});

// Live Table Rendering
function renderTable() {
    resultsTbody.innerHTML = '';
    const dataset = getActiveDataset();
    const filtered = dataset.filter(item => {
        if (currentFilter === 'ALL') return true;
        if (currentFilter === 'BLOCKED') {
            return item.status === 'BLOCKED' || item.status === 'ERROR' || item.status === 'RATE_LIMITED';
        }
        return item.status === currentFilter;
    });

    if (filtered.length === 0) {
        const emptyLabel = isShowingHistory ? `Tidak ada riwayat (${currentFilter})` : `Belum ada data (${currentFilter})`;
        resultsTbody.innerHTML = `
            <tr class="empty-table-row">
                <td colspan="4">
                    <div class="empty-message">${emptyLabel}</div>
                </td>
            </tr>
        `;
        return;
    }

    filtered.forEach((item, idx) => {
        appendTableRow(item, idx + 1);
    });
}

function appendTableRow(item, num) {
    if (currentFilter !== 'ALL') {
        if (currentFilter === 'BLOCKED') {
            if (!(item.status === 'BLOCKED' || item.status === 'ERROR' || item.status === 'RATE_LIMITED')) return;
        } else if (item.status !== currentFilter) {
            return;
        }
    }

    const emptyRow = resultsTbody.querySelector('.empty-table-row');
    if (emptyRow) emptyRow.remove();

    const tr = document.createElement('tr');

    let badgeClass = 'tag-clean';
    let badgeText = '[CLEAN]';

    if (item.status === 'CAPTCHA') {
        badgeClass = 'tag-captcha';
        badgeText = '[CAPTCHA]';
    } else if (item.status === 'NOT_FOUND') {
        badgeClass = 'tag-notfound';
        badgeText = '[NOT FOUND]';
    } else if (item.status === 'BLOCKED' || item.status === 'ERROR' || item.status === 'RATE_LIMITED') {
        badgeClass = 'tag-blocked';
        badgeText = '[RECHECK]';
    }

    const timeStr = item.time || (new Date()).toTimeString().split(' ')[0].replace(/:/g, '.');
    const cacheTooltip = item.cached ? ' title="Otomatis diambil dari riwayat (< 30 mnt lalu, lewati browser)"' : '';

    tr.innerHTML = `
        <td class="col-no">${num}</td>
        <td class="col-email">${escapeHtml(item.email)}</td>
        <td class="col-status"><span class="badge-tag ${badgeClass}"${cacheTooltip}>${badgeText}</span></td>
        <td class="col-time">${timeStr}</td>
    `;

    resultsTbody.appendChild(tr);
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Live Filter Tabs
document.querySelectorAll('.filter-tab:not(.history-filter-tab)').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.filter-tab:not(.history-filter-tab)').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentFilter = tab.getAttribute('data-filter');
        
        if (currentFilter === 'ALL') {
            copyBtnText.textContent = 'Copy (Semua)';
        } else if (currentFilter === 'CLEAN') {
            copyBtnText.textContent = 'Copy (Clean)';
        } else if (currentFilter === 'CAPTCHA') {
            copyBtnText.textContent = 'Copy (Captcha)';
        } else {
            copyBtnText.textContent = `Copy (${currentFilter})`;
        }

        renderTable();

        // Jika sedang dalam mode riwayat, sinkronkan juga isi textarea dengan filter aktif agar siap copas
        if (isShowingHistory) {
            const dataset = getActiveDataset();
            const filtered = dataset.filter(item => {
                if (currentFilter === 'ALL') return true;
                if (currentFilter === 'BLOCKED') {
                    return item.status === 'BLOCKED' || item.status === 'ERROR' || item.status === 'RATE_LIMITED';
                }
                return item.status === currentFilter;
            });
            emailInput.value = filtered.map(i => i.email).filter(Boolean).join('\n');
            updateInputMeta();
        }
    });
});

// Copy Filtered
btnCopyFiltered.addEventListener('click', async () => {
    const dataset = getActiveDataset();
    const filtered = dataset.filter(item => {
        if (currentFilter === 'ALL') return true;
        if (currentFilter === 'BLOCKED') {
            return item.status === 'BLOCKED' || item.status === 'ERROR' || item.status === 'RATE_LIMITED';
        }
        return item.status === currentFilter;
    });

    if (filtered.length === 0) {
        showToast('info', `Tidak ada email (${currentFilter}) untuk disalin.`);
        return;
    }

    const textToCopy = filtered.map(i => i.email).join('\n');
    await navigator.clipboard.writeText(textToCopy);
    showToast('success', `Berhasil menyalin ${filtered.length} email (${currentFilter})!`);
});

// Toggle Tampilkan Riwayat ke Tampilan Live Checker
function toggleShowHistory(forceState = null) {
    if (forceState !== null) {
        isShowingHistory = forceState;
    } else {
        isShowingHistory = !isShowingHistory;
    }

    if (isShowingHistory) {
        btnToggleShowHistory.classList.add('btn-tool-active');
        showHistoryBtnText.textContent = '⚡ Kembali ke Sesi Ini';
        savedInfoText.textContent = `Menampilkan ${historyList.length} akun dari riwayat tersimpan`;
        if (btnQuickDelCaptcha) btnQuickDelCaptcha.style.display = 'inline-flex';

        // Munculkan seluruh email dari riwayat ke Input Email Target agar bisa dicopas langsung!
        const dataset = getActiveDataset();
        const filtered = dataset.filter(item => {
            if (currentFilter === 'ALL') return true;
            if (currentFilter === 'BLOCKED') {
                return item.status === 'BLOCKED' || item.status === 'ERROR' || item.status === 'RATE_LIMITED';
            }
            return item.status === currentFilter;
        });
        emailInput.value = filtered.map(h => h.email).filter(Boolean).join('\n');
        updateInputMeta();

        // Update metric cards with history counts
        const clean = historyList.filter(r => r.status === 'CLEAN').length;
        const captcha = historyList.filter(r => r.status === 'CAPTCHA').length;
        const notFound = historyList.filter(r => r.status === 'NOT_FOUND').length;
        const blocked = historyList.filter(r => r.status === 'BLOCKED' || r.status === 'ERROR' || r.status === 'RATE_LIMITED').length;
        updateStats({ total: historyList.length, clean, captcha, not_found: notFound, error: blocked });
    } else {
        btnToggleShowHistory.classList.remove('btn-tool-active');
        showHistoryBtnText.innerHTML = `Tampilkan Riwayat (<span id="btn-hist-count">${historyList.length}</span>)`;
        savedInfoText.textContent = `${allResults.length} hasil tersimpan di perangkat`;
        if (btnQuickDelCaptcha) btnQuickDelCaptcha.style.display = 'none';

        // Kosongkan kembali textarea saat kembali ke sesi live
        emailInput.value = '';
        updateInputMeta();

        // Restore current session stats
        const clean = allResults.filter(r => r.status === 'CLEAN').length;
        const captcha = allResults.filter(r => r.status === 'CAPTCHA').length;
        const notFound = allResults.filter(r => r.status === 'NOT_FOUND').length;
        const blocked = allResults.filter(r => r.status === 'BLOCKED' || r.status === 'ERROR' || r.status === 'RATE_LIMITED').length;
        updateStats({ total: allResults.length, clean, captcha, not_found: notFound, error: blocked });
    }

    updateTabCounts();
    renderTable();
}

if (btnToggleShowHistory) {
    btnToggleShowHistory.addEventListener('click', () => toggleShowHistory());
}

// ================= EXPORT MODAL LOGIC =================
function openExportModal(defaultSource = null) {
    modalCurrCount.textContent = `${allResults.length} email`;
    modalHistCount.textContent = `${historyList.length} email`;

    if (!defaultSource) {
        defaultSource = isShowingHistory ? 'history' : 'current';
    }

    const sourceRadio = document.querySelector(`input[name="export-source"][value="${defaultSource}"]`);
    if (sourceRadio) sourceRadio.checked = true;

    exportModal.style.display = 'flex';
}

function closeExportModal() {
    exportModal.style.display = 'none';
}

btnOpenExport.addEventListener('click', () => openExportModal(isShowingHistory ? 'history' : 'current'));
btnExportHistoryModal.addEventListener('click', () => openExportModal('history'));
btnCloseExport.addEventListener('click', closeExportModal);
btnCancelExport.addEventListener('click', closeExportModal);

// Close modal when clicking outside box
exportModal.addEventListener('click', (e) => {
    if (e.target === exportModal) closeExportModal();
});

btnConfirmExport.addEventListener('click', () => {
    const source = document.querySelector('input[name="export-source"]:checked')?.value || 'current';
    const status = exportStatusSelect.value;
    const format = document.querySelector('input[name="export-format"]:checked')?.value || 'txt_email_only';

    const url = `/api/export?source=${source}&filter_status=${status}&format=${format}`;
    window.location.href = url;
    closeExportModal();
});

// ================= RIWAYAT AKUN (HISTORY) =================
async function loadHistory() {
    try {
        const res = await fetch('/api/history');
        const data = await res.json();
        historyList = data.data || [];
        navHistoryCount.textContent = historyList.length;
        const btnCountEl = document.getElementById('btn-hist-count');
        if (btnCountEl) btnCountEl.textContent = historyList.length;

        if (isShowingHistory) {
            const clean = historyList.filter(r => r.status === 'CLEAN').length;
            const captcha = historyList.filter(r => r.status === 'CAPTCHA').length;
            const notFound = historyList.filter(r => r.status === 'NOT_FOUND').length;
            const blocked = historyList.filter(r => r.status === 'BLOCKED' || r.status === 'ERROR' || r.status === 'RATE_LIMITED').length;
            updateStats({ total: historyList.length, clean, captcha, not_found: notFound, error: blocked });
            updateTabCounts();
            renderTable();
        }

        renderHistory();
    } catch (e) {
        console.error('Error loading history:', e);
    }
}

function renderHistory() {
    // Update history filter counters
    histCountAll.textContent = historyList.length;
    histCountClean.textContent = historyList.filter(h => h.status === 'CLEAN').length;
    histCountCaptcha.textContent = historyList.filter(h => h.status === 'CAPTCHA').length;
    histCountNotFound.textContent = historyList.filter(h => h.status === 'NOT_FOUND').length;

    const query = (historySearchInput.value || '').toLowerCase().trim();

    const filtered = historyList.filter(item => {
        // Status filter
        if (historyFilter !== 'ALL' && item.status !== historyFilter) return false;
        // Search query
        if (query && !item.email.toLowerCase().includes(query)) return false;
        return true;
    });

    historyTbody.innerHTML = '';

    if (filtered.length === 0) {
        historyTbody.innerHTML = `
            <tr class="empty-table-row">
                <td colspan="6">
                    <div class="empty-message">Tidak ada riwayat akun yang cocok</div>
                </td>
            </tr>
        `;
        return;
    }

    filtered.forEach((item, idx) => {
        const tr = document.createElement('tr');

        let badgeClass = 'tag-clean';
        let badgeText = '[CLEAN]';

        if (item.status === 'CAPTCHA') {
            badgeClass = 'tag-captcha';
            badgeText = '[CAPTCHA]';
        } else if (item.status === 'NOT_FOUND') {
            badgeClass = 'tag-notfound';
            badgeText = '[NOT FOUND]';
        } else if (item.status === 'BLOCKED' || item.status === 'ERROR' || item.status === 'RATE_LIMITED') {
            badgeClass = 'tag-blocked';
            badgeText = '[RECHECK]';
        }

        const dateStr = item.date || '-';
        const timeStr = item.time || '-';

        tr.innerHTML = `
            <td class="col-no">${idx + 1}</td>
            <td class="col-email">${escapeHtml(item.email)}</td>
            <td class="col-status"><span class="badge-tag ${badgeClass}">${badgeText}</span></td>
            <td class="col-detail">${escapeHtml(item.detail || '-')}</td>
            <td class="col-time">${dateStr} ${timeStr}</td>
            <td style="text-align: center;">
                <button class="btn-row-del" onclick="deleteSingleHistoryItem('${escapeHtml(item.email)}')" title="Hapus email ini dari riwayat">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
            </td>
        `;
        historyTbody.appendChild(tr);
    });
}

// History Filters
document.querySelectorAll('.history-filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.history-filter-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        historyFilter = tab.getAttribute('data-filter');
        renderHistory();
    });
});

historySearchInput.addEventListener('input', renderHistory);
btnRefreshHistory.addEventListener('click', loadHistory);

// Hapus Khusus Akun CAPTCHA dari Riwayat
async function deleteCaptchaHistory() {
    const captchaCount = historyList.filter(h => h.status === 'CAPTCHA').length;
    if (captchaCount === 0) {
        showSwalAlert('info', 'Informasi', 'Tidak ada email berstatus CAPTCHA di riwayat tersimpan.');
        return;
    }
    const confirmed = await showSwalConfirm(
        'Hapus Riwayat CAPTCHA?',
        `Apakah Anda yakin ingin menghapus <strong>${captchaCount}</strong> email berstatus <strong>CAPTCHA</strong> dari riwayat tersimpan?<br><small style="color:#94a3b8">Email CLEAN dan status lainnya tidak akan dihapus.</small>`,
        'Ya, Hapus CAPTCHA',
        true
    );
    if (!confirmed) return;

    try {
        const res = await fetch('/api/history?status=CAPTCHA', { method: 'DELETE' });
        const data = await res.json();
        showToast('success', data.message || `Berhasil menghapus ${captchaCount} email Captcha.`);
        await loadHistory();
        if (isShowingHistory) {
            const dataset = getActiveDataset();
            const filtered = dataset.filter(item => {
                if (currentFilter === 'ALL') return true;
                if (currentFilter === 'BLOCKED') {
                    return item.status === 'BLOCKED' || item.status === 'ERROR' || item.status === 'RATE_LIMITED';
                }
                return item.status === currentFilter;
            });
            emailInput.value = filtered.map(i => i.email).filter(Boolean).join('\n');
            updateInputMeta();
        }
    } catch (e) {
        showSwalAlert('error', 'Gagal Menghapus', 'Gagal menghapus riwayat Captcha: ' + e.message);
    }
}

if (btnClearCaptchaHistory) {
    btnClearCaptchaHistory.addEventListener('click', deleteCaptchaHistory);
}
if (btnQuickDelCaptcha) {
    btnQuickDelCaptcha.addEventListener('click', deleteCaptchaHistory);
}

// Hapus Single Email dari Riwayat
async function deleteSingleHistoryItem(email) {
    if (!email) return;
    const confirmed = await showSwalConfirm(
        'Hapus dari Riwayat?',
        `Hapus email <strong>${email}</strong> dari riwayat tersimpan?`,
        'Ya, Hapus',
        true
    );
    if (!confirmed) return;

    try {
        const res = await fetch(`/api/history?email=${encodeURIComponent(email)}`, { method: 'DELETE' });
        showToast('success', `Email ${email} dihapus.`);
        await loadHistory();
        if (isShowingHistory) {
            const dataset = getActiveDataset();
            const filtered = dataset.filter(item => {
                if (currentFilter === 'ALL') return true;
                if (currentFilter === 'BLOCKED') {
                    return item.status === 'BLOCKED' || item.status === 'ERROR' || item.status === 'RATE_LIMITED';
                }
                return item.status === currentFilter;
            });
            emailInput.value = filtered.map(i => i.email).filter(Boolean).join('\n');
            updateInputMeta();
        }
    } catch (e) {
        showSwalAlert('error', 'Gagal Menghapus', 'Gagal menghapus email: ' + e.message);
    }
}
window.deleteSingleHistoryItem = deleteSingleHistoryItem;

// Clear Semua History
btnClearHistory.addEventListener('click', async () => {
    const confirmed = await showSwalConfirm(
        'Hapus Semua Riwayat?',
        'Apakah Anda yakin ingin menghapus <strong>seluruh riwayat akun tersimpan</strong>?<br><small style="color:#ef4444">Tindakan ini permanen dan data tidak dapat dikembalikan lagi.</small>',
        'Ya, Hapus Seluruhnya',
        true
    );
    if (!confirmed) return;

    try {
        await fetch('/api/history', { method: 'DELETE' });
        historyList = [];
        navHistoryCount.textContent = '0';
        renderHistory();
        if (isShowingHistory) {
            emailInput.value = '';
            updateInputMeta();
            updateStats({ total: 0, clean: 0, captcha: 0, not_found: 0, error: 0 });
            updateTabCounts();
            renderTable();
        }
        showToast('success', 'Seluruh riwayat akun berhasil dibersihkan.');
    } catch (e) {
        showSwalAlert('error', 'Gagal Menghapus', 'Gagal menghapus riwayat: ' + e.message);
    }
});

// ==========================================================================
// CATATAN AKUN (EXPLORER STYLE - FOLDER ORTU & DRILLDOWN DETAIL)
// ==========================================================================
let notesList = [];
let foldersSummary = [];
let activeFolder = null;

// Top Explorer Action Buttons
const btnTopAddOrtu = document.getElementById('btn-top-add-ortu');
const btnTopImportHistory = document.getElementById('btn-top-import-history');
const btnTopClearAll = document.getElementById('btn-top-clear-all');

// Address Bar & Breadcrumbs
const crumbRoot = document.getElementById('crumb-root');
const crumbSep = document.getElementById('crumb-sep');
const crumbCurrent = document.getElementById('crumb-current');
const folderSearchInput = document.getElementById('folder-search-input');

// Views
const foldersGridContainer = document.getElementById('folders-grid-container');
const folderDetailView = document.getElementById('folder-detail-view');
const btnBackToFolders = document.getElementById('btn-back-to-folders');

// Wire Top Buttons
if (btnTopAddOrtu) {
    btnTopAddOrtu.addEventListener('click', () => openCreateFolderModal());
}
if (btnTopImportHistory) {
    btnTopImportHistory.addEventListener('click', () => openImportHistoryModal());
}
if (btnTopClearAll) {
    btnTopClearAll.addEventListener('click', () => clearAllNotes(false));
}

const btnTopClearAllWithHistory = document.getElementById('btn-top-clear-all-with-history');
if (btnTopClearAllWithHistory) {
    btnTopClearAllWithHistory.addEventListener('click', () => clearAllNotes(true));
}

if (crumbRoot) {
    crumbRoot.addEventListener('click', () => closeFolder());
}
if (btnBackToFolders) {
    btnBackToFolders.addEventListener('click', () => closeFolder());
}
if (folderSearchInput) {
    folderSearchInput.addEventListener('input', () => renderFolderGrid());
}

// Load Notes from Server
async function loadNotes() {
    try {
        const res = await fetch('/api/notes');
        const data = await res.json();
        notesList = data.data || [];
        foldersSummary = data.folders || [];

        // Update top nav badge count
        if (navNotesCount) navNotesCount.textContent = notesList.length;

        // Populate datalists and dropdowns
        updateFolderOptionsUI();

        // If currently inside a folder, refresh the detail table
        if (activeFolder) {
            openFolder(activeFolder);
        } else {
            renderFolderGrid();
            renderGeneralAccounts();
        }
    } catch (err) {
        console.error('Error loading notes:', err);
    }
}

// Update Datalist and Select Options
function updateFolderOptionsUI() {
    const datalist1 = document.getElementById('datalist-ortu-folders');
    const datalist2 = document.getElementById('datalist-ortu-folders-batch');
    const exportFolderSelect = document.getElementById('export-note-folder-select');
    const selectMoveOrtu = document.getElementById('select-move-ortu');

    const folderNames = foldersSummary.map(f => f.name).filter(Boolean);
    const optionsHtml = folderNames.map(f => `<option value="${escapeHtml(f)}">`).join('');
    if (datalist1) datalist1.innerHTML = optionsHtml;
    if (datalist2) datalist2.innerHTML = optionsHtml;

    if (selectMoveOrtu) {
        let moveHtml = `<option value="">Pilih Folder Ortu Tujuan...</option>`;
        folderNames.forEach(f => {
            moveHtml += `<option value="${escapeHtml(f)}">📁 ${escapeHtml(f)}</option>`;
        });
        selectMoveOrtu.innerHTML = moveHtml;
    }

    if (exportFolderSelect) {
        let expHtml = `<option value="ALL">Semua Folder (Seluruh Akun)</option>`;
        folderNames.forEach(f => {
            expHtml += `<option value="${escapeHtml(f)}">${escapeHtml(f)}</option>`;
        });
        exportFolderSelect.innerHTML = expHtml;
    }
}

// ==========================================================================
// RENDER EXPLORER FOLDER GRID (CLEAR NAMA, KLIK 2X BUKA, DROP TARGET AUTO MOVE)
// ==========================================================================
function renderFolderGrid() {
    if (!foldersGridContainer) return;
    const query = (folderSearchInput ? folderSearchInput.value : '').toLowerCase().trim();

    const filtered = foldersSummary.filter(f => {
        if (!query) return true;
        return f.name.toLowerCase().includes(query);
    });

    foldersGridContainer.innerHTML = '';

    if (filtered.length === 0) {
        foldersGridContainer.innerHTML = `
            <div class="folder-empty-state">
                <div class="folder-empty-icon">
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                    </svg>
                </div>
                <div class="folder-empty-text">Belum ada folder</div>
                <div class="folder-empty-desc">Klik tombol "+ Tambah Folder" di atas untuk membuat folder baru, atau gunakan "Import Riwayat".</div>
            </div>
        `;
        return;
    }

    const blueFolderSvg = `
        <svg width="42" height="36" viewBox="0 0 44 36" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M4 6C4 4.89543 4.89543 4 6 4H16.5C17.1 4 17.7 4.3 18.1 4.7L21.5 8.5H38C39.1046 8.5 40 9.39543 40 10.5V28C40 29.1046 39.1046 30 38 30H6C4.89543 30 4 29.1046 4 28V6Z" fill="#1d4ed8"/>
            <path d="M6 5H16.2C16.6 5 17 5.2 17.3 5.5L20.5 9H38C38.6 9 39 9.4 39 10V13H5V6C5 5.4 5.4 5 6 5Z" fill="#3b82f6" fill-opacity="0.8"/>
            <rect x="3" y="11" width="38" height="21" rx="3" fill="url(#frontBlueGrad)" stroke="#60a5fa" stroke-width="0.75"/>
            <line x1="5" y1="12.5" x2="39" y2="12.5" stroke="#bfdbfe" stroke-width="1" stroke-linecap="round" stroke-opacity="0.9"/>
            <defs>
                <linearGradient id="frontBlueGrad" x1="22" y1="11" x2="22" y2="32" gradientUnits="userSpaceOnUse">
                    <stop stop-color="#3b82f6"/>
                    <stop offset="1" stop-color="#1e40af"/>
                </linearGradient>
            </defs>
        </svg>
    `;

    filtered.forEach(f => {
        const item = document.createElement('div');
        item.className = 'explorer-folder-item';
        item.setAttribute('data-folder-name', f.name);
        item.title = `${f.name} (${f.total} akun anak)\n• Klik 1x untuk memilih\n• Klik 2x untuk membuka folder\n• Tarik akun ke sini untuk auto-move`;
        item.innerHTML = `
            <div class="explorer-folder-icon">
                ${blueFolderSvg}
            </div>
            <div class="explorer-folder-info">
                <div class="explorer-folder-name" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</div>
                <div class="explorer-folder-count-badge">
                    <span>${f.total} akun</span>
                    ${f.clean ? `&bull; <span style="color: #34d399;">${f.clean} Clean</span>` : ''}
                    ${f.captcha ? `&bull; <span style="color: #fbbf24;">${f.captcha} Captcha</span>` : ''}
                </div>
            </div>
            <div class="explorer-folder-actions">
                <button class="btn-explorer-action" onclick="event.stopPropagation(); quickCopyFolderEmails('${escapeHtml(f.name)}')" title="Salin semua email">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                </button>
                <button class="btn-explorer-action" onclick="event.stopPropagation(); renameFolder('${escapeHtml(f.name)}')" title="Ubah nama folder (Rename)">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                </button>
                <button class="btn-explorer-action btn-del" onclick="event.stopPropagation(); deleteFolder('${escapeHtml(f.name)}', false)" title="Hapus folder">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
                <button class="btn-explorer-action btn-del-history" onclick="event.stopPropagation(); deleteFolder('${escapeHtml(f.name)}', true)" title="Hapus folder beserta riwayat">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                </button>
            </div>
        `;

        // 1x Click: Select folder (ala Windows Explorer)
        item.addEventListener('click', () => {
            document.querySelectorAll('.explorer-folder-item').forEach(el => el.classList.remove('selected'));
            item.classList.add('selected');
        });

        // 2x Click (Double Click): Masuk ke folder!
        item.addEventListener('dblclick', () => {
            openFolder(f.name);
        });

        // Drag & Drop Dropzone (Auto Move saat ditarik ke folder ini)
        item.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            item.classList.add('folder-drop-active');
        });

        item.addEventListener('dragleave', () => {
            item.classList.remove('folder-drop-active');
        });

        item.addEventListener('drop', async (e) => {
            e.preventDefault();
            item.classList.remove('folder-drop-active');
            let emails = [];
            try {
                const raw = e.dataTransfer.getData('text/plain');
                if (raw) {
                    emails = raw.split('\n').map(s => s.trim()).filter(Boolean);
                }
            } catch (err) {
                console.error(err);
            }

            if (emails.length > 0) {
                await moveAccountsToFolder(emails, f.name);
            }
        });

        foldersGridContainer.appendChild(item);
    });
}

// ==========================================================================
// RENDER GENERAL ACCOUNTS (DAFTAR AKUN UMUM - SIAP DRAG & DROP KE FOLDER ORTU)
// ==========================================================================
function renderGeneralAccounts() {
    const tbody = document.getElementById('general-emails-tbody');
    const badgeCount = document.getElementById('badge-general-count');
    const chkSelectAll = document.getElementById('chk-select-all-general');
    const selectionBar = document.getElementById('general-selection-bar');

    if (!tbody) return;

    // Filter accounts without ortu (general)
    const generalAccounts = notesList.filter(n => !(n.ortu && n.ortu.trim()));
    if (badgeCount) badgeCount.textContent = `${generalAccounts.length} akun`;

    const query = (folderSearchInput ? folderSearchInput.value : '').toLowerCase().trim();
    const filtered = generalAccounts.filter(item => {
        if (!query) return true;
        const em = (item.email || '').toLowerCase();
        const dt = (item.detail || '').toLowerCase();
        return em.includes(query) || dt.includes(query);
    });

    tbody.innerHTML = '';
    if (chkSelectAll) chkSelectAll.checked = false;
    if (selectionBar) selectionBar.style.display = 'none';

    if (filtered.length === 0) {
        tbody.innerHTML = `
            <tr class="empty-table-row">
                <td colspan="8">
                    <div class="empty-message">${generalAccounts.length === 0 ? 'Belum ada akun di daftar umum. Klik tombol "Import Riwayat" di atas untuk memasukkan akun.' : 'Tidak ada akun umum yang cocok dengan pencarian.'}</div>
                </td>
            </tr>
        `;
        return;
    }

    filtered.forEach((item, idx) => {
        const tr = document.createElement('tr');
        tr.className = 'draggable-row';
        tr.setAttribute('draggable', 'true');
        tr.setAttribute('data-email', item.email);
        tr.title = `Tarik (drag) akun ini ke salah satu folder ortu di atas untuk memindahkannya`;

        let badgeClass = 'tag-clean';
        let badgeText = '[CLEAN]';
        if (item.status === 'CAPTCHA') {
            badgeClass = 'tag-captcha';
            badgeText = '[CAPTCHA]';
        } else if (item.status === 'NOT_FOUND') {
            badgeClass = 'tag-notfound';
            badgeText = '[NOT FOUND]';
        } else if (item.status === 'BLOCKED' || item.status === 'ERROR') {
            badgeClass = 'tag-blocked';
            badgeText = '[RECHECK]';
        } else if (item.status === 'UNCHECKED') {
            badgeClass = 'tag-notfound';
            badgeText = '[BELUM DICEK]';
        }

        tr.innerHTML = `
            <td style="text-align: center;">
                <input type="checkbox" class="chk-general-item" data-email="${escapeHtml(item.email)}">
            </td>
            <td class="col-no">${idx + 1}</td>
            <td class="col-email">
                <span class="drag-handle" title="Tarik baris ini">⋮⋮</span>
                <strong>${escapeHtml(item.email)}</strong>
            </td>
            <td class="col-pass" style="font-family: var(--font-mono); color: #94a3b8;">${escapeHtml(item.password || '-')}</td>
            <td class="col-status"><span class="badge-tag ${badgeClass}">${badgeText}</span></td>
            <td class="col-detail">${escapeHtml(item.detail || '-')}</td>
            <td class="col-time">${item.date || '-'} ${item.time || ''}</td>
            <td style="text-align: center;">
                <div style="display: flex; gap: 4px; justify-content: center;">
                    <button class="btn-row-del" onclick="quickCopyText('${escapeHtml(item.email)}')" title="Salin Email">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                    </button>
                    <button class="btn-row-del" onclick="openEditNoteModal('${escapeHtml(item.id)}')" title="Edit Catatan">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                    </button>
                    <button class="btn-row-del" onclick="deleteSingleNote('${escapeHtml(item.id)}', '${escapeHtml(item.email)}')" title="Hapus Akun">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    </button>
                </div>
            </td>
        `;

        // Dragstart: If this row is checked, drag all checked accounts! If not, drag only this account.
        tr.addEventListener('dragstart', (e) => {
            tr.classList.add('dragging');
            const chk = tr.querySelector('.chk-general-item');
            let emailsToMove = [item.email];

            const checkedBoxes = Array.from(document.querySelectorAll('.chk-general-item:checked'));
            const checkedEmails = checkedBoxes.map(cb => cb.getAttribute('data-email')).filter(Boolean);

            if (chk && chk.checked && checkedEmails.length > 1) {
                emailsToMove = checkedEmails;
            }

            e.dataTransfer.setData('text/plain', emailsToMove.join('\n'));
            e.dataTransfer.effectAllowed = 'move';
        });

        tr.addEventListener('dragend', () => {
            tr.classList.remove('dragging');
        });

        tbody.appendChild(tr);
    });

    // Checkbox selection logic
    const allCheckboxes = Array.from(document.querySelectorAll('.chk-general-item'));
    allCheckboxes.forEach(cb => {
        cb.addEventListener('change', updateGeneralSelectionUI);
    });

    if (chkSelectAll) {
        chkSelectAll.onchange = () => {
            const isChecked = chkSelectAll.checked;
            allCheckboxes.forEach(cb => { cb.checked = isChecked; });
            updateGeneralSelectionUI();
        };
    }
}

function updateGeneralSelectionUI() {
    const checkedBoxes = Array.from(document.querySelectorAll('.chk-general-item:checked'));
    const selectionBar = document.getElementById('general-selection-bar');
    const countLabel = document.getElementById('selection-count-label');

    if (!selectionBar) return;
    if (checkedBoxes.length > 0) {
        selectionBar.style.display = 'flex';
        if (countLabel) countLabel.textContent = `${checkedBoxes.length} akun dipilih`;
    } else {
        selectionBar.style.display = 'none';
    }
}

// Move Accounts to Folder (via Drag & Drop or Move Dropdown)
async function moveAccountsToFolder(emails, targetOrtu) {
    if (!emails || emails.length === 0) return;

    try {
        const res = await fetch('/api/notes/move', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                emails: emails,
                target_ortu: targetOrtu || ''
            })
        });
        const data = await res.json();
        if (data.status === 'ok') {
            const destName = targetOrtu ? `'${targetOrtu}'` : 'Umum';
            showToast('success', `✓ Berhasil memindahkan ${data.moved_count} akun ke ${destName}!`);
            await loadNotes();
        } else {
            showSwalAlert('error', 'Gagal Memindahkan', (data.detail || data.message || 'Error'));
        }
    } catch (err) {
        showSwalAlert('error', 'Koneksi Gagal', 'Gagal menghubungi server: ' + err.message);
    }
}
window.moveAccountsToFolder = moveAccountsToFolder;

// Wire Move & Delete Buttons on General Selection Bar
const btnMoveToOrtu = document.getElementById('btn-move-to-ortu');
const selectMoveOrtu = document.getElementById('select-move-ortu');
const btnDeleteSelectedGeneral = document.getElementById('btn-delete-selected-general');

if (btnMoveToOrtu) {
    btnMoveToOrtu.addEventListener('click', async () => {
        const checkedBoxes = Array.from(document.querySelectorAll('.chk-general-item:checked'));
        const emails = checkedBoxes.map(cb => cb.getAttribute('data-email')).filter(Boolean);
        if (emails.length === 0) {
            showToast('warning', 'Pilih minimal 1 akun terlebih dahulu.');
            return;
        }

        const target = selectMoveOrtu ? selectMoveOrtu.value : '';
        if (!target) {
            showToast('warning', 'Silakan pilih folder tujuan dari menu pilihan.');
            return;
        }

        await moveAccountsToFolder(emails, target);
    });
}

if (btnDeleteSelectedGeneral) {
    btnDeleteSelectedGeneral.addEventListener('click', async () => {
        const checkedBoxes = Array.from(document.querySelectorAll('.chk-general-item:checked'));
        const emails = checkedBoxes.map(cb => cb.getAttribute('data-email')).filter(Boolean);
        if (emails.length === 0) return;

        const confirmed = await showSwalConfirm(
            'Hapus Akun Terpilih?',
            `Hapus <strong>${emails.length}</strong> akun terpilih dari catatan umum?`,
            'Ya, Hapus Akun',
            true
        );
        if (!confirmed) return;

        for (const em of emails) {
            await fetch(`/api/notes?email=${encodeURIComponent(em)}`, { method: 'DELETE' });
        }
        showToast('success', `${emails.length} akun berhasil dihapus.`);
        await loadNotes();
    });
}

// ==========================================================================
// DRILLDOWN VIEW: OPEN & CLOSE FOLDER
// ==========================================================================
function openFolder(folderName) {
    activeFolder = folderName;

    // Switch view
    if (foldersGridContainer) foldersGridContainer.style.display = 'none';
    const genSection = document.getElementById('general-accounts-section');
    if (genSection) genSection.style.display = 'none';
    if (folderDetailView) folderDetailView.style.display = 'flex';

    // Update Breadcrumbs
    if (crumbSep) crumbSep.style.display = 'inline-block';
    if (crumbCurrent) {
        crumbCurrent.textContent = folderName;
        crumbCurrent.style.display = 'inline-block';
    }

    const titleEl = document.getElementById('opened-folder-title');
    const countEl = document.getElementById('opened-folder-count');
    const breakdownEl = document.getElementById('opened-folder-breakdown');
    const tbody = document.getElementById('folder-emails-tbody');

    const folderSummary = foldersSummary.find(f => f.name === folderName) || {
        name: folderName,
        total: 0,
        clean: 0,
        captcha: 0,
        not_found: 0
    };

    if (titleEl) titleEl.textContent = folderName;
    if (countEl) countEl.textContent = `${folderSummary.total} akun`;
    if (breakdownEl) {
        breakdownEl.textContent = `${folderSummary.clean} Clean • ${folderSummary.captcha} Captcha • ${folderSummary.not_found} Not Found`;
    }

    // Get emails in folder
    const emailsInFolder = notesList.filter(n => {
        if (folderName === '(Tanpa Ortu)') {
            return !(n.ortu && n.ortu.trim());
        }
        return (n.ortu || '').trim().toLowerCase() === folderName.trim().toLowerCase();
    });

    if (!tbody) return;
    tbody.innerHTML = '';

    if (emailsInFolder.length === 0) {
        tbody.innerHTML = `
            <tr class="empty-table-row">
                <td colspan="7">
                    <div class="empty-message">Folder ini masih kosong. Tarik akun dari daftar umum ke folder ini, atau klik "+ Tambah Akun".</div>
                </td>
            </tr>
        `;
        return;
    }

    emailsInFolder.forEach((item, idx) => {
        const tr = document.createElement('tr');

        let badgeClass = 'tag-clean';
        let badgeText = '[CLEAN]';
        if (item.status === 'CAPTCHA') {
            badgeClass = 'tag-captcha';
            badgeText = '[CAPTCHA]';
        } else if (item.status === 'NOT_FOUND') {
            badgeClass = 'tag-notfound';
            badgeText = '[NOT FOUND]';
        } else if (item.status === 'BLOCKED' || item.status === 'ERROR') {
            badgeClass = 'tag-blocked';
            badgeText = '[RECHECK]';
        } else if (item.status === 'UNCHECKED') {
            badgeClass = 'tag-notfound';
            badgeText = '[BELUM DICEK]';
        }

        tr.innerHTML = `
            <td class="col-no">${idx + 1}</td>
            <td class="col-email"><strong>${escapeHtml(item.email)}</strong></td>
            <td class="col-pass" style="font-family: var(--font-mono); color: #94a3b8;">${escapeHtml(item.password || '-')}</td>
            <td class="col-status"><span class="badge-tag ${badgeClass}">${badgeText}</span></td>
            <td class="col-detail">${escapeHtml(item.detail || '-')}</td>
            <td class="col-time">${item.date || '-'} ${item.time || ''}</td>
            <td style="text-align: center;">
                <div style="display: flex; gap: 4px; justify-content: center;">
                    <button class="btn-row-del" onclick="quickCopyText('${escapeHtml(item.email)}')" title="Salin Email">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                    </button>
                    <button class="btn-row-del" onclick="openEditNoteModal('${escapeHtml(item.id)}')" title="Edit Catatan">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                    </button>
                    <button class="btn-row-del" onclick="moveAccountsToFolder(['${escapeHtml(item.email)}'], '')" title="Keluarkan akun ke Umum">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
                    </button>
                    <button class="btn-row-del" onclick="deleteSingleNote('${escapeHtml(item.id)}', '${escapeHtml(item.email)}')" title="Hapus Akun">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}
window.openFolder = openFolder;

function closeFolder() {
    activeFolder = null;
    if (folderDetailView) folderDetailView.style.display = 'none';
    if (foldersGridContainer) foldersGridContainer.style.display = 'grid';
    const genSection = document.getElementById('general-accounts-section');
    if (genSection) genSection.style.display = 'flex';
    if (crumbSep) crumbSep.style.display = 'none';
    if (crumbCurrent) {
        crumbCurrent.style.display = 'none';
        crumbCurrent.textContent = '';
    }
    renderFolderGrid();
    renderGeneralAccounts();
}
window.closeFolder = closeFolder;

// Folder Detail Actions
const btnCopyFolderEmails = document.getElementById('btn-copy-folder-emails');
const btnSendFolderToChecker = document.getElementById('btn-send-folder-to-checker');
const btnAddAccountToFolder = document.getElementById('btn-add-account-to-folder');
const btnDeleteCurrentFolder = document.getElementById('btn-delete-current-folder');

function getActiveFolderEmails() {
    if (!activeFolder) return [];
    return notesList.filter(n => {
        if (activeFolder === '(Tanpa Ortu)') return !(n.ortu && n.ortu.trim());
        return (n.ortu || '').trim().toLowerCase() === activeFolder.trim().toLowerCase();
    }).map(n => n.email).filter(Boolean);
}

if (btnCopyFolderEmails) {
    btnCopyFolderEmails.addEventListener('click', () => {
        const emails = getActiveFolderEmails();
        if (emails.length === 0) {
            showToast('info', 'Tidak ada email dalam folder ini.');
            return;
        }
        navigator.clipboard.writeText(emails.join('\n'));
        showToast('success', `Berhasil menyalin ${emails.length} email dari folder '${activeFolder}'!`);
    });
}

if (btnSendFolderToChecker) {
    btnSendFolderToChecker.addEventListener('click', () => {
        const emails = getActiveFolderEmails();
        if (emails.length === 0) {
            showToast('info', 'Tidak ada email dalam folder ini.');
            return;
        }
        emailInput.value = emails.join('\n');
        updateInputMeta();
        switchMainTab('checker');
        showToast('success', `${emails.length} email dimasukkan ke Live Checker.`);
    });
}

if (btnAddAccountToFolder) {
    btnAddAccountToFolder.addEventListener('click', () => {
        openAddNoteModal(activeFolder);
    });
}

if (btnDeleteCurrentFolder) {
    btnDeleteCurrentFolder.addEventListener('click', () => {
        if (activeFolder) deleteFolder(activeFolder, false);
    });
}

const btnDeleteFolderWithHistory = document.getElementById('btn-delete-folder-with-history');
if (btnDeleteFolderWithHistory) {
    btnDeleteFolderWithHistory.addEventListener('click', () => {
        if (activeFolder) deleteFolder(activeFolder, true);
    });
}

const btnRenameCurrentFolder = document.getElementById('btn-rename-current-folder');
if (btnRenameCurrentFolder) {
    btnRenameCurrentFolder.addEventListener('click', () => {
        if (activeFolder) renameFolder(activeFolder);
    });
}

function quickCopyFolderEmails(folderName) {
    const emails = notesList.filter(n => {
        if (folderName === '(Tanpa Ortu)') return !(n.ortu && n.ortu.trim());
        return (n.ortu || '').trim().toLowerCase() === folderName.trim().toLowerCase();
    }).map(n => n.email).filter(Boolean);

    if (emails.length === 0) {
        showToast('info', 'Tidak ada email dalam folder ini.');
        return;
    }
    navigator.clipboard.writeText(emails.join('\n'));
    showToast('success', `Berhasil menyalin ${emails.length} email dari folder '${folderName}'!`);
}
window.quickCopyFolderEmails = quickCopyFolderEmails;

// Quick Copy Helper
function quickCopyText(text) {
    if (!text) return;
    navigator.clipboard.writeText(text);
    showToast('success', 'Berhasil disalin ke clipboard!');
}
window.quickCopyText = quickCopyText;

// ==========================================================================
// MODAL: TAMBAH / EDIT SINGLE NOTE
// ==========================================================================
const modalNoteSingle = document.getElementById('modal-note-single');
const btnCloseNoteSingle = document.getElementById('btn-close-note-single');
const btnCancelNoteSingle = document.getElementById('btn-cancel-note-single');
const btnSaveNoteSingle = document.getElementById('btn-save-note-single');

const inputNoteId = document.getElementById('input-note-id');
const inputNoteEmail = document.getElementById('input-note-email');
const inputNoteOrtu = document.getElementById('input-note-ortu');
const inputNotePassword = document.getElementById('input-note-password');
const inputNoteStatus = document.getElementById('input-note-status');
const inputNoteDetail = document.getElementById('input-note-detail');
const noteModalTitle = document.getElementById('note-modal-title');

function openAddNoteModal(prefillOrtu = '') {
    if (inputNoteId) inputNoteId.value = '';
    if (inputNoteEmail) inputNoteEmail.value = '';
    if (inputNoteOrtu) inputNoteOrtu.value = prefillOrtu || '';
    if (inputNotePassword) inputNotePassword.value = '';
    if (inputNoteStatus) inputNoteStatus.value = 'UNCHECKED';
    if (inputNoteDetail) inputNoteDetail.value = '';
    if (noteModalTitle) noteModalTitle.innerHTML = `<span>Tambah Catatan Akun</span>`;
    if (modalNoteSingle) modalNoteSingle.style.display = 'flex';
}
window.openAddNoteModal = openAddNoteModal;

function openEditNoteModal(noteId) {
    const item = notesList.find(n => n.id === noteId);
    if (!item) return;

    if (inputNoteId) inputNoteId.value = item.id;
    if (inputNoteEmail) inputNoteEmail.value = item.email;
    if (inputNoteOrtu) inputNoteOrtu.value = item.ortu || '';
    if (inputNotePassword) inputNotePassword.value = item.password || '';
    if (inputNoteStatus) inputNoteStatus.value = item.status || 'UNCHECKED';
    if (inputNoteDetail) inputNoteDetail.value = item.detail || '';
    if (noteModalTitle) noteModalTitle.innerHTML = `<span>Edit Catatan: ${escapeHtml(item.email)}</span>`;
    if (modalNoteSingle) modalNoteSingle.style.display = 'flex';
}
window.openEditNoteModal = openEditNoteModal;

function closeNoteSingleModal() {
    if (modalNoteSingle) modalNoteSingle.style.display = 'none';
}

if (btnCloseNoteSingle) btnCloseNoteSingle.addEventListener('click', closeNoteSingleModal);
if (btnCancelNoteSingle) btnCancelNoteSingle.addEventListener('click', closeNoteSingleModal);

if (btnSaveNoteSingle) {
    btnSaveNoteSingle.addEventListener('click', async () => {
        const email = (inputNoteEmail.value || '').trim();
        if (!email) {
            showToast('warning', 'Mohon isi alamat email akun.');
            return;
        }

        const payload = {
            id: inputNoteId.value || undefined,
            email: email,
            ortu: (inputNoteOrtu.value || '').trim(),
            password: (inputNotePassword.value || '').trim(),
            status: inputNoteStatus.value || 'UNCHECKED',
            detail: (inputNoteDetail.value || '').trim()
        };

        try {
            const res = await fetch('/api/notes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.status === 'ok') {
                closeNoteSingleModal();
                showToast('success', 'Catatan akun berhasil disimpan.');
                await loadNotes();
            } else {
                showSwalAlert('error', 'Gagal Menyimpan', (data.message || 'Error'));
            }
        } catch (e) {
            showSwalAlert('error', 'Koneksi Gagal', 'Gagal menghubungi server: ' + e.message);
        }
    });
}

// ==========================================================================
// MODAL: IMPORT DARI RIWAYAT AKUN (DEFAULT MASUK KE UMUM)
// ==========================================================================
const modalImportHistory = document.getElementById('modal-import-history');
const btnCloseImportHistory = document.getElementById('btn-close-import-history');
const btnCancelImportHistory = document.getElementById('btn-cancel-import-history');
const btnConfirmImportHistory = document.getElementById('btn-confirm-import-history');
const inputImportOrtuTarget = document.getElementById('input-import-ortu-target');
const selectImportHistoryStatus = document.getElementById('select-import-history-status');

function openImportHistoryModal() {
    // Kumpulan email yang sudah ada di Catatan Akun saat ini
    const existingNoteEmails = new Set(notesList.map(n => (n.email || '').trim().toLowerCase()));

    // Total counts riwayat
    const cntAll = historyList.length;
    const cntClean = historyList.filter(h => h.status === 'CLEAN').length;
    const cntCaptcha = historyList.filter(h => h.status === 'CAPTCHA').length;
    const cntNotFound = historyList.filter(h => h.status === 'NOT_FOUND').length;
    const cntUnchecked = historyList.filter(h => h.status === 'UNCHECKED' || !h.status).length;

    // Filter akun riwayat yang BELUM MASUK ke catatan akun
    const notInNotes = historyList.filter(h => !existingNoteEmails.has((h.email || '').trim().toLowerCase()));
    const cntNotInNotes = notInNotes.length;
    const cntCleanNotInNotes = notInNotes.filter(h => h.status === 'CLEAN').length;

    const elAll = document.getElementById('import-count-all');
    const elClean = document.getElementById('import-count-clean');
    const elCaptcha = document.getElementById('import-count-captcha');
    const elNotFound = document.getElementById('import-count-notfound');
    const elUnchecked = document.getElementById('import-count-unchecked');
    const elNotInNotes = document.getElementById('import-count-not-in-notes');
    const elCleanNotInNotes = document.getElementById('import-count-clean-not-in-notes');

    if (elAll) elAll.textContent = cntAll;
    if (elClean) elClean.textContent = cntClean;
    if (elCaptcha) elCaptcha.textContent = cntCaptcha;
    if (elNotFound) elNotFound.textContent = cntNotFound;
    if (elUnchecked) elUnchecked.textContent = cntUnchecked;
    if (elNotInNotes) elNotInNotes.textContent = cntNotInNotes;
    if (elCleanNotInNotes) elCleanNotInNotes.textContent = cntCleanNotInNotes;

    // Default target: empty (Umum)
    if (inputImportOrtuTarget) {
        inputImportOrtuTarget.value = '';
    }

    if (modalImportHistory) modalImportHistory.style.display = 'flex';
}
window.openImportHistoryModal = openImportHistoryModal;

function closeImportHistoryModal() {
    if (modalImportHistory) modalImportHistory.style.display = 'none';
}

if (btnCloseImportHistory) btnCloseImportHistory.addEventListener('click', closeImportHistoryModal);
if (btnCancelImportHistory) btnCancelImportHistory.addEventListener('click', closeImportHistoryModal);

if (btnConfirmImportHistory) {
    btnConfirmImportHistory.addEventListener('click', async () => {
        const targetOrtu = (inputImportOrtuTarget ? inputImportOrtuTarget.value : '').trim();
        const filterStatus = selectImportHistoryStatus ? selectImportHistoryStatus.value : 'CLEAN';

        try {
            const res = await fetch('/api/notes/import-history', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    target_ortu: targetOrtu,
                    filter_status: filterStatus
                })
            });
            const data = await res.json();
            if (data.status === 'ok') {
                const destText = data.target_ortu ? `folder '${data.target_ortu}'` : 'daftar akun umum';
                showSwalAlert('success', 'Import Berhasil', data.message || `Berhasil mengimpor <strong>${data.imported_count}</strong> akun ke ${destText}!`);
                closeImportHistoryModal();
                await loadNotes();
                if (data.target_ortu) {
                    openFolder(data.target_ortu);
                }
            } else {
                showSwalAlert('error', 'Gagal Mengimpor', (data.detail || data.message || 'Error'));
            }
        } catch (e) {
            showSwalAlert('error', 'Koneksi Gagal', 'Gagal menghubungi server: ' + e.message);
        }
    });
}

// ==========================================================================
// MODAL: BATCH IMPORT CATATAN AKUN
// ==========================================================================
const modalNoteBatch = document.getElementById('modal-note-batch');
const btnCloseNoteBatch = document.getElementById('btn-close-note-batch');
const btnCancelNoteBatch = document.getElementById('btn-cancel-note-batch');
const btnSaveNoteBatch = document.getElementById('btn-save-note-batch');
const batchNoteDefaultOrtu = document.getElementById('batch-note-default-ortu');
const batchNoteInput = document.getElementById('batch-note-input');

function openBatchModal(prefillOrtu = '') {
    if (batchNoteDefaultOrtu) batchNoteDefaultOrtu.value = prefillOrtu || '';
    if (batchNoteInput) batchNoteInput.value = '';
    if (modalNoteBatch) modalNoteBatch.style.display = 'flex';
}
window.openBatchModal = openBatchModal;

function closeBatchModal() {
    if (modalNoteBatch) modalNoteBatch.style.display = 'none';
}

if (btnCloseNoteBatch) btnCloseNoteBatch.addEventListener('click', closeBatchModal);
if (btnCancelNoteBatch) btnCancelNoteBatch.addEventListener('click', closeBatchModal);

if (btnSaveNoteBatch) {
    btnSaveNoteBatch.addEventListener('click', async () => {
        const raw = (batchNoteInput.value || '').trim();
        if (!raw) {
            showToast('warning', 'Mohon tempel daftar akun terlebih dahulu.');
            return;
        }

        const payload = {
            raw_text: raw,
            default_ortu: (batchNoteDefaultOrtu.value || '').trim()
        };

        try {
            const res = await fetch('/api/notes/batch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.status === 'ok') {
                showSwalAlert('success', 'Import Berhasil', `Berhasil mengimpor <strong>${data.added_count}</strong> catatan akun!`);
                closeBatchModal();
                await loadNotes();
            } else {
                showSwalAlert('error', 'Gagal Mengimpor', (data.message || 'Error'));
            }
        } catch (e) {
            showSwalAlert('error', 'Gagal Import', e.message);
        }
    });
}

// ==========================================================================
// MODAL: BUAT FOLDER ORTU BARU
// ==========================================================================
const modalCreateFolder = document.getElementById('modal-create-folder');
const btnCloseCreateFolder = document.getElementById('btn-close-create-folder');
const btnCancelCreateFolder = document.getElementById('btn-cancel-create-folder');
const btnSaveCreateFolder = document.getElementById('btn-save-create-folder');
const inputNewFolderName = document.getElementById('input-new-folder-name');

function openCreateFolderModal() {
    if (inputNewFolderName) inputNewFolderName.value = '';
    if (modalCreateFolder) modalCreateFolder.style.display = 'flex';
}
window.openCreateFolderModal = openCreateFolderModal;

function closeCreateFolderModal() {
    if (modalCreateFolder) modalCreateFolder.style.display = 'none';
}

if (btnCloseCreateFolder) btnCloseCreateFolder.addEventListener('click', closeCreateFolderModal);
if (btnCancelCreateFolder) btnCancelCreateFolder.addEventListener('click', closeCreateFolderModal);

if (btnSaveCreateFolder) {
    btnSaveCreateFolder.addEventListener('click', async () => {
        const name = (inputNewFolderName.value || '').trim();
        if (!name) {
            showToast('warning', 'Nama folder tidak boleh kosong.');
            return;
        }

        try {
            const res = await fetch('/api/notes/folder', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name })
            });
            const data = await res.json();
            if (data.status === 'ok') {
                closeCreateFolderModal();
                showToast('success', `Folder '${name}' berhasil dibuat.`);
                await loadNotes();
                openFolder(name);
            } else {
                showSwalAlert('error', 'Gagal Membuat Folder', (data.detail || 'Error'));
            }
        } catch (e) {
            showSwalAlert('error', 'Gagal', e.message);
        }
    });
}

// Rename Folder
async function renameFolder(oldName) {
    if (!oldName) return;

    let newName = null;
    if (typeof Swal !== 'undefined') {
        const result = await Swal.fire({
            title: 'Ubah Nama Folder',
            html: `Masukkan nama baru untuk folder <strong>"${escapeHtml(oldName)}"</strong>:`,
            input: 'text',
            inputValue: oldName,
            inputPlaceholder: 'Nama folder baru...',
            showCancelButton: true,
            confirmButtonText: 'Simpan',
            cancelButtonText: 'Batal',
            reverseButtons: true,
            customClass: {
                popup: 'swal-custom-popup',
                confirmButton: 'btn-tool-primary'
            },
            inputValidator: (val) => {
                const trimmed = (val || '').trim();
                if (!trimmed) {
                    return 'Nama folder tidak boleh kosong!';
                }
                if (trimmed.toLowerCase() === oldName.trim().toLowerCase()) {
                    return 'Nama folder baru harus berbeda dari nama saat ini!';
                }
            }
        });

        if (result.isConfirmed && result.value) {
            newName = result.value.trim();
        }
    } else {
        const promptVal = prompt(`Ubah nama folder "${oldName}":`, oldName);
        if (promptVal && promptVal.trim() && promptVal.trim().toLowerCase() !== oldName.trim().toLowerCase()) {
            newName = promptVal.trim();
        }
    }

    if (!newName) return;

    try {
        const res = await fetch('/api/notes/folder/rename', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                old_name: oldName,
                new_name: newName
            })
        });
        const data = await res.json();
        if (res.ok && data.status === 'ok') {
            showToast('success', `Folder diubah menjadi '${newName}'.`);
            if (activeFolder && activeFolder.trim().toLowerCase() === oldName.trim().toLowerCase()) {
                activeFolder = newName;
            }
            await loadNotes();
        } else {
            showSwalAlert('error', 'Gagal Mengubah Nama Folder', data.detail || data.message || 'Terjadi kesalahan');
        }
    } catch (e) {
        showSwalAlert('error', 'Gagal Mengubah Nama Folder', e.message);
    }
}
window.renameFolder = renameFolder;

// Delete Folder (Dukung withHistory)
async function deleteFolder(folderName, withHistory = false) {
    if (!folderName) return;

    // Jika dipanggil dari tombol 'Hapus Folder + Riwayat'
    if (withHistory) {
        const confirmed = await showSwalConfirm(
            'Hapus Folder + Riwayat?',
            `Apakah Anda yakin ingin menghapus folder <strong>"${escapeHtml(folderName)}"</strong> beserta <strong>seluruh catatan akun dan riwayat pengecekannya</strong>?<br><small style="color:#ef4444">Semua email dalam folder ini juga akan dibersihkan dari tab Riwayat Pengecekan.</small>`,
            'Ya, Hapus Folder & Riwayat',
            true
        );
        if (!confirmed) return;

        try {
            const res = await fetch(`/api/notes?folder=${encodeURIComponent(folderName)}&delete_history=true`, { method: 'DELETE' });
            const data = await res.json();
            showToast('success', data.message || `Folder ${folderName} beserta riwayat berhasil dihapus.`);
            if (activeFolder === folderName) {
                closeFolder();
            }
            await loadNotes();
            if (typeof loadHistory === 'function') {
                await loadHistory();
            }
        } catch (e) {
            showSwalAlert('error', 'Gagal Menghapus Folder', e.message);
        }
        return;
    }

    // Default confirm jika dipanggil dari tombol 'Hapus Folder' biasa:
    // Tampilkan modal konfirmasi dengan opsi checkbox untuk sekaligus menghapus riwayat
    if (typeof Swal !== 'undefined') {
        const result = await Swal.fire({
            title: 'Hapus Folder?',
            html: `
                <div style="text-align: left; font-size: 14px; color: #cbd5e1; line-height: 1.5;">
                    <p>Apakah Anda yakin ingin menghapus folder <strong>"${escapeHtml(folderName)}"</strong> beserta seluruh akun di dalamnya?</p>
                    <div style="margin-top: 15px; padding: 10px 12px; background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); border-radius: 8px;">
                        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; color: #fca5a5; font-size: 13px; font-weight: 500;">
                            <input type="checkbox" id="swal-cb-del-history" style="cursor: pointer; width: 16px; height: 16px;">
                            <span>Hapus juga riwayat pengecekan akun di folder ini dari tab Riwayat</span>
                        </label>
                    </div>
                </div>
            `,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Ya, Hapus Folder',
            cancelButtonText: 'Batal',
            confirmButtonColor: '#ef4444',
            cancelButtonColor: '#334155',
            background: '#1e293b',
            color: '#f8fafc',
            focusCancel: true,
            preConfirm: () => {
                const cb = document.getElementById('swal-cb-del-history');
                return { deleteHistory: cb ? cb.checked : false };
            }
        });

        if (!result.isConfirmed) return;
        const delHistory = result.value ? result.value.deleteHistory : false;

        try {
            const url = `/api/notes?folder=${encodeURIComponent(folderName)}${delHistory ? '&delete_history=true' : ''}`;
            const res = await fetch(url, { method: 'DELETE' });
            const data = await res.json();
            showToast('success', data.message || `Folder ${folderName} berhasil dihapus.`);
            if (activeFolder === folderName) {
                closeFolder();
            }
            await loadNotes();
            if (delHistory && typeof loadHistory === 'function') {
                await loadHistory();
            }
        } catch (e) {
            showSwalAlert('error', 'Gagal Menghapus Folder', e.message);
        }
    } else {
        const confirmed = confirm(`Hapus folder "${folderName}"?`);
        if (!confirmed) return;
        try {
            const res = await fetch(`/api/notes?folder=${encodeURIComponent(folderName)}`, { method: 'DELETE' });
            await loadNotes();
        } catch (e) {}
    }
}
window.deleteFolder = deleteFolder;

// Delete Single Note
async function deleteSingleNote(noteId, email, withHistory = false) {
    const confirmed = await showSwalConfirm(
        'Hapus Catatan Akun?',
        `Hapus akun <strong>"${email}"</strong> dari catatan?`,
        'Ya, Hapus',
        true
    );
    if (!confirmed) return;

    try {
        const res = await fetch(`/api/notes?id=${encodeURIComponent(noteId)}`, { method: 'DELETE' });
        showToast('success', `Akun ${email} dihapus dari catatan.`);
        await loadNotes();
    } catch (e) {
        showSwalAlert('error', 'Gagal Menghapus', e.message);
    }
}
window.deleteSingleNote = deleteSingleNote;

// Clear All Notes (Dukung withHistory)
async function clearAllNotes(withHistory = false) {
    if (withHistory) {
        const confirmed = await showSwalConfirm(
            'Hapus Semua Catatan + Riwayat?',
            'Apakah Anda yakin ingin menghapus <strong>SELURUH catatan akun, semua folder, DAN SELURUH riwayat pengecekan</strong>?<br><small style="color:#ef4444">Semua data akan dibersihkan secara total dan permanen.</small>',
            'Ya, Hapus Bersih Total',
            true
        );
        if (!confirmed) return;

        try {
            const res = await fetch('/api/notes?clear_all=true&delete_history=true', { method: 'DELETE' });
            const data = await res.json();
            showToast('success', data.message || 'Semua catatan dan riwayat berhasil dibersihkan.');
            activeFolder = null;
            closeFolder();
            await loadNotes();
            if (typeof loadHistory === 'function') {
                await loadHistory();
            }
        } catch (e) {
            showSwalAlert('error', 'Gagal Menghapus', e.message);
        }
        return;
    }

    const confirmed = await showSwalConfirm(
        'Hapus Semua Catatan Akun?',
        'Apakah Anda yakin ingin menghapus <strong>SELURUH catatan akun dan semua folder</strong>?<br><small style="color:#ef4444">Data yang terhapus tidak dapat dipulihkan kembali.</small>',
        'Ya, Hapus Seluruhnya',
        true
    );
    if (!confirmed) return;

    try {
        const res = await fetch('/api/notes?clear_all=true', { method: 'DELETE' });
        const data = await res.json();
        showToast('success', data.message || 'Semua catatan berhasil dihapus.');
        activeFolder = null;
        closeFolder();
        await loadNotes();
    } catch (e) {
        showSwalAlert('error', 'Gagal Menghapus', e.message);
    }
}
window.clearAllNotes = clearAllNotes;

// Export Notes Modal
const modalNoteExport = document.getElementById('modal-note-export');
const btnCloseNoteExport = document.getElementById('btn-close-note-export');
const btnCancelNoteExport = document.getElementById('btn-cancel-note-export');
const btnConfirmNoteExport = document.getElementById('btn-confirm-note-export');
const exportNoteFolderSelect = document.getElementById('export-note-folder-select');
const exportNoteStatusSelect = document.getElementById('export-note-status-select');

function openExportNotesModal() {
    if (modalNoteExport) modalNoteExport.style.display = 'flex';
}
window.openExportNotesModal = openExportNotesModal;

function closeExportNotesModal() {
    if (modalNoteExport) modalNoteExport.style.display = 'none';
}

if (btnCloseNoteExport) btnCloseNoteExport.addEventListener('click', closeExportNotesModal);
if (btnCancelNoteExport) btnCancelNoteExport.addEventListener('click', closeExportNotesModal);

if (btnConfirmNoteExport) {
    btnConfirmNoteExport.addEventListener('click', () => {
        const folder = exportNoteFolderSelect ? exportNoteFolderSelect.value : 'ALL';
        const status = exportNoteStatusSelect ? exportNoteStatusSelect.value : 'ALL';
        const fmtRadio = document.querySelector('input[name="export-note-format"]:checked');
        const format = fmtRadio ? fmtRadio.value : 'txt_combo';

        let url = `/api/notes/export?filter_status=${status}&format=${format}`;
        if (folder !== 'ALL') {
            url += `&folder=${encodeURIComponent(folder)}`;
        }
        window.location.href = url;
        closeExportNotesModal();
    });
}

// Initialize on page load
window.addEventListener('DOMContentLoaded', () => {
    initWebSocket();
    loadHistory();
    loadNotes();
    emailInput.value = '';
    updateInputMeta();
});


    // Manual Backup Button in Notes
    const btnTopBackupNotes = document.getElementById('btn-top-backup-notes');
    if (btnTopBackupNotes) {
        btnTopBackupNotes.addEventListener('click', async () => {
            try {
                btnTopBackupNotes.disabled = true;
                btnTopBackupNotes.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Menyimpan...';
                const res = await fetch('/api/backup', { method: 'POST' });
                const resData = await res.json();
                if (res.ok) {
                    Swal.fire({
                        title: 'Backup Berhasil!',
                        text: resData.message || 'Catatan & riwayat berhasil dicadangkan ke folder backups (otomatis tersimpan selama 3 hari).',
                        icon: 'success',
                        confirmButtonText: 'Sip, Mantap',
                        confirmButtonColor: '#3b82f6'
                    });
                } else {
                    Swal.fire('Gagal Backup', resData.detail || 'Terjadi kesalahan saat membuat backup.', 'error');
                }
            } catch (err) {
                Swal.fire('Error', 'Gagal menghubungi server untuk membuat backup: ' + err.message, 'error');
            } finally {
                btnTopBackupNotes.disabled = false;
                btnTopBackupNotes.innerHTML = `
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
                    Backup Sekarang
                `;
            }
        });
    }
