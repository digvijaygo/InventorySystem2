/* ============================================================
   estimate.js — Controller for Estimate / Quotation page
   Exposes window.initEstimatePage() consumed by app.js
   ============================================================ */
(function () {
    'use strict';

    window.initEstimatePage = function initEstimatePage() {
        const ROOT = document.querySelector('.page-view[data-page="estimate"]');
        if (!ROOT) {
            console.warn('[estimate.js] Root not found — skipping init');
            return;
        }
        if (ROOT.dataset.initialized === '1') {
            console.log('[estimate.js] Already initialized');
            return;
        }
        ROOT.dataset.initialized = '1';

        const API_URL = '/api/estimates';
        const PAGE_SIZE = 10;
        const currency = new Intl.NumberFormat('en-IN', {
            style: 'currency', currency: 'INR', maximumFractionDigits: 2
        });

        const LOCATION_OPTIONS = [
            'Arneel industries karodi',
            'Anil industries karodi',
            'Anil industries ghanegoan',
            'Anil industries yavatmal',
            'Kpr projections'
        ];

        const $ = (sel) => ROOT.querySelector(sel);
        const rows = $('#estimateRows');
        const count = $('#estimateRecordCount');
        const estimates = [];
        let currentPage = 1;
        let selectedLocations = new Set();

        function escapeHtml(v) {
            return String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ({
                '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'
            }[c]));
        }
        function today() {
            const d = new Date();
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        }
        function formatDate(v) {
            if (!v) return '-';
            return new Date(`${v}T00:00:00`).toLocaleDateString('en-IN', {
                day: '2-digit', month: 'short', year: 'numeric'
            });
        }
        function n(v) { const x = Number(v); return Number.isFinite(x) ? x : 0; }

        // ---------- FILTER + RENDER ----------
        function filteredEstimates() {
            const fromDate = $('#estimateFromDate').value;
            const toDate = $('#estimateToDate').value;
            return estimates.filter((t) => {
                const locationMatch = selectedLocations.size === 0 || selectedLocations.has(t.location || '');
                return (!fromDate || t.invoice_date >= fromDate) &&
                       (!toDate || t.invoice_date <= toDate) &&
                       locationMatch;
            });
        }

        function updateSummary(list) {
            const total = list.reduce((s, t) => s + n(t.amount), 0);
            $('#estimateTotalAmount').textContent = currency.format(total);
            $('#estimateTotalCount').textContent =
                `${list.length} estimate${list.length === 1 ? '' : 's'}`;
        }

        function renderPagination(totalItems) {
            const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
            if (currentPage > totalPages) currentPage = totalPages;
            const start = (currentPage - 1) * PAGE_SIZE;
            const end = Math.min(start + PAGE_SIZE, totalItems);

            $('#estimatePaginationInfo').textContent =
                totalItems === 0
                    ? 'Showing 0 of 0 records'
                    : `Showing ${start + 1}\u2013${end} of ${totalItems} records`;

            const container = $('#estimatePaginationButtons');
            const buttons = [];
            buttons.push(`<button ${currentPage === 1 ? 'disabled' : ''} data-page="${currentPage - 1}"><i class="fa-solid fa-chevron-left"></i></button>`);
            for (let i = 1; i <= totalPages; i += 1) {
                if (totalPages > 7 && i !== 1 && i !== totalPages && Math.abs(i - currentPage) > 1) {
                    if (buttons[buttons.length - 1] !== '<span>...</span>') buttons.push('<span>...</span>');
                    continue;
                }
                buttons.push(`<button class="${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`);
            }
            buttons.push(`<button ${currentPage === totalPages ? 'disabled' : ''} data-page="${currentPage + 1}"><i class="fa-solid fa-chevron-right"></i></button>`);
            container.innerHTML = buttons.join('');
        }

        function render() {
            const visible = filteredEstimates();
            const totalItems = visible.length;
            const start = (currentPage - 1) * PAGE_SIZE;
            const pageItems = visible.slice(start, start + PAGE_SIZE);

            updateSummary(visible);

            rows.innerHTML = pageItems.length
                ? pageItems.map((t) => {
                    const gstPct = n(t.cgst_percent) + n(t.sgst_percent) + n(t.igst_percent);
                    const discount = n(t.discount_percent);
                    return `<tr>
                        <td>${formatDate(t.invoice_date)}</td>
                        <td><strong>${escapeHtml(t.invoice_number)}</strong></td>
                        <td>${escapeHtml(t.location || '-')}</td>
                        <td>${escapeHtml(t.bill_to || '-')}</td>
                        <td>${escapeHtml(t.item_name || '-')}</td>
                        <td>${n(t.quantity)}</td>
                        <td>${gstPct}%</td>
                        <td>${discount ? `${discount}%` : '-'}</td>
                        <td><strong>${currency.format(n(t.amount))}</strong></td>
                        <td>
                            <div class="action-buttons">
                                <button type="button" class="print-estimate" data-id="${t.id}" title="Print">
                                    <i class="fa-solid fa-print"></i>
                                </button>
                                <button type="button" class="edit-estimate" data-id="${t.id}" title="Edit">
                                    <i class="fa-solid fa-pen"></i>
                                </button>
                                <button type="button" class="delete-estimate delete-action" data-id="${t.id}" title="Delete">
                                    <i class="fa-solid fa-trash"></i>
                                </button>
                            </div>
                        </td>
                    </tr>`;
                }).join('')
                : '<tr><td class="empty-state" colspan="10">No estimates found.</td></tr>';

            count.textContent = `Showing ${totalItems} transaction${totalItems === 1 ? '' : 's'}`;
            renderPagination(totalItems);
        }

        // ---------- LOCATION MULTI-SELECT ----------
        function updateLocationFilterLabel() {
            const label = $('#estimateLocationFilterLabel');
            if (!label) return;
            if (selectedLocations.size === 0) label.textContent = 'All Locations';
            else if (selectedLocations.size === 1) label.textContent = [...selectedLocations][0];
            else label.textContent = `${selectedLocations.size} locations selected`;
        }

        function renderLocationFilter() {
            const menu = $('#estimateLocationFilterMenu');
            if (!menu) return;

            const allChecked = selectedLocations.size === 0 ? 'checked' : '';
            let html = `<label class="multi-select-option all-option">
                <input type="checkbox" data-location="__all__" ${allChecked}>
                <span>All Locations</span>
            </label>`;

            html += LOCATION_OPTIONS.map((loc) => {
                const checked = selectedLocations.has(loc) ? 'checked' : '';
                return `<label class="multi-select-option">
                    <input type="checkbox" data-location="${escapeHtml(loc)}" ${checked}>
                    <span>${escapeHtml(loc)}</span>
                </label>`;
            }).join('');

            menu.innerHTML = html;
            updateLocationFilterLabel();
        }

        // ---------- CALCULATIONS ----------
        function updateCalculations() {
            const form = $('#estimateForm');
            const qty = n(form.elements.quantity.value);
            const rate = n(form.elements.rate.value);
            const discountPct = n(form.elements.discount_percent.value);
            const grossValue = qty * rate;
            const discountAmt = grossValue * discountPct / 100;
            const valueAfterDiscount = grossValue - discountAmt;
            const gstAmt = ['cgst_percent', 'sgst_percent', 'igst_percent']
                .reduce((sum, name) => sum + valueAfterDiscount * n(form.elements[name].value) / 100, 0);

            $('#estimateCalculatedValue').textContent = currency.format(valueAfterDiscount);
            $('#estimateCalculatedAmount').textContent = currency.format(valueAfterDiscount + gstAmt);
        }

        // ---------- MODAL ----------
        function openModal(estimate) {
            const modal = $('#estimateModal');
            const form = $('#estimateForm');
            form.reset();
            form.dataset.id = estimate ? estimate.id : '';
            $('#estimateModalTitle').textContent = `${estimate ? 'Edit' : 'New'} Estimate`;
            $('#saveEstimateLabel').textContent = `${estimate ? 'Update' : 'Save'} Estimate`;

            if (estimate) {
                Object.entries(estimate).forEach(([name, value]) => {
                    if (form.elements[name]) form.elements[name].value = value == null ? '' : value;
                });
            } else {
                form.elements.invoice_date.value = today();
            }
            updateCalculations();
            modal.classList.add('show');
            modal.setAttribute('aria-hidden', 'false');
        }

        function closeModal() {
            const modal = $('#estimateModal');
            modal.classList.remove('show');
            modal.setAttribute('aria-hidden', 'true');
        }

        function handleSessionExpired() {
            window.alert('Your session has expired. Please log in again.');
            window.location.href = '/';
        }

        // ---------- API ----------
        async function loadEstimates() {
            const response = await fetch(API_URL, { credentials: 'same-origin' });
            if (response.status === 401) return handleSessionExpired();
            if (!response.ok) throw new Error('Unable to load estimates.');
            const data = await response.json();
            const list = Array.isArray(data) ? data : (data.rows || []);
            estimates.splice(0, estimates.length, ...list);
            render();
        }

        async function saveEstimate(event) {
            event.preventDefault();
            const form = event.currentTarget;
            const payload = Object.fromEntries(new FormData(form));
            const response = await fetch(
                form.dataset.id ? `${API_URL}/${form.dataset.id}` : API_URL,
                {
                    method: form.dataset.id ? 'PUT' : 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'same-origin',
                    body: JSON.stringify(payload)
                }
            );
            if (response.status === 401) return handleSessionExpired();
            const result = await response.json().catch(() => ({}));
            if (!response.ok) return window.alert(result.error || 'Unable to save estimate.');
            closeModal();
            await loadEstimates();
        }

        async function deleteEstimate(id) {
            if (!window.confirm('Delete this estimate?')) return;
            const response = await fetch(`${API_URL}/${id}`, {
                method: 'DELETE', credentials: 'same-origin'
            });
            if (response.status === 401) return handleSessionExpired();
            if (!response.ok) return window.alert('Unable to delete estimate.');
            await loadEstimates();
        }

        function printEstimate(estimate) {
            if (!estimate) return;
            const win = window.open('', '_blank', 'width=850,height=750');
            if (!win) return window.alert('Please allow pop-ups to print.');

            const qty = n(estimate.quantity);
            const rate = n(estimate.rate);
            const gross = qty * rate;
            const discPct = n(estimate.discount_percent);
            const discAmt = gross * discPct / 100;
            const taxable = gross - discAmt;
            const gstPct = n(estimate.cgst_percent) + n(estimate.sgst_percent) + n(estimate.igst_percent);

            win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
                <title>Estimate ${escapeHtml(estimate.invoice_number)}</title>
                <style>
                    * { box-sizing: border-box; }
                    body { font-family: Arial, sans-serif; padding: 16px; color: #000; font-size: 12px; }
                    .title { text-align: center; font-size: 16px; font-weight: bold; letter-spacing: 1px; margin-bottom: 8px; }
                    .invoice-box { border: 1.5px solid #000; }
                    table.layout { width: 100%; border-collapse: collapse; }
                    table.layout > tbody > tr > td { border: 1px solid #000; padding: 6px 8px; vertical-align: top; }
                    .company-name { font-weight: bold; font-size: 13px; }
                    .field-label { font-size: 10px; color: #333; }
                    .field-value { font-weight: bold; }
                    table.items { width: 100%; border-collapse: collapse; }
                    table.items th, table.items td { border: 1px solid #000; padding: 4px 6px; font-size: 11px; }
                    table.items th { font-weight: normal; text-align: center; }
                    .right { text-align: right; } .center { text-align: center; }
                    .bold { font-weight: bold; }
                    .note { background: #fffbe6; padding: 6px 8px; border: 1px solid #000; border-top: none; font-size: 11px; }
                </style>
            </head><body>
                <div class="title">ESTIMATE / QUOTATION</div>
                <div class="invoice-box">
                    <table class="layout">
                        <tr>
                            <td style="width:55%;">
                                <div class="company-name">ARNEEL INDUSTRIES 26-27</div>
                                <div>Plot No. 66, Gut No.41,</div>
                                <div>Karodi Industrial Area, Waluj MIDC,</div>
                                <div>Chhatrapati Sambhajinagar - 431136.</div>
                                <div>GSTIN/UIN: 27ELXPK3596P1ZP</div>
                            </td>
                            <td>
                                <span class="field-label">Estimate No.</span><br>
                                <span class="field-value">${escapeHtml(estimate.invoice_number)}</span>
                            </td>
                            <td>
                                <span class="field-label">Date</span><br>
                                <span class="field-value">${formatDate(estimate.invoice_date)}</span>
                            </td>
                        </tr>
                        <tr>
                            <td>
                                <span class="field-label">Party</span><br>
                                <span class="field-value">${escapeHtml(estimate.bill_to || '-')}</span>
                            </td>
                            <td colspan="2">
                                <span class="field-label">Location</span><br>
                                <span class="field-value">${escapeHtml(estimate.location || '-')}</span>
                            </td>
                        </tr>
                    </table>
                    <table class="items">
                        <thead><tr>
                            <th style="width:4%;">#</th>
                            <th>Item Description</th>
                            <th style="width:10%;">HSN</th>
                            <th style="width:8%;">Qty</th>
                            <th style="width:10%;">Rate</th>
                            <th style="width:8%;">Disc %</th>
                            <th style="width:10%;">GST %</th>
                            <th style="width:14%;">Amount</th>
                        </tr></thead>
                        <tbody>
                            <tr>
                                <td class="center">1</td>
                                <td>${escapeHtml(estimate.item_name || '-')}</td>
                                <td class="center">${escapeHtml(estimate.hsn_code || '-')}</td>
                                <td class="right">${qty}</td>
                                <td class="right">${currency.format(rate)}</td>
                                <td class="center">${discPct}%</td>
                                <td class="center">${gstPct}%</td>
                                <td class="right bold">${currency.format(n(estimate.amount))}</td>
                            </tr>
                        </tbody>
                    </table>
                    <table class="layout"><tr>
                        <td style="width:70%;">
                            <span class="field-label">Subtotal</span>: ${currency.format(gross)}<br>
                            <span class="field-label">Discount</span>: -${currency.format(discAmt)}<br>
                            <span class="field-label">Taxable</span>: ${currency.format(taxable)}<br>
                            <span class="field-label">GST</span>: ${currency.format(n(estimate.amount) - taxable)}
                        </td>
                        <td class="right">
                            <span class="field-label">Grand Total</span><br>
                            <span class="bold" style="font-size:14px;">${currency.format(n(estimate.amount))}</span>
                        </td>
                    </tr></table>
                    <div class="note">
                        This is an Estimate / Quotation, not a tax invoice. Prices valid for 15 days from the date of issue.
                    </div>
                </div>
            </body></html>`);
            win.document.close();
            win.focus();
            win.onload = () => win.print();
        }

        // ---------- EVENT WIRING ----------
        const newBtn = $('#newEstimateBtn');
        if (newBtn) newBtn.addEventListener('click', () => openModal());

        const applyBtn = $('#applyEstimateFiltersBtn');
        if (applyBtn) applyBtn.addEventListener('click', () => { currentPage = 1; render(); });

        ['#estimateFromDate', '#estimateToDate'].forEach((sel) => {
            const el = $(sel);
            if (el) el.addEventListener('input', () => { currentPage = 1; render(); });
        });

        rows.addEventListener('click', (event) => {
            const editBtn = event.target.closest('.edit-estimate');
            const delBtn = event.target.closest('.delete-estimate');
            const printBtn = event.target.closest('.print-estimate');
            if (editBtn) openModal(estimates.find((t) => t.id === Number(editBtn.dataset.id)));
            if (delBtn) deleteEstimate(delBtn.dataset.id);
            if (printBtn) printEstimate(estimates.find((t) => t.id === Number(printBtn.dataset.id)));
        });

        const modal = $('#estimateModal');
        if (modal) modal.addEventListener('click', (event) => {
            if (event.target === event.currentTarget || event.target.closest('.close-modal')) closeModal();
        });

        const form = $('#estimateForm');
        if (form) {
            form.addEventListener('input', updateCalculations);
            form.addEventListener('submit', saveEstimate);
        }

        const pagination = $('#estimatePaginationButtons');
        if (pagination) pagination.addEventListener('click', (event) => {
            const btn = event.target.closest('button[data-page]');
            if (!btn || btn.disabled) return;
            currentPage = Number(btn.dataset.page);
            render();
        });

        // Location multi-select
        const locToggle = $('#estimateLocationFilterToggle');
        const locMenu = $('#estimateLocationFilterMenu');
        if (locToggle && locMenu) {
            locToggle.addEventListener('click', (e) => {
                e.stopPropagation();
                locMenu.classList.toggle('show');
            });
            locMenu.addEventListener('change', (e) => {
                const cb = e.target.closest('input[type="checkbox"]');
                if (!cb) return;
                const val = cb.dataset.location;
                if (val === '__all__') selectedLocations.clear();
                else if (cb.checked) selectedLocations.add(val);
                else selectedLocations.delete(val);
                renderLocationFilter();
                currentPage = 1;
                render();
            });
            document.addEventListener('click', (e) => {
                if (!e.target.closest('#estimateLocationFilterWrap')) {
                    locMenu.classList.remove('show');
                }
            });
        }

        // Export to Excel
        const exportBtn = $('#exportEstimateBtn');
        if (exportBtn) exportBtn.addEventListener('click', () => {
            const headers = ['Date', 'Reference No.', 'Location', 'Party Name',
                             'Item Description', 'Quantity', 'GST %', 'Discount %', 'Total Amount'];
            const data = filteredEstimates().map((t) => [
                formatDate(t.invoice_date), t.invoice_number, t.location || '-',
                t.bill_to || '-', t.item_name || '-', n(t.quantity),
                n(t.cgst_percent) + n(t.sgst_percent) + n(t.igst_percent),
                n(t.discount_percent), n(t.amount)
            ]);
            if (typeof XLSX === 'undefined') return window.alert('Excel library not loaded');
            const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Estimates');
            XLSX.writeFile(wb, `Estimates_${new Date().toISOString().slice(0, 10)}.xlsx`);
        });

        renderLocationFilter();

        console.log('[estimate.js] Initialized');
        loadEstimates().catch((error) => {
            rows.innerHTML = '<tr><td class="empty-state" colspan="10">Unable to load estimates.</td></tr>';
            console.error('[estimate.js] Load failed:', error);
        });
    };
}());