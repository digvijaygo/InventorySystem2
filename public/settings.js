/* =========================================================
   InventorySystem2 — Settings page controller
   Currently supports the Backup tab only.
   Scoped to #is2-settings, SPA-friendly (idempotent)
   ========================================================= */
(function () {
  'use strict';

  const API_BASE = '/api';
  const BACKUP_API = `${API_BASE}/backup`;

  let settingsState = { initialized: false };

  function initSettings() {
    try {
      const root = document.getElementById('is2-settings');
      if (!root) {
        console.warn('[settings.js] #is2-settings not found');
        return;
      }
      if (settingsState.initialized) return;
      settingsState.initialized = true;

      /* ============ ELEMENT REFERENCES ============ */
      const downloadBtn         = document.getElementById('downloadBackupBtn');
      const downloadStatus      = document.getElementById('downloadBackupStatus');

      const autoEnabledSwitch   = document.getElementById('autoBackupEnabled');
      const autoFolderInput     = document.getElementById('autoBackupFolder');
      const chooseFolderBtn     = document.getElementById('chooseFolderBtn');
      const autoFrequencySelect = document.getElementById('autoBackupFrequency');
      const autoKeepInput       = document.getElementById('autoBackupKeep');
      const autoLastSaved       = document.getElementById('autoBackupLastSaved');
      const backupNowBtn        = document.getElementById('backupNowBtn');

      // Schedule wrappers + inputs
      const dailyWrapper        = document.getElementById('autoBackupDailyWrapper');
      const weeklyWrapper       = document.getElementById('autoBackupWeeklyWrapper');
      const monthlyWrapper      = document.getElementById('autoBackupMonthlyWrapper');

      const autoTimeInput       = document.getElementById('autoBackupTime');        // daily
      const autoDayOfWeek       = document.getElementById('autoBackupDayOfWeek');   // weekly
      const autoWeekTime        = document.getElementById('autoBackupWeekTime');    // weekly
      const autoDayOfMonth      = document.getElementById('autoBackupDayOfMonth');  // monthly
      const autoMonthTime       = document.getElementById('autoBackupMonthTime');   // monthly

      const restoreFileInput    = document.getElementById('restoreFileInput');
      const restoreFilePreview  = document.getElementById('restoreFilePreview');
      const restoreFileName     = document.getElementById('restoreFileName');
      const restoreFileSize     = document.getElementById('restoreFileSize');
      const clearRestoreFileBtn = document.getElementById('clearRestoreFileBtn');
      const restoreBtn          = document.getElementById('restoreBackupBtn');
      const restoreStatus       = document.getElementById('restoreBackupStatus');

      let selectedRestoreFile = null;

      /* ============ UTILITIES ============ */
      function setStatus(el, text, kind /* 'ok' | 'err' | 'info' */) {
        if (!el) return;
        el.textContent = text || '';
        el.classList.remove('ok', 'err', 'info');
        if (kind) el.classList.add(kind);
      }
      function formatDateTime(iso) {
        if (!iso) return 'Never';
        try {
          const d = new Date(iso);
          if (Number.isNaN(d.getTime())) return String(iso);
          return d.toLocaleString('en-IN', {
            day: '2-digit', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
          });
        } catch (_e) { return String(iso); }
      }
      function formatBytes(bytes) {
        if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB'];
        let i = 0, n = bytes;
        while (n >= 1024 && i < units.length - 1) { n /= 1024; i += 1; }
        return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
      }
      async function apiJson(url, options = {}) {
        const res = await fetch(url, {
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
          ...options
        });
        const text = await res.text();
        let payload = null;
        try { payload = text ? JSON.parse(text) : null; } catch (_e) { payload = text; }
        if (!res.ok) {
          const msg = payload && payload.error ? payload.error : `Request failed (${res.status})`;
          throw new Error(msg);
        }
        return payload;
      }

      /* ============ SCHEDULE UI HELPERS ============ */
      // Show only the wrapper that matches the chosen frequency.
      function applyFrequencyVisibility(freq) {
        dailyWrapper.style.display   = freq === 'daily'   ? 'inline-flex' : 'none';
        weeklyWrapper.style.display  = freq === 'weekly'  ? 'inline-flex' : 'none';
        monthlyWrapper.style.display = freq === 'monthly' ? 'inline-flex' : 'none';
      }

      // Read the current schedule from the form into a normalized object.
      function readScheduleFromForm() {
        const freq = autoFrequencySelect.value || 'daily';
        const schedule = { frequency: freq, time: '23:00' };

        if (freq === 'daily') {
          schedule.time = autoTimeInput.value || '23:00';
        } else if (freq === 'weekly') {
          schedule.time      = autoWeekTime.value || '23:00';
          schedule.dayOfWeek = Number(autoDayOfWeek.value); // 0–6 (Sun–Sat)
        } else if (freq === 'monthly') {
          schedule.time       = autoMonthTime.value || '23:00';
          schedule.dayOfMonth = Number(autoDayOfMonth.value); // 1–31
        }
        return schedule;
      }

      // Fill the form fields from a server config object.
      function writeScheduleToForm(cfg) {
        const freq = (cfg && cfg.frequency) || 'daily';
        autoFrequencySelect.value = freq;
        applyFrequencyVisibility(freq);

        if (freq === 'daily') {
          autoTimeInput.value = (cfg && cfg.time) || '23:00';
        } else if (freq === 'weekly') {
          autoWeekTime.value   = (cfg && cfg.time) || '23:00';
          autoDayOfWeek.value  = String(
            cfg && cfg.dayOfWeek !== undefined && cfg.dayOfWeek !== null
              ? Number(cfg.dayOfWeek)
              : 1
          );
        } else if (freq === 'monthly') {
          autoMonthTime.value   = (cfg && cfg.time) || '23:00';
          autoDayOfMonth.value  = String(
            cfg && cfg.dayOfMonth !== undefined && cfg.dayOfMonth !== null
              ? Math.min(31, Math.max(1, Number(cfg.dayOfMonth)))
              : 1
          );
        }
      }

      /* ============ 1. BACKUP TO COMPUTER ============ */
      async function downloadBackup() {
        setStatus(downloadStatus, 'Preparing backup…', 'info');
        downloadBtn.disabled = true;
        try {
          const res = await fetch(`${BACKUP_API}/download`, {
            credentials: 'same-origin'
          });
          if (!res.ok) {
            const payload = await res.json().catch(() => ({}));
            throw new Error(payload.error || `Download failed (${res.status})`);
          }
          const blob = await res.blob();

          // Filename from header if server sends it, else default
          const cd = res.headers.get('content-disposition') || '';
          const match = /filename="?([^"]+)"?/i.exec(cd);
          const filename = match ? match[1] : `inventorysystem2-backup-${Date.now()}.sqlite`;

          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);

          setStatus(downloadStatus, `Saved ${filename}`, 'ok');
        } catch (err) {
          console.error('[settings] downloadBackup failed:', err);
          setStatus(downloadStatus, err.message || 'Unable to download backup.', 'err');
        } finally {
          downloadBtn.disabled = false;
        }
      }

      /* ============ 2. AUTOMATIC BACKUP ============ */
      async function loadAutoBackupConfig() {
        try {
          const cfg = await apiJson(`${BACKUP_API}/auto-config`, { method: 'GET' });
          if (!cfg) return;
          autoEnabledSwitch.checked = !!cfg.enabled;
          autoFolderInput.value     = cfg.folder || '';
          autoKeepInput.value       = Number(cfg.keep) > 0 ? Number(cfg.keep) : 7;
          writeScheduleToForm(cfg);
          autoLastSaved.textContent = formatDateTime(cfg.lastSaved);
        } catch (err) {
          console.warn('[settings] loadAutoBackupConfig:', err.message);
        }
      }
      async function saveAutoBackupConfig(extra = {}) {
        const schedule = readScheduleFromForm();
        const payload = {
          enabled: !!autoEnabledSwitch.checked,
          folder:  autoFolderInput.value || '',
          keep:    Math.max(1, Math.min(100, Number(autoKeepInput.value) || 7)),
          // schedule fields
          frequency:  schedule.frequency,
          time:       schedule.time,
          dayOfWeek:  schedule.dayOfWeek,
          dayOfMonth: schedule.dayOfMonth,
          ...extra
        };
        return apiJson(`${BACKUP_API}/auto-config`, {
          method: 'POST',
          body: JSON.stringify(payload)
        });
      }

      // "Choose Folder" — uses the File System Access API when available.
      // Falls back to asking the user to type/paste a path.
      async function chooseFolder() {
        try {
          if (window.showDirectoryPicker) {
            const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
            // We can only capture the folder *name*; the server needs the absolute path.
            // File System Access doesn't expose the full path for security reasons,
            // so we ask the user to confirm/paste the absolute path.
            const suggestion = dirHandle && dirHandle.name ? dirHandle.name : '';
            const entered = window.prompt(
              'Enter the absolute folder path where backups should be saved.\n' +
              'Example: C:\\Users\\YourName\\Documents\\InventoryBackups',
              autoFolderInput.value || suggestion || ''
            );
            if (entered === null) return;
            const trimmed = String(entered).trim();
            if (!trimmed) return;
            autoFolderInput.value = trimmed;
            await saveAutoBackupConfig();
            setStatus(downloadStatus, 'Folder saved.', 'ok');
            return;
          }
          const entered = window.prompt(
            'Enter the absolute folder path where backups should be saved.\n' +
            'Example: C:\\Users\\YourName\\Documents\\InventoryBackups',
            autoFolderInput.value || ''
          );
          if (entered === null) return;
          const trimmed = String(entered).trim();
          if (!trimmed) return;
          autoFolderInput.value = trimmed;
          await saveAutoBackupConfig();
          setStatus(downloadStatus, 'Folder saved.', 'ok');
        } catch (err) {
          if (err && err.name === 'AbortError') return;
          console.error('[settings] chooseFolder failed:', err);
          setStatus(downloadStatus, err.message || 'Unable to choose folder.', 'err');
        }
      }

      async function backupNow() {
        backupNowBtn.disabled = true;
        const prev = autoLastSaved.textContent;
        autoLastSaved.textContent = 'Saving…';
        try {
          const result = await apiJson(`${BACKUP_API}/auto-now`, { method: 'POST' });
          autoLastSaved.textContent = formatDateTime(result.lastSaved);
          setStatus(downloadStatus, result.message || 'Backup saved to folder.', 'ok');
        } catch (err) {
          console.error('[settings] backupNow failed:', err);
          autoLastSaved.textContent = prev;
          setStatus(downloadStatus, err.message || 'Unable to save backup.', 'err');
        } finally {
          backupNowBtn.disabled = false;
        }
      }

      /* ============ 3. RESTORE FROM BACKUP ============ */
      function renderRestorePreview() {
        if (!selectedRestoreFile) {
          restoreFilePreview.hidden = true;
          restoreFileName.textContent = '';
          restoreFileSize.textContent = '';
          restoreBtn.disabled = true;
          return;
        }
        restoreFilePreview.hidden = false;
        restoreFileName.textContent = selectedRestoreFile.name;
        restoreFileSize.textContent = formatBytes(selectedRestoreFile.size);
        restoreBtn.disabled = false;
      }

      function handleRestoreFilePick(event) {
        const file = event.target.files && event.target.files[0];
        if (!file) return;
        if (!/\.sqlite$/i.test(file.name)) {
          setStatus(restoreStatus, 'Please choose a .sqlite backup file.', 'err');
          selectedRestoreFile = null;
          renderRestorePreview();
          return;
        }
        selectedRestoreFile = file;
        setStatus(restoreStatus, '', '');
        renderRestorePreview();
      }

      async function performRestore() {
        if (!selectedRestoreFile) return;

        const confirmed = window.confirm(
          'This will overwrite all current data with the contents of the backup file.\n\n' +
          'Anything entered since that backup was taken will be lost. This cannot be undone.\n\n' +
          'Do you want to continue?'
        );
        if (!confirmed) return;

        restoreBtn.disabled = true;
        setStatus(restoreStatus, 'Restoring… please wait.', 'info');

        try {
          // Send the file as multipart/form-data so the server can stream it.
          const form = new FormData();
          form.append('backup', selectedRestoreFile, selectedRestoreFile.name);

          const res = await fetch(`${BACKUP_API}/restore`, {
            method: 'POST',
            credentials: 'same-origin',
            body: form
          });
          const payload = await res.json().catch(() => ({}));
          if (!res.ok) {
            throw new Error(payload.error || `Restore failed (${res.status})`);
          }

          setStatus(restoreStatus, payload.message || 'Restore complete. Reloading…', 'ok');

          // Give the user a moment to read the message, then reload.
          setTimeout(() => window.location.reload(), 1200);
        } catch (err) {
          console.error('[settings] performRestore failed:', err);
          setStatus(restoreStatus, err.message || 'Unable to restore backup.', 'err');
          restoreBtn.disabled = false;
        }
      }

      /* ============ EVENT WIRING ============ */
      downloadBtn.addEventListener('click', downloadBackup);

      chooseFolderBtn.addEventListener('click', chooseFolder);
      backupNowBtn.addEventListener('click', backupNow);

      // When frequency changes, swap the visible schedule controls and persist.
      autoFrequencySelect.addEventListener('change', async () => {
        applyFrequencyVisibility(autoFrequencySelect.value);
        try { await saveAutoBackupConfig(); }
        catch (err) { console.warn('[settings] auto-save failed:', err.message); }
      });

      // Persist on any schedule change
      [
        autoEnabledSwitch,
        autoKeepInput,
        autoTimeInput,
        autoDayOfWeek,
        autoWeekTime,
        autoDayOfMonth,
        autoMonthTime
      ].forEach((el) => {
        el.addEventListener('change', async () => {
          try { await saveAutoBackupConfig(); }
          catch (err) { console.warn('[settings] auto-save failed:', err.message); }
        });
      });

      restoreFileInput.addEventListener('change', handleRestoreFilePick);
      clearRestoreFileBtn.addEventListener('click', () => {
        selectedRestoreFile = null;
        restoreFileInput.value = '';
        setStatus(restoreStatus, '', '');
        renderRestorePreview();
      });
      restoreBtn.addEventListener('click', performRestore);

      /* ============ TABS (only Backup for now) ============ */
      root.querySelectorAll('.settings-tab').forEach((tab) => {
        tab.addEventListener('click', () => {
          root.querySelectorAll('.settings-tab').forEach((t) => {
            const active = t === tab;
            t.classList.toggle('active', active);
            t.setAttribute('aria-selected', String(active));
          });
          const target = tab.dataset.tab;
          root.querySelectorAll('.settings-panel').forEach((panel) => {
            panel.style.display = panel.dataset.panel === target ? '' : 'none';
          });
        });
      });

      /* ============ INIT ============ */
      (async function initializePage() {
        try {
          // Default visibility before config loads
          applyFrequencyVisibility(autoFrequencySelect.value || 'daily');
          await loadAutoBackupConfig();
        } catch (err) {
          console.warn('[settings] init failed:', err.message);
        }
      })();

      settingsState.refresh = async function () {
        try {
          await loadAutoBackupConfig();
        } catch (err) {
          console.warn('[settings] refresh failed:', err.message);
        }
      };

    } catch (err) {
      console.error('[settings.js] initSettings failed:', err);
    }
  }

  window.initSettingsPage = function () {
    if (!settingsState.initialized) { initSettings(); return; }
    if (typeof settingsState.refresh === 'function') { settingsState.refresh(); return; }
    settingsState.initialized = false;
    initSettings();
  };
})();