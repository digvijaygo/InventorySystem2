/* ============================================================
   sharewithCA.js — Controller for the Share with CA page
   Exposes window.initShareWithCAPage() consumed by app.js
   ============================================================ */
(function () {
  'use strict';

  const API_BASE = '/api/ca';
  const LOCATIONS = [
    'Arneel Industries Karodi',
    'Anil Industries Karodi',
    'Anil Industries Ghanegoan',
    'Anil Industries Yavatmal',
    'Kpr Projections',
  ];

  // ---------- Tiny Toast ----------
  let toastEl = null;
  let toastTimer = null;
  function toast(message, type = 'success') {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'swc-toast';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = message;
    toastEl.classList.toggle('swc-toast-error', type === 'error');
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2800);
  }

  // ---------- DOM helpers ----------
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // ---------- Root scoping ----------
  function rootEl() {
    return document.querySelector('.page-view[data-page="sharewithCA"]');
  }

  async function api(path, options = {}) {
    const response = await fetch(`${API_BASE}${path}`, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options,
    });
    if (!response.ok) {
      const message = await response.text().catch(() => '');
      throw new Error(message || `Request failed (${response.status})`);
    }
    const contentType = response.headers.get('content-type') || '';
    return contentType.includes('application/json') ? response.json() : response.text();
  }

  // ---------- Init ----------
  function init() {
    const root = rootEl();
    if (!root) {
      console.warn('[sharewithCA] root .page-view not found');
      return;
    }

    // Default date range: 1st of current month → today
    const today = new Date();
    const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const toISO = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

    const startEl = $('#startDate', root);
    const endEl   = $('#endDate', root);
    if (startEl && !startEl.value) startEl.value = toISO(firstOfMonth);
    if (endEl   && !endEl.value)   endEl.value   = toISO(today);

    loadConfig(root);
    $('#caConfigForm', root)?.addEventListener('submit', (event) => {
      event.preventDefault();
      saveConfig(root);
    });

    const options = $('#locationOptions', root);
    const allLocations = $('#selectAllLocations', root);
    const locationChecks = () => $$('input[type="checkbox"][value]', options);
    const syncLocationSelection = () => {
      const selected = locationChecks().filter((checkbox) => checkbox.checked).length;
      allLocations.checked = selected === LOCATIONS.length;
      allLocations.indeterminate = selected > 0 && selected < LOCATIONS.length;
      $('#locationSelectLabel', root).textContent = selected === LOCATIONS.length
        ? 'All locations'
        : selected === 1
          ? locationChecks().find((checkbox) => checkbox.checked).value
          : `${selected} locations selected`;
    };

    allLocations?.addEventListener('change', () => {
      locationChecks().forEach((checkbox) => { checkbox.checked = allLocations.checked; });
      syncLocationSelection();
    });
    options?.addEventListener('change', (event) => {
      if (event.target.matches('input[type="checkbox"][value]')) syncLocationSelection();
    });
    syncLocationSelection();

    $('#downloadZipBtn', root)?.addEventListener('click', () => handleZip(root));
  }

  function readForm(root) {
    return {
      caName: ($('#caName', root)?.value || '').trim(),
      caEmail: ($('#caEmail', root)?.value || '').trim(),
      caPhone: ($('#caPhone', root)?.value || '').trim(),
      caFirm: ($('#caFirm', root)?.value || '').trim(),
    };
  }

  function writeForm(root, config) {
    if (!config) return;
    if (config.caName != null) $('#caName', root).value = config.caName;
    if (config.caEmail != null) $('#caEmail', root).value = config.caEmail;
    if (config.caPhone != null) $('#caPhone', root).value = config.caPhone;
    if (config.caFirm != null) $('#caFirm', root).value = config.caFirm;
  }

  async function loadConfig(root) {
    try {
      const config = await api('/config', { method: 'GET' });
      writeForm(root, config);
    } catch (error) {
      console.info('[sharewithCA] No saved CA config yet:', error.message);
    }
  }

  async function saveConfig(root) {
    const config = readForm(root);
    if (!config.caName) {
      toast('Please enter the CA Name', 'error');
      $('#caName', root)?.focus();
      return;
    }
    if (config.caEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(config.caEmail)) {
      toast('Please enter a valid CA email', 'error');
      $('#caEmail', root)?.focus();
      return;
    }

    try {
      await api('/config', {
        method: 'POST',
        body: JSON.stringify({ ...config, autoShareReminder: false }),
      });
      toast('CA contact configuration saved');
      $$('.swc-input-wrap input', root).forEach((input) => {
        input.classList.add('swc-ok');
        setTimeout(() => input.classList.remove('swc-ok'), 1600);
      });
    } catch (error) {
      console.error('[sharewithCA] saveConfig failed', error);
      toast('Failed to save configuration: ' + error.message, 'error');
    }
  }

  // ---------- Gather selection ----------
  function readSelection(root) {
    const start = $('#startDate', root)?.value || '';
    const end   = $('#endDate',   root)?.value || '';
    const docs  = $$('#docTypesGroup input[type="checkbox"]:checked', root)
                    .map((cb) => cb.value);
    const locations = $$('#locationOptions input[type="checkbox"][value]:checked', root)
      .map((checkbox) => checkbox.value);
    return { start, end, docs, locations };
  }

  function validateSelection(sel) {
    if (!sel.start || !sel.end) {
      toast('Please select a start and end date', 'error');
      return false;
    }
    if (new Date(sel.start) > new Date(sel.end)) {
      toast('Start date must be before end date', 'error');
      return false;
    }
    if (!sel.docs.length) {
      toast('Please select at least one report', 'error');
      return false;
    }
    if (!sel.locations.length) {
      toast('Please select at least one location', 'error');
      return false;
    }
    return true;
  }

  // ---------- Handlers ----------
  async function handleZip(root) {
    const sel = readSelection(root);
    if (!validateSelection(sel)) return;

    try {
      // Stream as blob
      const res = await fetch(`${API_BASE}/share/zip`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sel),
      });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);

      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url;
      a.download = `CA_Package_${sel.start}_to_${sel.end}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      toast(`ZIP package downloaded (${sel.docs.length} reports)`);
    } catch (err) {
      console.error('[sharewithCA] handleZip failed', err);
      toast('ZIP download failed: ' + err.message, 'error');
    }
  }

  // ---------- Expose to app.js ----------
  window.initShareWithCAPage = init;

  // Auto-init if the page-view is already in the DOM (dev / refresh case)
  if (document.readyState !== 'loading') {
    if (rootEl()) init();
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      if (rootEl()) init();
    });
  }
})();