/* ============================================================
   InventorySystem2 – Contractors page (3 tabs)
============================================================ */
const CONTRACTOR_API_URL      = '/api/contractor-payments';
const CONTRACTOR_LIST_API_URL = '/api/contractor-payment-contractors';
const RATE_CARD_API_URL       = '/api/contractor-rate-cards';

const WORK_TYPES = [
    { key: 'fabrication',  label: 'Fabrication' },
    { key: 'cement_sheet', label: 'Cement Sheet' },
    { key: 'electrical',   label: 'Electrical' },
    { key: 'tiles',        label: 'Tiles' },
    { key: 'plumbing',     label: 'Plumbing' },
    { key: 'door_fitting', label: 'Door Fitting' },
    { key: 'outer_colour', label: 'Outer Colour' },
    { key: 'inner_colour', label: 'Inner Colour' }
];

const DEFAULT_RATES = {
    fabrication: 100, cement_sheet: 150, electrical: 200, tiles: 120,
    plumbing: 130, door_fitting: 250, outer_colour: 80, inner_colour: 90
};

const LOCATIONS = [
    'Arneel industries karodi',
    'Anil industries karodi',
    'Anil industries ghanegoan',
    'Anil industries yavatmal',
    'Kpr projections'
];

const state = {
    contractors: [],
    selectedId: null,
    pendingLocationEntries: [],
    entriesCache: {},
    paymentsCache: {},
    rateHistory: {}
};

/* ============================================================
   UTILITIES
============================================================ */
const $  = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function getTodayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function parseAmount(v){const n=Number(v);return Number.isFinite(n)&&n>=0?n:0;}
function formatCurrency(v){return new Intl.NumberFormat('en-IN',{maximumFractionDigits:2}).format(Number(v)||0);}
function formatNumber(v){const n=Number(v)||0;return Number.isInteger(n)?String(n):n.toFixed(2);}
function escapeHtml(v){return String(v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function camelCase(s){return s.replace(/_([a-z])/g,(_,c)=>c.toUpperCase());}

function getStatusClass(s){
    return {MATCH:'status-match',PAID:'status-paid',UNPAID:'status-unpaid',
            PENDING:'status-pending',MISMATCH:'status-mismatch',OVERPAID:'status-overpaid'}[s]||'status-pending';
}

/* ============================================================
   LIST FILTERS (multi-select location)
============================================================ */
function getSelectedLocations() {
    const sel = document.getElementById('filterLocation');
    if (!sel) return [];
    return Array.from(sel.selectedOptions).map(o => o.value).filter(Boolean);
}

function readListFilters() {
    return {
        fromDate:  document.getElementById('filterFromDate')?.value || '',
        toDate:    document.getElementById('filterToDate')?.value   || '',
        locations: getSelectedLocations()
    };
}

function applyFiltersToUrl(url) {
    const f = readListFilters();
    if (f.fromDate) url.searchParams.set('fromDate', f.fromDate);
    if (f.toDate)   url.searchParams.set('toDate',   f.toDate);
    f.locations.forEach(loc => url.searchParams.append('location', loc));
    return url;
}

function hasActiveListFilters() {
    const f = readListFilters();
    return Boolean(f.fromDate || f.toDate || f.locations.length);
}

function updateFilterBadge() {
    const badge = document.getElementById('listFilterBadge');
    if (!badge) return;
    const f = readListFilters();
    const parts = [];
    if (f.fromDate) parts.push(`From ${f.fromDate}`);
    if (f.toDate)   parts.push(`To ${f.toDate}`);
    if (f.locations.length === 1) parts.push(f.locations[0]);
    else if (f.locations.length > 1) parts.push(`${f.locations.length} locations`);

    if (!parts.length) {
        badge.hidden = true;
        badge.textContent = '';
        return;
    }
    badge.hidden = false;
    badge.textContent = parts.join(' • ');
}

/* ---- Render location checkboxes ---- */
function renderLocationMultiSelect() {
    const optionsEl = document.getElementById('locOptions');
    const selectEl  = document.getElementById('filterLocation');
    if (!optionsEl || !selectEl) return;

    optionsEl.innerHTML = '';
    selectEl.innerHTML = '';

    LOCATIONS.forEach(loc => {
        const opt = document.createElement('option');
        opt.value = loc;
        opt.textContent = loc;
        selectEl.appendChild(opt);

        const label = document.createElement('label');
        label.className = 'ms-option';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.value = loc;
        cb.addEventListener('change', () => {
            opt.selected = cb.checked;
            syncSelectAllCheckbox();
            updateLocToggleLabel();
        });
        const span = document.createElement('span');
        span.textContent = loc;
        label.appendChild(cb);
        label.appendChild(span);
        optionsEl.appendChild(label);
    });
}

function updateLocToggleLabel() {
    const labelEl = document.getElementById('locToggleLabel');
    const selected = getSelectedLocations();
    if (!labelEl) return;
    if (!selected.length)            labelEl.textContent = 'All Locations';
    else if (selected.length === 1)  labelEl.textContent = selected[0];
    else                             labelEl.textContent = `${selected.length} locations`;
}

function syncSelectAllCheckbox() {
    const all = document.getElementById('locSelectAll');
    if (!all) return;
    const selected = getSelectedLocations();
    all.checked = selected.length === LOCATIONS.length && LOCATIONS.length > 0;
    all.indeterminate = selected.length > 0 && selected.length < LOCATIONS.length;
}

function setAllLocations(checked) {
    const optionsEl = document.getElementById('locOptions');
    const selectEl  = document.getElementById('filterLocation');
    if (!optionsEl || !selectEl) return;

    optionsEl.querySelectorAll('input[type="checkbox"]').forEach(cb => { cb.checked = checked; });
    Array.from(selectEl.options).forEach(o => { o.selected = checked; });
    syncSelectAllCheckbox();
    updateLocToggleLabel();
}

function openLocMenu() {
    const wrap = document.getElementById('locMultiSelect');
    const menu = document.getElementById('locMenu');
    if (!wrap || !menu) return;
    wrap.classList.add('open');
    menu.hidden = false;
}
function closeLocMenu() {
    const wrap = document.getElementById('locMultiSelect');
    const menu = document.getElementById('locMenu');
    if (!wrap || !menu) return;
    wrap.classList.remove('open');
    menu.hidden = true;
}
function toggleLocMenu() {
    const menu = document.getElementById('locMenu');
    if (!menu) return;
    if (menu.hidden) openLocMenu(); else closeLocMenu();
}

function wireLocationMultiSelect() {
    const toggle = document.getElementById('locToggle');
    const wrap   = document.getElementById('locMultiSelect');
    const all    = document.getElementById('locSelectAll');
    if (!toggle || !wrap) return;

    toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleLocMenu();
    });

    all?.addEventListener('change', () => {
        setAllLocations(all.checked);
    });

    document.addEventListener('click', (e) => {
        if (!wrap.contains(e.target)) closeLocMenu();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeLocMenu();
    });
}

function resetLocationMultiSelect() {
    setAllLocations(false);
}

/* ============================================================
   RATE / AMOUNT HELPERS
============================================================ */
function getActiveRates(history, dateStr) {
    if (!history || !history.length) return { ...DEFAULT_RATES };
    const target = dateStr ? new Date(dateStr) : new Date();
    const card = history.find(c => c.effective_date && new Date(c.effective_date) <= target);
    const fallback = card || history[history.length - 1];
    return { ...DEFAULT_RATES, ...(fallback.rates || {}) };
}

function calcEntryAmount(entry, rates) {
    return WORK_TYPES.reduce(
        (sum, w) => sum + (Number(entry[w.key]) || 0) * (Number(rates[w.key]) || 0),
        0
    );
}

function computeContractorTotals(c) {
    const entries = state.entriesCache[c.id] || [];
    const history = state.rateHistory[c.id] || [];
    let totalAmount = 0;
    entries.forEach(e => {
        const rates = getActiveRates(history, e.entry_date);
        totalAmount += calcEntryAmount(e, rates);
    });
    const totalPayment = Number(c.total_payment) || 0;
    return { totalAmount, totalPayment, balance: totalAmount - totalPayment };
}

/**
 * Compute totals restricted to the currently-active filters
 * (location + date range), so the header can match the list.
 */
function computeContractorTotalsFiltered(c) {
    const filters = readListFilters();

    // Entries
    const entries = (state.entriesCache[c.id] || []).filter(e => {
        if (filters.locations.length) {
            const loc = (e.location || '').toLowerCase();
            const allowed = filters.locations.map(l => l.toLowerCase());
            if (!allowed.includes(loc)) return false;
        }
        if (filters.fromDate && e.entry_date && e.entry_date < filters.fromDate) return false;
        if (filters.toDate   && e.entry_date && e.entry_date > filters.toDate)   return false;
        return true;
    });
    const history = state.rateHistory[c.id] || [];
    let totalAmount = 0;
    entries.forEach(e => {
        const rates = getActiveRates(history, e.entry_date);
        totalAmount += calcEntryAmount(e, rates);
    });

    // Payments (restricted by date range only — payments don't have location)
    const allPayments = state.paymentsCache[c.id] || [];
    const totalPayment = allPayments.reduce((sum, p) => {
        if (filters.fromDate && p.payment_date && p.payment_date < filters.fromDate) return sum;
        if (filters.toDate   && p.payment_date && p.payment_date > filters.toDate)   return sum;
        return sum + (Number(p.total_amount) || 0);
    }, 0);

    return { totalAmount, totalPayment, balance: totalAmount - totalPayment };
}

function computeStatus(balance, totalPayment) {
    if (balance > 0.005) return totalPayment > 0 ? 'PENDING' : 'UNPAID';
    if (balance < -0.005) return 'OVERPAID';
    return 'PAID';
}

async function ensureRateHistory(contractorId) {
    if (state.rateHistory[contractorId]) return state.rateHistory[contractorId];
    try {
        const res = await fetch(`${RATE_CARD_API_URL}/${contractorId}/history`);
        if (res.ok) {
            const history = await res.json();
            const arr = Array.isArray(history) ? history : [];
            arr.sort((a, b) => new Date(b.effective_date) - new Date(a.effective_date));
            state.rateHistory[contractorId] = arr;
        } else {
            state.rateHistory[contractorId] = [];
        }
    } catch (e) {
        state.rateHistory[contractorId] = [];
    }
    return state.rateHistory[contractorId];
}

function updateHeaderForContractor(c) {
    const { totalAmount, totalPayment, balance } = hasActiveListFilters()
        ? computeContractorTotalsFiltered(c)
        : computeContractorTotals(c);
    const status = computeStatus(balance, totalPayment);
    const prefix = hasActiveListFilters() ? 'Filtered Balance: ' : 'Balance: ';
    $('#contractorSubheading').textContent = `${prefix}₹ ${formatCurrency(balance)}`;
    $('#contractorStatusHeading').textContent = status;
    $('#contractorStatusHeading').className = `status-badge ${getStatusClass(status)}`;
}

/* ============================================================
   LOAD CONTRACTOR LIST (left panel)
============================================================ */
async function loadContractors(search = '') {
    const url = new URL(CONTRACTOR_API_URL, window.location.origin);
    if (search) url.searchParams.set('search', search);
    applyFiltersToUrl(url);

    let rows = [];
    try {
        const res = await fetch(url);
        if (res.ok) { const j = await res.json(); rows = j.rows || []; }
    } catch(e){ console.warn(e); }
    state.contractors = rows;

    const tbody = $('#partiesTable tbody');
    tbody.innerHTML = '';
    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="2" style="text-align:center;padding:20px;color:#999;">No contractors</td></tr>';
        updateFilterBadge();
        return;
    }
    rows.forEach(c => {
        const tr = document.createElement('tr');
        tr.dataset.id = c.id;
        if (Number(c.id) === Number(state.selectedId)) tr.classList.add('selected');
        tr.innerHTML = `
            <td>${escapeHtml(c.contractor_name)}</td>
            <td class="text-right">₹ ${formatCurrency(c.balance_payable)}</td>
        `;
        tr.addEventListener('click', () => selectContractor(c.id));
        tbody.appendChild(tr);
    });

    if (!state.selectedId && rows.length) selectContractor(rows[0].id);
    updateFilterBadge();
}

/* ============================================================
   SELECT A CONTRACTOR
============================================================ */
async function selectContractor(id) {
    state.selectedId = Number(id);
    $$('#partiesTable tbody tr').forEach(tr => {
        tr.classList.toggle('selected', Number(tr.dataset.id) === state.selectedId);
    });

    const c = state.contractors.find(x => Number(x.id) === state.selectedId);
    if (!c) return;

    $('#contractorNameHeading').textContent = c.contractor_name || '—';
    $('#contractorAvatar').textContent = (c.contractor_name || 'C').charAt(0).toUpperCase();

    await ensureRateHistory(c.id);
    await loadWorkTab(c);
    await loadPaymentTab(c);       // populate paymentsCache before header calc
    updateHeaderForContractor(c);

    loadSummaryTab(c);
}

/* ============================================================
   TAB 3: SUMMARY
============================================================ */
function loadSummaryTab(c) {
    const summary = $('#contractorSummaryBody');

    const entries = state.entriesCache[c.id] || [];
    const qtyTotals = {};
    WORK_TYPES.forEach(w => qtyTotals[w.key] = 0);
    entries.forEach(e => {
        WORK_TYPES.forEach(w => {
            qtyTotals[w.key] += Number(e[w.key]) || 0;
        });
    });
    const totalQty = WORK_TYPES.reduce((s, w) => s + qtyTotals[w.key], 0);

    const { totalAmount, totalPayment, balance } = computeContractorTotals(c);

    summary.innerHTML = `
        <article class="contractor-summary-card amount">
            <span>Total Amount</span>
            <strong>₹ ${formatCurrency(totalAmount)}</strong>
        </article>
        <article class="contractor-summary-card payment">
            <span>Total Payment</span>
            <strong>₹ ${formatCurrency(totalPayment)}</strong>
        </article>
        <article class="contractor-summary-card balance">
            <span>Balance Payable</span>
            <strong>₹ ${formatCurrency(balance)}</strong>
        </article>
        <section class="contractor-work-summary">
            <h3><span>Work Type Quantities</span><span>Total Quantity: <strong>${formatNumber(totalQty)}</strong></span></h3>
            <div class="contractor-work-summary-grid">
                ${WORK_TYPES.map(w => `<div><span>${escapeHtml(w.label)}</span><strong>${formatNumber(qtyTotals[w.key])}</strong></div>`).join('')}
            </div>
        </section>
    `;
}

/* ============================================================
   TAB 1: CONTRACTOR WORK ENTRIES
============================================================ */
async function loadWorkTab(c) {
    const tbody = $('#workEntriesTable tbody');
    tbody.innerHTML = '<tr><td colspan="12" style="text-align:center;padding:20px;color:#999;">Loading...</td></tr>';

    let entries = [];
    try {
        const res = await fetch(`/api/contractor-payments/${c.id}/entries`);
        if (res.ok) entries = await res.json();
    } catch(e){ console.warn(e); }
    state.entriesCache[c.id] = entries;

    const history = state.rateHistory[c.id] || [];

    if (!entries.length) {
        tbody.innerHTML = '<tr><td colspan="12" style="text-align:center;padding:20px;color:#999;">No work entries</td></tr>';
        $('#workFooter').textContent = 'Showing 0 entries';
        return;
    }

    let grandTotal = 0;
    const rowsHtml = entries.map(e => {
        const rates = getActiveRates(history, e.entry_date);
        const amount = calcEntryAmount(e, rates);
        grandTotal += amount;
        return `
        <tr>
            <td>${escapeHtml(e.entry_date || '—')}</td>
            <td>${escapeHtml(e.location || '—')}</td>
            <td class="text-right">${formatNumber(e.fabrication)}</td>
            <td class="text-right">${formatNumber(e.cement_sheet)}</td>
            <td class="text-right">${formatNumber(e.electrical)}</td>
            <td class="text-right">${formatNumber(e.tiles)}</td>
            <td class="text-right">${formatNumber(e.plumbing)}</td>
            <td class="text-right">${formatNumber(e.door_fitting)}</td>
            <td class="text-right">${formatNumber(e.outer_colour)}</td>
            <td class="text-right">${formatNumber(e.inner_colour)}</td>
            <td class="text-right"><strong>₹ ${formatCurrency(amount)}</strong></td>
            <td><div class="row-actions">
                <button type="button" class="row-action edit" data-work-action="edit" data-id="${e.id}">Edit</button>
                <button type="button" class="row-action delete" data-work-action="delete" data-id="${e.id}">Delete</button>
            </div></td>
        </tr>`;
    }).join('');

    const totalRow = `
        <tr style="background:#f5f7fa;font-weight:700;">
            <td colspan="10" class="text-right">Total</td>
            <td class="text-right">₹ ${formatCurrency(grandTotal)}</td>
            <td></td>
        </tr>`;

    tbody.innerHTML = rowsHtml + totalRow;
    $('#workFooter').textContent = `Showing 1 to ${entries.length} of ${entries.length} entries`;
}

/* ============================================================
   TAB 2: PAYMENT DETAILS
============================================================ */
async function loadPaymentTab(c) {
    const tbody = $('#paymentsTable tbody');
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;color:#999;">Loading...</td></tr>';

    let rows = [];
    try {
        const res = await fetch(`/api/contractor-payments/${c.id}/transactions`);
        if (res.ok) { const j = await res.json(); rows = j.dayWise || []; }
    } catch(e){ console.warn(e); }
    state.paymentsCache[c.id] = rows;

    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;color:#999;">No payments</td></tr>';
        $('#paymentFooter').textContent = 'Showing 0 entries';
        return;
    }
    tbody.innerHTML = rows.map(p => `
        <tr>
            <td>${escapeHtml(p.payment_date || '—')}</td>
            <td>${escapeHtml(p.paid_by || '—')}</td>
            <td>${escapeHtml(p.payment_mode || '—')}</td>
            <td>${escapeHtml(p.remarks || '—')}</td>
            <td class="text-right">₹ ${formatCurrency(p.total_amount)}</td>
            <td><div class="row-actions">
                <button type="button" class="row-action edit" data-payment-action="edit" data-id="${p.id}">Edit</button>
                <button type="button" class="row-action delete" data-payment-action="delete" data-id="${p.id}">Delete</button>
            </div></td>
        </tr>
    `).join('');
    $('#paymentFooter').textContent = `Showing 1 to ${rows.length} of ${rows.length} entries`;
}

/* ============================================================
   TABS
============================================================ */
function bindTabs() {
    $$('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            $$('.tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const target = tab.dataset.tab;
            $$('.tab-body').forEach(b => b.style.display = b.dataset.body === target ? '' : 'none');
        });
    });
}

/* ============================================================
   SEARCH
============================================================ */
function bindSearch() {
    const input = $('#partySearch');
    let t = null;
    input.addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(() => loadContractors(input.value.trim()), 250);
    });
}

/* ============================================================
   LOCATION SELECTS (modal only)
============================================================ */
function populateLocationSelects() {
    const selectors = ['#entryLocationSelect', '#workEntryLocation'];
    selectors.forEach(sel => {
        const el = $(sel);
        if (!el) return;
        const current = el.value;
        const keepFirst = el.querySelector('option[value=""]');
        el.innerHTML = '';
        if (keepFirst) el.appendChild(keepFirst);
        LOCATIONS.forEach(loc => {
            const o = document.createElement('option');
            o.value = loc;
            o.textContent = loc;
            el.appendChild(o);
        });
        el.value = current;
    });
}

/* ============================================================
   CONTRACTOR MODAL
============================================================ */
function resetContractorForm() {
    $('#contractorForm').reset();
    $('#contractorIdInput').value = '';
    $('#contractorDateInput').value = getTodayISO();
    $('#totalAmountInput').value = '0';
    state.pendingLocationEntries = [];
    renderPendingEntries();
    WORK_TYPES.forEach(w => { const el = document.querySelector('#' + camelCase(w.key) + 'Input'); if (el) el.value = '0'; });
    $('#entryLocationSelect').value = '';
}

function renderPendingEntries() {
    const sec = $('#addedLocationsSection');
    const body = $('#addedLocationsBody');
    if (!state.pendingLocationEntries.length) {
        sec.style.display = 'none';
        body.innerHTML = '';
        return;
    }
    sec.style.display = 'block';
    body.innerHTML = state.pendingLocationEntries.map((e, i) => `
        <tr>
            <td>${escapeHtml(e.location)}</td>
            <td>${formatNumber(e.fabrication)}</td>
            <td>${formatNumber(e.cement_sheet)}</td>
            <td>${formatNumber(e.electrical)}</td>
            <td>${formatNumber(e.tiles)}</td>
            <td>${formatNumber(e.plumbing)}</td>
            <td>${formatNumber(e.door_fitting)}</td>
            <td>${formatNumber(e.outer_colour)}</td>
            <td>${formatNumber(e.inner_colour)}</td>
            <td><button type="button" class="remove-location-btn" data-idx="${i}">Remove</button></td>
        </tr>`).join('');
}

function addLocationEntry() {
    const loc = $('#entryLocationSelect').value;
    if (!loc) { alert('Select a location.'); return; }
    const entry = { location: loc, entry_date: $('#contractorDateInput').value || getTodayISO() };
    WORK_TYPES.forEach(w => {
        const el = document.querySelector('#' + camelCase(w.key) + 'Input');
        entry[w.key] = parseAmount(el ? el.value : 0);
    });
    if (WORK_TYPES.every(w => !entry[w.key])) { alert('Enter at least one quantity.'); return; }

    const idx = state.pendingLocationEntries.findIndex(e => e.location.toLowerCase() === loc.toLowerCase());
    if (idx >= 0) state.pendingLocationEntries[idx] = entry;
    else state.pendingLocationEntries.push(entry);

    renderPendingEntries();
    WORK_TYPES.forEach(w => { const el = document.querySelector('#' + camelCase(w.key) + 'Input'); if (el) el.value = '0'; });
    $('#entryLocationSelect').value = '';
}

function openContractorModal(mode, row) {
    resetContractorForm();
    if (mode === 'edit' && row) {
        $('#contractorModalTitle').textContent = 'Edit Contractor';
        $('#contractorIdInput').value = row.id;
        $('#contractorNameInput').value = row.contractor_name || '';
        $('#contractorDateInput').value = row.contractor_date || getTodayISO();
        $('#contractorRemarkInput').value = row.remark || '';
        $('#totalAmountInput').value = row.total_amount || 0;
    } else {
        $('#contractorModalTitle').textContent = 'Add Contractor';
    }
    $('#contractorModal').style.display = 'flex';
}
function closeContractorModal() { $('#contractorModal').style.display = 'none'; }

function workEntryInput(key) {
    const camel = camelCase(key);
    return $(`#workEntry${camel.charAt(0).toUpperCase()}${camel.slice(1)}`);
}

function openWorkEntryModal(entry = null) {
    if (!state.selectedId) { alert('Select a contractor first.'); return; }
    $('#workEntryForm').reset();
    $('#workEntryId').value = entry ? entry.id : '';
    $('#workEntryModalTitle').textContent = entry ? 'Edit Work Entry' : 'Add Work Entry';
    $('#workEntryLocation').value = entry?.location || '';
    $('#workEntryDate').value = entry?.entry_date || getTodayISO();
    WORK_TYPES.forEach(w => { workEntryInput(w.key).value = Number(entry?.[w.key]) || 0; });
    $('#workEntryModal').style.display = 'flex';
}

function closeWorkEntryModal() { $('#workEntryModal').style.display = 'none'; }

async function submitWorkEntry(ev) {
    ev.preventDefault();
    const entryId = Number($('#workEntryId').value || 0);
    const payload = { location: $('#workEntryLocation').value, entry_date: $('#workEntryDate').value };
    WORK_TYPES.forEach(w => { payload[w.key] = parseAmount(workEntryInput(w.key).value); });
    if (WORK_TYPES.every(w => payload[w.key] === 0)) { alert('Enter at least one quantity.'); return; }
    const url = entryId
        ? `${CONTRACTOR_API_URL}/${state.selectedId}/entries/${entryId}`
        : `${CONTRACTOR_API_URL}/${state.selectedId}/entries`;
    const response = await fetch(url, {
        method: entryId ? 'PUT' : 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload)
    }).catch(error => { alert('Network error: ' + error.message); return null; });
    if (!response || !response.ok) { alert('Work entry save failed'); return; }
    closeWorkEntryModal();
    await loadContractors($('#partySearch').value.trim());
}

async function deleteWorkEntry(entryId) {
    if (!confirm('Delete this work entry?')) return;
    const response = await fetch(`${CONTRACTOR_API_URL}/${state.selectedId}/entries/${entryId}`, {method:'DELETE'})
        .catch(error => { alert('Network error: ' + error.message); return null; });
    if (!response || !response.ok) { alert('Work entry delete failed'); return; }
    await loadContractors($('#partySearch').value.trim());
}

async function submitContractor(ev) {
    ev.preventDefault();
    const name = $('#contractorNameInput').value.trim();
    if (!name) { alert('Name is required'); return; }
    if (!state.pendingLocationEntries.length) { alert('Add at least one location entry'); return; }

    const editingId = Number($('#contractorIdInput').value || 0);
    const isEdit = editingId > 0;
    const agg = {}; WORK_TYPES.forEach(w => agg[w.key] = 0);
    state.pendingLocationEntries.forEach(e => WORK_TYPES.forEach(w => agg[w.key] += Number(e[w.key]) || 0));

    const totalAmount = Number($('#totalAmountInput').value) || 0;

    const payload = {
        contractor_name: name,
        contractor_date: $('#contractorDateInput').value,
        remark: $('#contractorRemarkInput').value.trim(),
        entries: state.pendingLocationEntries,
        total_amount: totalAmount,
        ...agg
    };

    const url = isEdit ? `${CONTRACTOR_API_URL}/${editingId}` : CONTRACTOR_API_URL;
    const method = isEdit ? 'PUT' : 'POST';
    const res = await fetch(url, {
        method,
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify(payload)
    }).catch(e => { alert('Network error: ' + e.message); return null; });

    if (!res || !res.ok) {
        const txt = res ? await res.text() : '';
        alert('Save failed: ' + txt.slice(0,200));
        return;
    }
    closeContractorModal();
    await loadContractors($('#partySearch').value.trim());
}

/* ============================================================
   PAYMENT MODAL
============================================================ */
async function openPaymentModal(contractorId, payment = null) {
    await loadContractorsForDropdown();
    $('#paymentForm').reset();
    $('#paymentId').value = payment ? payment.id : '';
    $('#paymentModalTitle').textContent = payment ? 'Edit Payment' : 'Add Payment';
    $('#paymentDate').value = payment?.payment_date || getTodayISO();
    $('#paymentContractor').value = contractorId ? String(contractorId) : (state.selectedId || '');
    $('#paymentContractor').disabled = Boolean(payment);
    $('#paymentAmount').value = payment ? Number(payment.total_amount) || 0 : '';
    $('#paymentMode').value = payment?.payment_mode || 'Online';
    $('#paidBy').value = payment?.paid_by || '';
    $('#paymentRemarks').value = payment?.remarks || '';
    $('#paymentModal').style.display = 'flex';
}
function closePaymentModal() {
    $('#paymentModal').style.display = 'none';
    $('#paymentContractor').disabled = false;
}

async function loadContractorsForDropdown() {
    let rows = [];
    try {
        const res = await fetch(CONTRACTOR_LIST_API_URL);
        if (res.ok) rows = await res.json();
    } catch(e){}
    ['#paymentContractor', '#rateCardContractor'].forEach(selector => {
        const sel = $(selector);
        if (!sel) return;
        sel.innerHTML = '<option value="">Select Contractor</option>';
        rows.forEach(r => {
            const o = document.createElement('option');
            o.value = r.id;
            o.textContent = r.contractor_name;
            sel.appendChild(o);
        });
    });
}

async function submitPayment(ev) {
    ev.preventDefault();
    const cid = Number($('#paymentContractor').value);
    const paymentId = Number($('#paymentId').value || 0);
    if (!cid) { alert('Select contractor'); return; }
    const payload = {
        payment_date: $('#paymentDate').value,
        payment_amount: parseAmount($('#paymentAmount').value),
        payment_mode: $('#paymentMode').value,
        paid_by: $('#paidBy').value.trim(),
        remarks: $('#paymentRemarks').value.trim()
    };
    const url = paymentId ? `/api/contractor-payments/${cid}/payments/${paymentId}` : `/api/contractor-payments/${cid}/payments`;
    const res = await fetch(url, {
        method: paymentId ? 'PUT' : 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify(payload)
    }).catch(e => { alert('Network error: ' + e.message); return null; });
    if (!res || !res.ok) { alert('Payment save failed'); return; }
    closePaymentModal();
    await loadContractors($('#partySearch').value.trim());
}

async function deletePayment(paymentId) {
    if (!confirm('Delete this payment?')) return;
    const response = await fetch(`/api/contractor-payments/${state.selectedId}/payments/${paymentId}`, {method:'DELETE'})
        .catch(error => { alert('Network error: ' + error.message); return null; });
    if (!response || !response.ok) { alert('Payment delete failed'); return; }
    await loadContractors($('#partySearch').value.trim());
}

/* ============================================================
   RATE CARD MODAL
============================================================ */
function rateInputId(key) {
    const camel = camelCase(key);
    return `#rate${camel.charAt(0).toUpperCase()}${camel.slice(1)}`;
}

async function loadRateHistory(contractorId) {
    const body = $('#rateHistoryBody');
    if (!contractorId) {
        body.innerHTML = '<tr><td colspan="9" class="rate-history-empty">Select a contractor.</td></tr>';
        return;
    }

    body.innerHTML = '<tr><td colspan="9" class="rate-history-empty">Loading...</td></tr>';
    try {
        const response = await fetch(`${RATE_CARD_API_URL}/${contractorId}/history`);
        if (!response.ok) throw new Error('Unable to load rate history');
        const history = await response.json();
        const arr = Array.isArray(history) ? history : [];
        arr.sort((a, b) => new Date(b.effective_date) - new Date(a.effective_date));
        state.rateHistory[contractorId] = arr;

        const latestRates = arr[0]?.rates || DEFAULT_RATES;
        WORK_TYPES.forEach(w => { $(rateInputId(w.key)).value = Number(latestRates[w.key]) || 0; });

        body.innerHTML = arr.length
            ? arr.map(card => `
                <tr><td>${escapeHtml(card.effective_date || '—')}</td>
                ${WORK_TYPES.map(w => `<td class="text-right">₹ ${formatCurrency(card.rates[w.key])}</td>`).join('')}</tr>`).join('')
            : '<tr><td colspan="9" class="rate-history-empty">No rate cards found.</td></tr>';
    } catch (error) {
        body.innerHTML = `<tr><td colspan="9" class="rate-history-empty">${escapeHtml(error.message)}</td></tr>`;
    }
}

async function openRateCardModal(contractorId) {
    await loadContractorsForDropdown();
    $('#rateCardForm').reset();
    $('#rateCardDate').value = getTodayISO();
    $('#rateCardContractor').value = contractorId ? String(contractorId) : '';
    WORK_TYPES.forEach(w => { $(rateInputId(w.key)).value = DEFAULT_RATES[w.key]; });
    $('#rateCardModal').style.display = 'flex';
    await loadRateHistory($('#rateCardContractor').value);
}

function closeRateCardModal() {
    $('#rateCardModal').style.display = 'none';
}

async function submitRateCard(ev) {
    ev.preventDefault();
    const contractorId = Number($('#rateCardContractor').value);
    if (!contractorId) { alert('Select contractor'); return; }
    const rates = {};
    WORK_TYPES.forEach(w => { rates[w.key] = parseAmount($(rateInputId(w.key)).value); });

    const response = await fetch(RATE_CARD_API_URL, {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
            contractor_id: contractorId,
            effective_date: $('#rateCardDate').value,
            rates
        })
    }).catch(error => { alert('Network error: ' + error.message); return null; });
    if (!response || !response.ok) { alert('Rate card save failed'); return; }

    delete state.rateHistory[contractorId];
    await loadRateHistory(contractorId);

    if (Number(state.selectedId) === contractorId) {
        const c = state.contractors.find(x => Number(x.id) === contractorId);
        if (c) {
            await ensureRateHistory(contractorId);
            await loadWorkTab(c);
            updateHeaderForContractor(c);
            loadSummaryTab(c);
        }
    }

    alert('Rate card saved successfully');
}

/* ============================================================
   BIND
============================================================ */
function bindEvents() {
    bindTabs();
    bindSearch();

    // ---- List filters (multi-select location) ----
    renderLocationMultiSelect();
    wireLocationMultiSelect();
    resetLocationMultiSelect();

    const applyFilters = () => {
        state.selectedId = null;
        loadContractors($('#partySearch').value.trim());
        closeLocMenu();
    };
    const resetFilters = () => {
        const from = $('#filterFromDate'); if (from) from.value = '';
        const to   = $('#filterToDate');   if (to)   to.value   = '';
        resetLocationMultiSelect();
        state.selectedId = null;
        loadContractors($('#partySearch').value.trim());
        closeLocMenu();
    };

    $('#applyListFilters')?.addEventListener('click', applyFilters);
    $('#resetListFilters')?.addEventListener('click', resetFilters);

    $('#filterFromDate')?.addEventListener('change', applyFilters);
    $('#filterToDate')?.addEventListener('change', applyFilters);

    document.getElementById('locMenu')?.addEventListener('click', (e) => {
        if (e.target.closest('.ms-all')) return;
        if (e.target.matches('input[type="checkbox"]')) {
            setTimeout(applyFilters, 0);
        }
    });

    // ---- Contractor modal ----
    $('#addContractorBtn').addEventListener('click', () => openContractorModal('add'));
    $('#closeContractorModal').addEventListener('click', closeContractorModal);
    $('#cancelContractorBtn').addEventListener('click', closeContractorModal);
    $('#contractorForm').addEventListener('submit', submitContractor);
    $('#addLocationEntryBtn').addEventListener('click', addLocationEntry);
    $('#clearAllLocationsBtn').addEventListener('click', () => {
        state.pendingLocationEntries = [];
        renderPendingEntries();
    });
    $('#addedLocationsBody').addEventListener('click', ev => {
        const b = ev.target.closest('[data-idx]');
        if (!b) return;
        state.pendingLocationEntries.splice(Number(b.dataset.idx), 1);
        renderPendingEntries();
    });

    // Live total
    document.querySelectorAll('.work-qty-grid input').forEach(inp => {
        inp.addEventListener('input', () => {
            const rates = {fabrication:100,cement_sheet:150,electrical:200,tiles:120,
                           plumbing:130,door_fitting:250,outer_colour:80,inner_colour:90};
            let total = 0;
            WORK_TYPES.forEach(w => {
                const el = document.querySelector('#' + camelCase(w.key) + 'Input');
                if (el) total += parseAmount(el.value) * (rates[w.key] || 0);
            });
            state.pendingLocationEntries.forEach(e => WORK_TYPES.forEach(w => {
                total += (Number(e[w.key]) || 0) * (rates[w.key] || 0);
            }));
            $('#totalAmountInput').value = total.toFixed(2);
        });
    });

    $('#editContractorInline').addEventListener('click', () => {
        const c = state.contractors.find(x => Number(x.id) === Number(state.selectedId));
        if (c) openContractorModal('edit', c);
    });

    // ---- Work entry modal ----
    $('#addWorkEntryBtn').addEventListener('click', () => openWorkEntryModal());
    $('#closeWorkEntryModal').addEventListener('click', closeWorkEntryModal);
    $('#cancelWorkEntryBtn').addEventListener('click', closeWorkEntryModal);
    $('#workEntryForm').addEventListener('submit', submitWorkEntry);
    $('#workEntriesTable tbody').addEventListener('click', event => {
        const button = event.target.closest('[data-work-action]');
        if (!button) return;
        const entry = (state.entriesCache[state.selectedId] || []).find(row => Number(row.id) === Number(button.dataset.id));
        if (button.dataset.workAction === 'edit' && entry) openWorkEntryModal(entry);
        if (button.dataset.workAction === 'delete') deleteWorkEntry(Number(button.dataset.id));
    });

    // ---- Payment modal ----
    $('#addPaymentBtn').addEventListener('click', () => openPaymentModal(state.selectedId));
    $('#closePaymentModal').addEventListener('click', closePaymentModal);
    $('#cancelPaymentBtn').addEventListener('click', closePaymentModal);
    $('#paymentForm').addEventListener('submit', submitPayment);
    $('#paymentsTable tbody').addEventListener('click', event => {
        const button = event.target.closest('[data-payment-action]');
        if (!button) return;
        const payment = (state.paymentsCache[state.selectedId] || []).find(row => Number(row.id) === Number(button.dataset.id));
        if (button.dataset.paymentAction === 'edit' && payment) openPaymentModal(state.selectedId, payment);
        if (button.dataset.paymentAction === 'delete') deletePayment(Number(button.dataset.id));
    });

    // ---- Rate card modal ----
    $('#rateCardBtn').addEventListener('click', () => openRateCardModal(state.selectedId));
    $('#closeRateCardModal').addEventListener('click', closeRateCardModal);
    $('#cancelRateCardBtn').addEventListener('click', closeRateCardModal);
    $('#rateCardContractor').addEventListener('change', event => loadRateHistory(event.target.value));
    $('#rateCardForm').addEventListener('submit', submitRateCard);
}

/* ============================================================
   BOOT
============================================================ */
window.initContractorPage = function initContractorPage() {
    populateLocationSelects();
    bindEvents();
    loadContractors();
};