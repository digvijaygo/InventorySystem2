(function () {
    'use strict';

    window.initPurchasePage = function initPurchasePage() {
        const PURCHASE_ROOT = document.querySelector('.page-view[data-page="purchase"]');
        if (!PURCHASE_ROOT) {
            console.warn('[purchase.js] Purchase root not found — skipping init');
            return;
        }
        if (PURCHASE_ROOT.dataset.initialized === '1') {
            console.log('[purchase.js] Already initialized');
            return;
        }
        PURCHASE_ROOT.dataset.initialized = '1';

        const API_URL = '/api/purchase-sales';
        const PAGE_SIZE = 10;
        const currency = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
        const LOCATION_OPTIONS = [
        'Arneel industries karodi',
        'Anil industries karodi',
        'Anil industries ghanegoan',
        'Anil industries yavatmal',
        'Kpr projections'
         ];
        const $ = (sel) => PURCHASE_ROOT.querySelector(sel);
        const rows = $('#transactionRows');
        const count = $('#recordCount');
        const transactions = [];
        let currentPage = 1;
        let selectedLocations = new Set();
        

        function escapeHtml(v) {
            return String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
        }
        function today() {
            const d = new Date();
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        }
        function formatDate(v) { return new Date(`${v}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); }
        function taxCell(a, p) { return `${currency.format(Number(a || 0))}<small class="tax-rate">${Number(p || 0)}%</small>`; }

function filteredTransactions() {
    const fromDate = $('#fromDate').value;
    const toDate = $('#toDate').value;
    const product = $('#productFilter').value;
    const query = $('#transactionSearch').value.trim().toLowerCase();
    return transactions.filter((t) => {
        if (t.transaction_type !== 'Purchase') return false;
        const s = `${t.invoice_number} ${t.bill_to} ${t.item_name} ${t.ewaybill}`.toLowerCase();
        const locationMatch = selectedLocations.size === 0 ||
            selectedLocations.has(t.location || '');
        return (!fromDate || t.invoice_date >= fromDate) &&
            (!toDate || t.invoice_date <= toDate) &&
            (product === 'All Products' || t.item_name === product) &&
            locationMatch &&
            (!query || s.includes(query));
    });
}
function renderLocationFilter() {
    const menu = $('#locationFilterMenu');
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

function updateLocationFilterLabel() {
    const label = $('#locationFilterLabel');
    if (!label) return;
    if (selectedLocations.size === 0) {
        label.textContent = 'All Locations';
    } else if (selectedLocations.size === 1) {
        label.textContent = [...selectedLocations][0];
    } else {
        label.textContent = `${selectedLocations.size} locations selected`;
    }
}

        function renderPagination(totalItems) {
            const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
            if (currentPage > totalPages) currentPage = totalPages;
            const start = (currentPage - 1) * PAGE_SIZE;
            const end = Math.min(start + PAGE_SIZE, totalItems);
            $('#paginationInfo').textContent = totalItems === 0 ? 'Showing 0 of 0 records' : `Showing ${start + 1}\u2013${end} of ${totalItems} records`;
            const container = $('#paginationButtons');
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
            const visible = filteredTransactions();
            const totalItems = visible.length;
            const start = (currentPage - 1) * PAGE_SIZE;
            const pageItems = visible.slice(start, start + PAGE_SIZE);

            rows.innerHTML = pageItems.length ? pageItems.map((t) => `<tr>
                <td>${formatDate(t.invoice_date)}</td>
                <td><strong>${escapeHtml(t.invoice_number)}</strong></td>
                <td>${escapeHtml(t.bill_to)}</td>
                <td>${escapeHtml(t.item_name)}</td>
                <td>${Number(t.quantity)}</td>
                <td>${escapeHtml(t.hsn_code)}</td>
                <td>${currency.format(t.rate)}</td>
                <td><strong>${currency.format(t.value_amount)}</strong></td>
                <td>${taxCell(t.cgst_amount, t.cgst_percent)}</td>
                <td>${taxCell(t.sgst_amount, t.sgst_percent)}</td>
                <td>${taxCell(t.igst_amount, t.igst_percent)}</td>
                <td><strong>${currency.format(t.amount)}</strong></td>
                <td>${escapeHtml(t.ewaybill)}</td>
                <td>${escapeHtml(t.location || '-')}</td>
                <td><div class="action-buttons">
                    <button type="button" class="edit-transaction" data-id="${t.id}" title="Edit"><i class="fa-solid fa-pen"></i></button>
                    <button type="button" class="delete-transaction delete-action" data-id="${t.id}" title="Delete"><i class="fa-solid fa-trash"></i></button>
                </div></td>
            </tr>`).join('') : '<tr><td class="empty-state" colspan="15">No purchases found.</td></tr>';

            count.textContent = `Showing ${totalItems} transaction${totalItems === 1 ? '' : 's'}`;
            renderPagination(totalItems);
        }

        function updateCalculations() {
            const form = $('#transactionForm');
            const value = Number(form.elements.quantity.value || 0) * Number(form.elements.rate.value || 0);
            const gst = ['cgst_percent', 'sgst_percent', 'igst_percent'].reduce((total, name) => total + value * Number(form.elements[name].value || 0) / 100, 0);
            $('#calculatedValue').textContent = currency.format(value);
            $('#calculatedAmount').textContent = currency.format(value + gst);
        }

        function openModal(transaction) {
            const modal = $('#purchaseModal');
            const form = $('#transactionForm');
            form.reset();
            form.dataset.id = transaction ? transaction.id : '';
            form.dataset.type = 'Purchase';
            $('#transactionModalTitle').textContent = `${transaction ? 'Edit' : 'New'} Purchase`;
            $('#saveTransactionLabel').textContent = `${transaction ? 'Update' : 'Save'} Purchase`;
            if (transaction) {
                Object.entries(transaction).forEach(([name, value]) => {
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
            const modal = $('#purchaseModal');
            modal.classList.remove('show');
            modal.setAttribute('aria-hidden', 'true');
        }

        function handleSessionExpired() {
            window.alert('Your session has expired. Please log in again.');
            window.location.href = '/';
        }

        async function loadTransactions() {
            const response = await fetch(API_URL, { credentials: 'same-origin' });
            if (response.status === 401) return handleSessionExpired();
            if (!response.ok) throw new Error('Unable to load transactions.');
            const all = await response.json();
            transactions.splice(0, transactions.length, ...all);
            $('#transactionItems').innerHTML = [...new Set(all.filter(t => t.transaction_type === 'Purchase').map((t) => t.item_name))]
                .map((item) => `<option value="${escapeHtml(item)}"></option>`).join('');
            render();

renderLocationFilter();
        }

        async function saveTransaction(event) {
            event.preventDefault();
            const form = event.currentTarget;
            const payload = Object.fromEntries(new FormData(form));
            payload.transaction_type = 'Purchase';
            const response = await fetch(form.dataset.id ? `${API_URL}/${form.dataset.id}` : API_URL, {
                method: form.dataset.id ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify(payload)
            });
            if (response.status === 401) return handleSessionExpired();
            const result = await response.json().catch(() => ({}));
            if (!response.ok) return window.alert(result.error || 'Unable to save transaction.');
            closeModal();
            await loadTransactions();
        }

        async function deleteTransaction(id) {
            if (!window.confirm('Delete this transaction?')) return;
            const response = await fetch(`${API_URL}/${id}`, { method: 'DELETE', credentials: 'same-origin' });
            if (response.status === 401) return handleSessionExpired();
            if (!response.ok) return window.alert('Unable to delete transaction.');
            await loadTransactions();
        }

        // ---- WIRE EVENT LISTENERS ----
        const newPurchaseBtn = $('#newPurchaseBtn');
        if (newPurchaseBtn) newPurchaseBtn.addEventListener('click', () => openModal());
        else console.warn('[purchase.js] #newPurchaseBtn not found');

        const applyBtn = $('#applyFiltersBtn');
        if (applyBtn) applyBtn.addEventListener('click', () => { currentPage = 1; render(); });

        ['#fromDate', '#toDate', '#productFilter', '#transactionSearch'].forEach((sel) => {
            const el = $(sel);
            if (el) el.addEventListener('input', () => { currentPage = 1; render(); });
        });

        rows.addEventListener('click', (event) => {
            const editButton = event.target.closest('.edit-transaction');
            const deleteButton = event.target.closest('.delete-transaction');
            if (editButton) openModal(transactions.find((t) => t.id === Number(editButton.dataset.id)));
            if (deleteButton) deleteTransaction(deleteButton.dataset.id);
        });

        const purchaseModal = $('#purchaseModal');
        if (purchaseModal) purchaseModal.addEventListener('click', (event) => {
            if (event.target === event.currentTarget || event.target.closest('.close-modal')) closeModal();
        });

        const form = $('#transactionForm');
        if (form) {
            form.addEventListener('input', updateCalculations);
            form.addEventListener('submit', saveTransaction);
        }

        const paginationButtons = $('#paginationButtons');
        if (paginationButtons) paginationButtons.addEventListener('click', (event) => {
            const button = event.target.closest('button[data-page]');
            if (!button || button.disabled) return;
            currentPage = Number(button.dataset.page);
            render();
        });

        const exportBtn = $('#exportPurchaseBtn');
        if (exportBtn) exportBtn.addEventListener('click', () => {
        const headers = ['Invoice Date', 'Invoice Number', 'Bill To', 'Item', 'Quantity', 'HSN Code', 'Rate', 'Value', 'CGST', 'SGST', 'IGST', 'Amount', 'E-Way Bill', 'Location'];
        const data = filteredTransactions().map((t) => [
            formatDate(t.invoice_date), t.invoice_number, t.bill_to, t.item_name,
            Number(t.quantity), t.hsn_code, Number(t.rate), Number(t.value_amount),
            Number(t.cgst_amount), Number(t.sgst_amount), Number(t.igst_amount), Number(t.amount),
            t.ewaybill || '-', t.location || '-'
        ]);
            if (typeof XLSX === 'undefined') return window.alert('Excel library not loaded');
            const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Purchases');
            XLSX.writeFile(wb, `Purchase_Report_${new Date().toISOString().slice(0, 10)}.xlsx`);
        });

        // Location multi-select
const locToggle = $('#locationFilterToggle');
const locMenu = $('#locationFilterMenu');
if (locToggle && locMenu) {
    locToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        locMenu.classList.toggle('show');
    });

    locMenu.addEventListener('change', (e) => {
        const cb = e.target.closest('input[type="checkbox"]');
        if (!cb) return;
        const val = cb.dataset.location;
        if (val === '__all__') {
            selectedLocations.clear();
        } else {
            if (cb.checked) selectedLocations.add(val);
            else selectedLocations.delete(val);
        }
        renderLocationFilter();
        currentPage = 1;
        render();
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('#locationFilterWrap')) {
            locMenu.classList.remove('show');
        }
    });
}
        // Initial render of location filter (uses fixed LOCATION_OPTIONS)
        renderLocationFilter();
        
        console.log('[purchase.js] Initialized');
        loadTransactions().catch((error) => {
            rows.innerHTML = '<tr><td class="empty-state" colspan="14">Unable to load purchases.</td></tr>';
            console.error('[purchase.js] Load failed:', error);
        });
    };
}());