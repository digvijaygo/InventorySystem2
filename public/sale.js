(function () {
    'use strict';

    window.initSalePage = function initSalePage() {
        const SALE_ROOT = document.querySelector('.page-view[data-page="sale"]');
        if (!SALE_ROOT) {
            console.warn('[sale.js] Sale root not found — skipping init');
            return;
        }
        if (SALE_ROOT.dataset.initialized === '1') {
            console.log('[sale.js] Already initialized');
            return;
        }
        SALE_ROOT.dataset.initialized = '1';

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

        const $ = (sel) => SALE_ROOT.querySelector(sel);
        const rows = $('#transactionRows');
        const count = $('#recordCount');
        const transactions = [];
        let currentPage = 1;
        let selectedLocations = new Set();

        const COMPANY_DETAILS = {
            name: 'ARNEEL INDUSTRIES 26-27',
            addressLines: ['Plot No. 66, Gut No.41,', 'Karodi Industrial Area,Waluj MIDC,', 'Chhatrapati Sambhajinagar - 431136.'],
            gstin: '27ELXPK3596P1ZP',
            stateName: 'Maharashtra',
            stateCode: '27',
            contact: '9096947530',
            email: 'anilkhoje03@gmail.com',
            jurisdiction: 'SUBJECT TO CHHATRAPATI SAMBHAJI NAGAR JURISDICTION'
        };

        function numberToWordsIndian(num) {
            const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
            const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
            function twoDigits(v) { if (v < 20) return ones[v]; return `${tens[Math.floor(v / 10)]}${v % 10 ? ` ${ones[v % 10]}` : ''}`; }
            function threeDigits(v) { if (v < 100) return twoDigits(v); return `${ones[Math.floor(v / 100)]} Hundred${v % 100 ? ` ${twoDigits(v % 100)}` : ''}`; }
            let value = Math.floor(Math.abs(num));
            if (value === 0) return 'Zero';
            const crore = Math.floor(value / 10000000); value %= 10000000;
            const lakh = Math.floor(value / 100000); value %= 100000;
            const thousand = Math.floor(value / 1000); value %= 1000;
            const hundred = value;
            const parts = [];
            if (crore) parts.push(`${threeDigits(crore)} Crore`);
            if (lakh) parts.push(`${threeDigits(lakh)} Lakh`);
            if (thousand) parts.push(`${threeDigits(thousand)} Thousand`);
            if (hundred) parts.push(threeDigits(hundred));
            return parts.join(' ');
        }

        function amountInWords(amount) { return `INR ${numberToWordsIndian(amount)} Only`; }

        const inrGrouped = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        function inrNumber(v) { return inrGrouped.format(Number(v || 0)); }

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
                if (t.transaction_type !== 'Sale') return false;
                const s = `${t.invoice_number} ${t.bill_to} ${t.item_name} ${t.ewaybill}`.toLowerCase();
                const locationMatch = selectedLocations.size === 0 || selectedLocations.has(t.location || '');
                return (!fromDate || t.invoice_date >= fromDate) &&
                    (!toDate || t.invoice_date <= toDate) &&
                    (product === 'All Products' || t.item_name === product) &&
                    locationMatch &&
                    (!query || s.includes(query));
            });
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
                <td>${escapeHtml(t.ship_to || '-')}</td>
                <td>${escapeHtml(t.item_name)}</td>
                <td>${Number(t.quantity)}</td>
                <td>${escapeHtml(t.hsn_code)}</td>
                <td>${currency.format(t.rate)}</td>
                <td><strong>${currency.format(t.value_amount)}</strong></td>
                <td>${taxCell(t.cgst_amount, t.cgst_percent)}</td>
                <td>${taxCell(t.sgst_amount, t.sgst_percent)}</td>
                <td>${taxCell(t.igst_amount, t.igst_percent)}</td>
                <td><strong>${currency.format(t.amount)}</strong></td>
                <td>${escapeHtml(t.delivery || '-')}</td>
                <td>${escapeHtml(t.dc_number || '-')}</td>
                <td>${escapeHtml(t.ewaybill)}</td>
                <td>${escapeHtml(t.location || '-')}</td>
                <td><div class="action-buttons">
                    <button type="button" class="print-transaction" data-id="${t.id}" title="Print Invoice"><i class="fa-solid fa-print"></i></button>
                    ${t.ewaybill ? `<button type="button" class="print-ewaybill" data-id="${t.id}" title="Print E-Way Bill"><i class="fa-solid fa-truck"></i></button>` : ''}
                    <button type="button" class="edit-transaction" data-id="${t.id}" title="Edit"><i class="fa-solid fa-pen"></i></button>
                    <button type="button" class="delete-transaction delete-action" data-id="${t.id}" title="Delete"><i class="fa-solid fa-trash"></i></button>
                </div></td>
            </tr>`).join('') : '<tr><td class="empty-state" colspan="18">No sales found.</td></tr>';

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
            const modal = $('#saleModal');
            const form = $('#transactionForm');
            form.reset();
            form.dataset.id = transaction ? transaction.id : '';
            form.dataset.type = 'Sale';
            $('#transactionModalTitle').textContent = `${transaction ? 'Edit' : 'New'} Sale`;
            $('#saveTransactionLabel').textContent = `${transaction ? 'Update' : 'Save'} Sale`;
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
            const modal = $('#saleModal');
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
            $('#transactionItems').innerHTML = [...new Set(all.filter(t => t.transaction_type === 'Sale').map((t) => t.item_name))]
                .map((item) => `<option value="${escapeHtml(item)}"></option>`).join('');
            render();
        }

        async function saveTransaction(event) {
            event.preventDefault();
            const form = event.currentTarget;
            const payload = Object.fromEntries(new FormData(form));
            payload.transaction_type = 'Sale';
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

        function printTransaction(transaction) {
            if (!transaction) return;
            const printWindow = window.open('', '_blank', 'width=850,height=750');
            if (!printWindow) return window.alert('Please allow pop-ups to print.');
            const gstRate = Number(transaction.cgst_percent || 0) + Number(transaction.sgst_percent || 0) + Number(transaction.igst_percent || 0);
            const taxRows = [
                Number(transaction.cgst_amount) > 0 ? `<tr><td class="desc-cell right" colspan="8"><em>Output CGST @${Number(transaction.cgst_percent || 0)}%</em></td><td class="right">${Number(transaction.cgst_percent || 0)}%</td><td class="right">${inrNumber(transaction.cgst_amount)}</td></tr>` : '',
                Number(transaction.sgst_amount) > 0 ? `<tr><td class="desc-cell right" colspan="8"><em>Output SGST @${Number(transaction.sgst_percent || 0)}%</em></td><td class="right">${Number(transaction.sgst_percent || 0)}%</td><td class="right">${inrNumber(transaction.sgst_amount)}</td></tr>` : '',
                Number(transaction.igst_amount) > 0 ? `<tr><td class="desc-cell right" colspan="8"><em>Output IGST @${Number(transaction.igst_percent || 0)}%</em></td><td class="right">${Number(transaction.igst_percent || 0)}%</td><td class="right">${inrNumber(transaction.igst_amount)}</td></tr>` : ''
            ].join('');
            printWindow.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Invoice ${escapeHtml(transaction.invoice_number)}</title>
                <style>* { box-sizing: border-box; } body { font-family: Arial, sans-serif; padding: 16px; color: #000; font-size: 12px; } .title { text-align: center; font-size: 16px; font-weight: bold; letter-spacing: 1px; margin-bottom: 8px; } .invoice-box { border: 1.5px solid #000; } table.layout { width: 100%; border-collapse: collapse; } table.layout > tbody > tr > td { border: 1px solid #000; padding: 6px 8px; vertical-align: top; } .company-name { font-weight: bold; font-size: 13px; } .field-label { font-size: 10px; color: #333; } .field-value { font-weight: bold; } .party-name { font-weight: bold; font-size: 12px; } table.items { width: 100%; border-collapse: collapse; } table.items th, table.items td { border: 1px solid #000; padding: 4px 6px; font-size: 11px; } table.items th { font-weight: normal; text-align: center; } .right { text-align: right; } .center { text-align: center; } .bold { font-weight: bold; } table.taxsummary { width: 100%; border-collapse: collapse; } table.taxsummary th, table.taxsummary td { border: 1px solid #000; padding: 4px 6px; font-size: 11px; text-align: center; } .declaration { font-size: 10.5px; padding: 6px 8px; border: 1px solid #000; border-top: none; } .sign-row td { border: 1px solid #000; border-top: none; padding: 18px 8px 6px; font-size: 11px; vertical-align: bottom; } .footer-note { text-align: center; font-size: 10.5px; margin-top: 10px; }</style>
            </head><body>
                <div class="title">TAX INVOICE</div>
                <div class="invoice-box">
                    <table class="layout">
                        <tr>
                            <td style="width:55%;" rowspan="2">
                                <div class="company-name">${escapeHtml(COMPANY_DETAILS.name)}</div>
                                ${COMPANY_DETAILS.addressLines.map((line) => `<div>${escapeHtml(line)}</div>`).join('')}
                                <div>GSTIN/UIN: ${escapeHtml(COMPANY_DETAILS.gstin)}</div>
                                <div>State: ${escapeHtml(COMPANY_DETAILS.stateName)}, Code: ${escapeHtml(COMPANY_DETAILS.stateCode)}</div>
                                <div>Contact: ${escapeHtml(COMPANY_DETAILS.contact)}</div>
                            </td>
                            <td><span class="field-label">Invoice No.</span><br><span class="field-value">${escapeHtml(transaction.invoice_number)}</span></td>
                            <td><span class="field-label">e-Way Bill No.</span><br><span class="field-value">${escapeHtml(transaction.ewaybill || '-')}</span></td>
                            <td><span class="field-label">Dated</span><br><span class="field-value">${formatDate(transaction.invoice_date)}</span></td>
                        </tr>
                        <tr>
                            <td colspan="2"><span class="field-label">Delivery Note</span><br>&nbsp;</td>
                            <td><span class="field-label">Mode/Terms of Payment</span><br>&nbsp;</td>
                        </tr>
                        <tr>
                            <td rowspan="2"><div class="party-name">${escapeHtml(transaction.ship_to || transaction.bill_to || '-')}</div></td>
                            <td colspan="2"><span class="field-label">Buyer's Order No.</span><br>&nbsp;</td>
                            <td><span class="field-label">Dated</span><br>&nbsp;</td>
                        </tr>
                        <tr>
                            <td><span class="field-label">Dispatch Doc No.</span><br><span class="field-value">${escapeHtml(transaction.dc_number || '-')}</span></td>
                            <td colspan="2"><span class="field-label">Delivery Note Date</span><br>&nbsp;</td>
                        </tr>
                        <tr>
                            <td rowspan="2"><div class="party-name">${escapeHtml(transaction.bill_to)}</div></td>
                            <td><span class="field-label">Dispatched through</span><br><span class="field-value">${escapeHtml(transaction.delivery || '-')}</span></td>
                            <td colspan="2"><span class="field-label">Destination</span><br>&nbsp;</td>
                        </tr>
                        <tr><td colspan="3"><span class="field-label">Terms of Delivery</span><br>&nbsp;</td></tr>
                    </table>
                    <table class="items">
                        <thead><tr>
                            <th style="width:4%;">Sl<br>No.</th><th>Description</th><th style="width:9%;">HSN/SAC</th>
                            <th style="width:7%;">GST<br>Rate</th><th style="width:8%;">Quantity</th>
                            <th style="width:10%;">Rate</th><th style="width:6%;">per</th>
                            <th style="width:7%;">Disc. %</th><th style="width:12%;">Amount</th>
                        </tr></thead>
                        <tbody>
                            <tr>
                                <td class="center">1</td><td>${escapeHtml(transaction.item_name)}</td>
                                <td class="center">${escapeHtml(transaction.hsn_code)}</td>
                                <td class="center">${gstRate}%</td>
                                <td class="right">${Number(transaction.quantity)} NOS</td>
                                <td class="right">${inrNumber(transaction.rate)}</td>
                                <td class="center">NOS</td><td></td>
                                <td class="right bold">${inrNumber(transaction.value_amount)}</td>
                            </tr>
                            ${taxRows}
                            <tr>
                                <td colspan="4" class="right bold">Total</td>
                                <td class="right bold">${Number(transaction.quantity)} NOS</td>
                                <td colspan="3"></td>
                                <td class="right bold">₹ ${inrNumber(transaction.amount)}</td>
                            </tr>
                        </tbody>
                    </table>
                    <table class="layout"><tr><td style="width:80%;">Amount in words: <span class="bold">${amountInWords(transaction.amount)}</span></td><td class="right">E. &amp; O.E</td></tr></table>
                    <table class="taxsummary">
                        <thead><tr><th rowspan="2">HSN/SAC</th><th rowspan="2">Taxable Value</th><th colspan="2">CGST</th><th colspan="2">SGST/UTGST</th><th rowspan="2">Total Tax</th></tr>
                        <tr><th>Rate</th><th>Amount</th><th>Rate</th><th>Amount</th></tr></thead>
                        <tbody>
                            <tr>
                                <td>${escapeHtml(transaction.hsn_code)}</td>
                                <td class="right">${inrNumber(transaction.value_amount)}</td>
                                <td>${Number(transaction.cgst_percent || 0)}%</td>
                                <td class="right">${inrNumber(transaction.cgst_amount || 0)}</td>
                                <td>${Number(transaction.sgst_percent || 0)}%</td>
                                <td class="right">${inrNumber(transaction.sgst_amount || 0)}</td>
                                <td class="right">${inrNumber(Number(transaction.cgst_amount || 0) + Number(transaction.sgst_amount || 0) + Number(transaction.igst_amount || 0))}</td>
                            </tr>
                        </tbody>
                    </table>
                    <div class="declaration"><u>Declaration</u><br>We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.</div>
                    <table class="layout"><tr class="sign-row"><td style="width:50%;">Customer's Seal and Signature</td><td class="right">for ${escapeHtml(COMPANY_DETAILS.name)}<br><br><br>Authorised Signatory</td></tr></table>
                </div>
                <div class="footer-note"><div>${escapeHtml(COMPANY_DETAILS.jurisdiction)}</div><div>This is a Computer Generated Invoice</div></div>
            </body></html>`);
            printWindow.document.close();
            printWindow.focus();
            printWindow.onload = () => { printWindow.print(); };
        }

        function printEwaybill(transaction) {
            if (!transaction) return;
            const printWindow = window.open('', '_blank', 'width=800,height=700');
            if (!printWindow) return window.alert('Please allow pop-ups.');
            printWindow.document.write(`<!DOCTYPE html><html><head><title>E-Way Bill ${escapeHtml(transaction.ewaybill)}</title>
                <style>body { font-family: Arial, sans-serif; padding: 24px; color: #111827; } .ewb-box { border: 2px solid #111827; } .ewb-header { background: #123d70; color: #fff; padding: 10px 16px; display: flex; justify-content: space-between; } .ewb-header h1 { font-size: 16px; margin: 0; } .ewb-meta { display: grid; grid-template-columns: 1fr 1fr 1fr; border-bottom: 1px solid #111827; } .ewb-meta div { padding: 8px 14px; border-right: 1px solid #d1d5db; font-size: 12px; } .ewb-meta label { display: block; font-size: 10px; color: #6b7280; margin-bottom: 2px; text-transform: uppercase; } .ewb-parties { display: grid; grid-template-columns: 1fr 1fr; border-bottom: 1px solid #111827; } .ewb-parties div { padding: 10px 14px; font-size: 12px; border-right: 1px solid #d1d5db; } .ewb-parties label { display: block; font-size: 10px; color: #6b7280; margin-bottom: 4px; text-transform: uppercase; } table.items { width: 100%; border-collapse: collapse; } table.items th, table.items td { border: 1px solid #d1d5db; padding: 8px; text-align: left; font-size: 12px; } table.items th { background: #f3f4f6; } .ewb-footer { display: grid; grid-template-columns: 1fr 1fr; border-top: 1px solid #111827; } .ewb-footer div { padding: 10px 14px; font-size: 12px; border-right: 1px solid #d1d5db; } .disclaimer { margin-top: 10px; font-size: 10px; color: #6b7280; }</style>
            </head><body>
                <div class="ewb-box">
                    <div class="ewb-header"><h1>E-WAY BILL</h1><span>EWB No: ${escapeHtml(transaction.ewaybill)}</span></div>
                    <div class="ewb-meta">
                        <div><label>Generated Date</label>${formatDate(transaction.invoice_date)}</div>
                        <div><label>Document No.</label>${escapeHtml(transaction.invoice_number)}</div>
                        <div><label>Supply Type</label>Outward - Supply</div>
                    </div>
                    <div class="ewb-parties">
                        <div><label>From (Supplier)</label><strong>${escapeHtml(transaction.bill_to || '-')}</strong></div>
                        <div><label>To (Ship To)</label><strong>${escapeHtml(transaction.ship_to || transaction.bill_to || '-')}</strong></div>
                    </div>
                    <table class="items">
                        <thead><tr><th>Product</th><th>HSN</th><th>Qty</th><th>Taxable</th><th>CGST</th><th>SGST</th><th>IGST</th><th>Total</th></tr></thead>
                        <tbody><tr>
                            <td>${escapeHtml(transaction.item_name)}</td><td>${escapeHtml(transaction.hsn_code)}</td>
                            <td>${Number(transaction.quantity)}</td>
                            <td>${currency.format(transaction.value_amount)}</td>
                            <td>${currency.format(transaction.cgst_amount)} (${Number(transaction.cgst_percent || 0)}%)</td>
                            <td>${currency.format(transaction.sgst_amount)} (${Number(transaction.sgst_percent || 0)}%)</td>
                            <td>${currency.format(transaction.igst_amount)} (${Number(transaction.igst_percent || 0)}%)</td>
                            <td><strong>${currency.format(transaction.amount)}</strong></td>
                        </tr></tbody>
                    </table>
                    <div class="ewb-footer">
                        <div><label>Delivery</label>${escapeHtml(transaction.delivery || '-')}</div>
                        <div><label>DC Number</label>${escapeHtml(transaction.dc_number || '-')}</div>
                    </div>
                </div>
                <p class="disclaimer">System-generated preview. Not a substitute for the official E-Way Bill.</p>
            </body></html>`);
            printWindow.document.close();
            printWindow.focus();
            printWindow.onload = () => { printWindow.print(); };
        }

        // ---- WIRE EVENT LISTENERS ----
        const newSaleBtn = $('#newSaleBtn');
        if (newSaleBtn) newSaleBtn.addEventListener('click', () => openModal());
        else console.warn('[sale.js] #newSaleBtn not found');

        const applyBtn = $('#applyFiltersBtn');
        if (applyBtn) applyBtn.addEventListener('click', () => { currentPage = 1; render(); });

        ['#fromDate', '#toDate', '#productFilter', '#transactionSearch'].forEach((sel) => {
            const el = $(sel);
            if (el) el.addEventListener('input', () => { currentPage = 1; render(); });
        });

        rows.addEventListener('click', (event) => {
            const editButton = event.target.closest('.edit-transaction');
            const deleteButton = event.target.closest('.delete-transaction');
            const printButton = event.target.closest('.print-transaction');
            const printEwaybillButton = event.target.closest('.print-ewaybill');
            if (editButton) openModal(transactions.find((t) => t.id === Number(editButton.dataset.id)));
            if (deleteButton) deleteTransaction(deleteButton.dataset.id);
            if (printButton) printTransaction(transactions.find((t) => t.id === Number(printButton.dataset.id)));
            if (printEwaybillButton) printEwaybill(transactions.find((t) => t.id === Number(printEwaybillButton.dataset.id)));
        });

        const saleModal = $('#saleModal');
        if (saleModal) saleModal.addEventListener('click', (event) => {
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

        const exportBtn = $('#exportSaleBtn');
        if (exportBtn) exportBtn.addEventListener('click', () => {
            const headers = ['Invoice Date', 'Invoice Number', 'Bill To', 'Ship To', 'Item', 'Quantity', 'HSN Code', 'Rate', 'Value', 'CGST', 'SGST', 'IGST', 'Amount', 'Delivery', 'DC Number', 'E-Way Bill', 'Location'];
            const data = filteredTransactions().map((t) => [
                formatDate(t.invoice_date), t.invoice_number, t.bill_to, t.ship_to || '-', t.item_name,
                Number(t.quantity), t.hsn_code, Number(t.rate), Number(t.value_amount),
                Number(t.cgst_amount), Number(t.sgst_amount), Number(t.igst_amount), Number(t.amount),
                t.delivery || '-', t.dc_number || '-', t.ewaybill || '-', t.location || '-'
            ]);
            if (typeof XLSX === 'undefined') return window.alert('Excel library not loaded');
            const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Sales');
            XLSX.writeFile(wb, `Sales_Report_${new Date().toISOString().slice(0, 10)}.xlsx`);
        });

        // Initial render of location filter (uses fixed LOCATION_OPTIONS)
        renderLocationFilter();

        console.log('[sale.js] Initialized');
        loadTransactions().catch((error) => {
            rows.innerHTML = '<tr><td class="empty-state" colspan="18">Unable to load sales.</td></tr>';
            console.error('[sale.js] Load failed:', error);
        });
    };
}());