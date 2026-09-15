// Mail Checker by Umam - Client Logic
let allResults = [];
let historyList = [];
let currentFilter = 'ALL';
let historyFilter = 'ALL';
let isRunning = false;
let ws = null;

// DOM Navigation
const tabNavChecker = document.getElementById('tab-nav-checker');
const tabNavHistory = document.getElementById('tab-nav-history');
const viewChecker = document.getElementById('view-checker');
const viewHistory = document.getElementById('view-history');
const navHistoryCount = document.getElementById('nav-history-count');

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
tabNavChecker.addEventListener('click', () => {
    tabNavChecker.classList.add('active');
    tabNavHistory.classList.remove('active');
    viewChecker.style.display = 'grid';
    viewHistory.style.display = 'none';
});

tabNavHistory.addEventListener('click', () => {
    tabNavHistory.classList.add('active');
    tabNavChecker.classList.remove('active');
    viewChecker.style.display = 'none';
    viewHistory.style.display = 'flex';
    loadHistory();
});

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
        alert('Tidak ada username atau email yang terdeteksi.');
        return;
    }
    emailInput.value = emails.join('\n');
    updateInputMeta();
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
        alert('Masukkan atau tempel daftar email terlebih dahulu!');
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
            alert(data.detail || 'Gagal memulai pengecekan');
            return;
        }

        // Auto-clear input area as requested:
        emailInput.value = '';
        updateInputMeta();

    } catch (err) {
        alert('Gagal menghubungi server: ' + err.message);
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

    tr.innerHTML = `
        <td class="col-no">${num}</td>
        <td class="col-email">${escapeHtml(item.email)}</td>
        <td class="col-status"><span class="badge-tag ${badgeClass}">${badgeText}</span></td>
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
        alert(`Tidak ada email (${currentFilter}) untuk disalin.`);
        return;
    }

    const textToCopy = filtered.map(i => i.email).join('\n');
    await navigator.clipboard.writeText(textToCopy);
    alert(`Berhasil menyalin ${filtered.length} email (${currentFilter}) ke clipboard!`);
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
        alert('Tidak ada email berstatus CAPTCHA di riwayat tersimpan.');
        return;
    }
    if (!confirm(`Hapus ${captchaCount} email berstatus CAPTCHA dari riwayat tersimpan?\n\nEmail CLEAN dan status lainnya tidak akan dihapus.`)) {
        return;
    }

    try {
        const res = await fetch('/api/history?status=CAPTCHA', { method: 'DELETE' });
        const data = await res.json();
        alert(data.message || `Berhasil menghapus ${captchaCount} email Captcha.`);
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
        alert('Gagal menghapus riwayat Captcha: ' + e.message);
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
    if (!confirm(`Hapus email "${email}" dari riwayat tersimpan?`)) return;
    try {
        const res = await fetch(`/api/history?email=${encodeURIComponent(email)}`, { method: 'DELETE' });
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
        alert('Gagal menghapus email: ' + e.message);
    }
}
window.deleteSingleHistoryItem = deleteSingleHistoryItem;

// Clear Semua History
btnClearHistory.addEventListener('click', async () => {
    if (!confirm('Apakah Anda yakin ingin menghapus seluruh riwayat akun tersimpan? Data ini tidak dapat dikembalikan.')) {
        return;
    }

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
        alert('Seluruh riwayat akun berhasil dibersihkan.');
    } catch (e) {
        alert('Gagal menghapus riwayat: ' + e.message);
    }
});

// Initialize on page load
window.addEventListener('DOMContentLoaded', () => {
    initWebSocket();
    loadHistory();
    emailInput.value = '';
    updateInputMeta();
});
