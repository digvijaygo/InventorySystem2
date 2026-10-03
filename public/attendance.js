(function () {
    'use strict';

    const STORAGE_KEY = 'attendance_payment_records_v2';
    const ATTENDANCE_API = '/api/attendance-employees';
    const currency = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
    const table = document.querySelector('.attendance-table');
    const tableHead = table.querySelector('thead tr');
    const tableBody = table.querySelector('tbody');
    const dailyTableBody = document.querySelector('.daily-table tbody');
    const detailsModal = document.querySelector('.employee-details');
    const searchInput = document.querySelector('.search-box input');
    const departmentFilter = document.querySelectorAll('.filter-select')[0];
    const paymentFilter = document.querySelectorAll('.filter-select')[1];
    const locationSelector = document.querySelector('.location-selector');
    const monthSelector = document.querySelector('.month-selector');
    const yearSelector = document.querySelector('.year-selector');
    const summaryValues = document.querySelectorAll('.summary-card strong');
    const statusNames = { P: 'Present', A: 'Absent', H: 'Holiday' };
    const statusClasses = { P: 'present', A: 'absent', H: 'holiday' };
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    let page = 0;
    let employeePage = 0;
    let selectedId = null;

    // ⚠️ IMPORTANT: Start EMPTY. DB is the source of truth.
    // We do not preload from localStorage, otherwise stale rows reappear
    // even after they've been deleted from the DB.
    let records = [];

    function parseMoney(value) { return Number(String(value).replace(/[^0-9.-]/g, '')) || 0; }
    function computeHours(inTime, outTime) {
        if (!inTime || !outTime) return '';
        const [inHour, inMinute] = String(inTime).split(':').map(Number);
        const [outHour, outMinute] = String(outTime).split(':').map(Number);
        if ([inHour, inMinute, outHour, outMinute].some((part) => Number.isNaN(part))) return '';
        let minutes = (outHour * 60 + outMinute) - (inHour * 60 + inMinute);
        if (minutes < 0) minutes += 24 * 60;
        return Math.round((minutes / 60) * 100) / 100;
    }
    function selectedPeriod() { return `${yearSelector.value}-${monthSelector.value}`; }
    function selectedLocation() { return locationSelector ? locationSelector.value : ''; }
    function daysInMonth() { return new Date(Number(yearSelector.value), Number(monthSelector.value), 0).getDate(); }
    function isoDate(day) { return `${selectedPeriod()}-${String(day).padStart(2, '0')}`; }
    function displayDate(value) { const date = new Date(`${value}T00:00:00`); return `${date.toLocaleDateString('en-US', { weekday: 'short' })} ${String(date.getDate()).padStart(2, '0')}-${monthNames[date.getMonth()]}`; }
    function validDate(value) { return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : isoDate(1); }
    function isFutureDate(value) { const today = new Date(); const localToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`; return value > localToday; }
    function isBeforeJoining(record, value) { return record.joiningDate && value < record.joiningDate; }
    function escapeHtml(value) { return String(value).replace(/[&<>\"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;' }[character])); }
    function getMonthDays(record) { const daysByDate = new Map(record.daily.map((day) => [day.date, day])); return Array.from({ length: daysInMonth() }, (_, index) => daysByDate.get(isoDate(index + 1))); }

    // localStorage is now ONLY a read-only fallback if the API fails.
    function loadCachedRecords() {
        try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
            if (Array.isArray(saved)) return saved;
        } catch (error) {
            localStorage.removeItem(STORAGE_KEY);
        }
        return [];
    }

    async function saveRecords(message) {
        // Always update local cache first so it stays in sync
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(records)); } catch (e) {}

        try {
            const response = await fetch(`${ATTENDANCE_API}/bulk`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ employees: records })
            });
            if (!response.ok) throw new Error('Attendance database save failed');
        } catch (error) {
            showMessage('Saved locally; database unavailable');
            return;
        }
        if (message) showMessage(message);
    }

    async function loadDatabaseRecords() {
        try {
            // Cache-bust so we never get a stale 304
            const response = await fetch(`${ATTENDANCE_API}?_=${Date.now()}`, {
                credentials: 'same-origin',
                cache: 'no-store'
            });

            if (response.status === 401) {
                window.alert('Your session has expired. Please log in again.');
                window.location.href = '/';
                return;
            }
            if (!response.ok) throw new Error('Attendance database unavailable');

            const databaseRecords = await response.json();

            // DB is the single source of truth.
            records = Array.isArray(databaseRecords) ? databaseRecords : [];

            // Keep localStorage in sync — clear it if DB is empty.
            if (records.length) {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
            } else {
                localStorage.removeItem(STORAGE_KEY);
            }

            // Rebuild tbody rows
            tableBody.innerHTML = '';
            records.forEach(() => {
                const row = document.createElement('tr');
                row.className = 'employee-row';
                row.innerHTML = '<td class="employee-name"><div class="employee-info"><div class="avatar"></div><div><strong></strong><small></small></div></div></td><td class="total"></td><td class="paid"></td><td class="due"></td>';
                tableBody.appendChild(row);
            });

            normalizeMonthRecords();
            renderMonthlyRows();
            renderSummary();
        } catch (error) {
            // API failed — fall back to whatever is cached locally.
            const cached = loadCachedRecords();
            if (cached.length) {
                records = cached;
                tableBody.innerHTML = '';
                records.forEach(() => {
                    const row = document.createElement('tr');
                    row.className = 'employee-row';
                    row.innerHTML = '<td class="employee-name"><div class="employee-info"><div class="avatar"></div><div><strong></strong><small></small></div></div></td><td class="total"></td><td class="paid"></td><td class="due"></td>';
                    tableBody.appendChild(row);
                });
                normalizeMonthRecords();
                renderMonthlyRows();
                renderSummary();
                showMessage('Using offline attendance data');
            } else {
                records = [];
                tableBody.innerHTML = '';
                renderMonthlyRows();
                renderSummary();
                showMessage('No attendance data available');
            }
        }
    }

    function getTotals(record) {
        const present = getMonthDays(record).filter((day) => day.status === 'P' && !isFutureDate(day.date));
        const total = present.reduce((sum, day) => sum + Number(day.rate || 0) * Number(day.hours || 0), 0);
        return { total, hours: present.reduce((sum, day) => sum + Number(day.hours || 0), 0), present: present.length, due: Math.max(0, total - Number(record.paid || 0)) };
    }
    function dailyPay(day) { return day.rate !== '' && day.hours !== '' && Number.isFinite(Number(day.rate)) && Number.isFinite(Number(day.hours)) ? currency.format(Number(day.rate) * Number(day.hours)) : ''; }
    function matchesFilters(record, totals) {
        const query = searchInput.value.trim().toLowerCase();
        const payment = paymentFilter.value;
        const loc = selectedLocation();
        return (!query || `${record.name} ${record.id}`.toLowerCase().includes(query)) &&
            (departmentFilter.value === 'All Departments' || record.department === departmentFilter.value) &&
            (!loc || record.location === loc) &&
            (payment === 'All Payment Status' || (payment === 'Paid' && totals.due === 0) || (payment === 'Partially Paid' && record.paid > 0 && totals.due > 0) || (payment === 'Pending' && record.paid === 0));
    }

    function renderDayHeaders() {
        tableHead.querySelectorAll('.dynamic-day').forEach((cell) => cell.remove());
        const anchor = tableHead.querySelector('.employee-column');
        let previous = anchor;
        const start = page * 10 + 1;
        for (let day = start; day <= Math.min(start + 9, daysInMonth()); day++) {
            const cell = document.createElement('th'); cell.className = 'dynamic-day'; cell.textContent = displayDate(isoDate(day)); previous.after(cell); previous = cell;
        }
        document.querySelector('#day-page-label').textContent = `Days ${start}-${Math.min(start + 9, daysInMonth())}`;
        document.querySelector('#previous-days').disabled = page === 0;
        document.querySelector('#next-days').disabled = start + 10 > daysInMonth();
    }

    function renderMonthlyRows() {
        renderDayHeaders();
        const start = page * 10;
        const visibleRows = tableBody.querySelectorAll('.employee-row');
        visibleRows.forEach((row, index) => {
            const record = records[index];
            if (!record) { row.hidden = true; return; }
            const monthDays = getMonthDays(record);
            row.dataset.employeeId = record.id;
            const matchingRecords = records.filter((item) => matchesFilters(item, getTotals(item)));
            const matchingIndex = matchingRecords.findIndex((item) => item.id === record.id);
            row.hidden = matchingIndex === -1 || Math.floor(matchingIndex / 10) !== employeePage;
            const name = row.querySelector('.employee-info strong');
            name.textContent = record.name;
            row.querySelector('.employee-info small').textContent = record.department || '';
            row.querySelector('.avatar').textContent = record.name.split(' ').map((part) => part[0]).join('').slice(0, 2);
            const totalCellIndex = Array.from(row.cells).findIndex((cell) => cell.classList.contains('total'));
            Array.from(row.cells).slice(1, totalCellIndex).forEach((cell) => cell.remove());
            const anchor = row.querySelector('.employee-name');
            let previous = anchor;
            monthDays.slice(start, start + 10).forEach((day) => {
                const cell = document.createElement('td');
                cell.className = 'dynamic-day';
                cell.innerHTML = isFutureDate(day.date) || isBeforeJoining(record, day.date) ? '<span class="status empty-status" aria-label="Unavailable date"></span>' : day.status ? `<span class="status ${statusClasses[day.status]}">${day.status}</span>` : '';
                previous.after(cell); previous = cell;
            });
            const totals = getTotals(record);
            const hoursCell = document.createElement('td'); hoursCell.className = 'monthly-hours'; hoursCell.textContent = totals.hours ? `${totals.hours.toFixed(1)} hrs` : ''; previous.after(hoursCell); previous = hoursCell;
            const daysCell = document.createElement('td'); daysCell.className = 'working-days'; daysCell.textContent = totals.present || ''; previous.after(daysCell); previous = daysCell;
            const paidCell = row.querySelector('.paid');
            if (paidCell) paidCell.textContent = Number(record.paid) ? currency.format(record.paid) : '';
            if (!paidCell) {
                const newPaidCell = document.createElement('td');
                newPaidCell.className = 'paid';
                newPaidCell.textContent = Number(record.paid) ? currency.format(record.paid) : '';
                row.querySelector('.total').after(newPaidCell);
            }
            const hasAttendanceData = monthDays.some((day) => day.status);
            row.querySelector('.total').textContent = hasAttendanceData ? currency.format(totals.total) : '';
            const balance = row.querySelector('.paid-status, .due');
            balance.textContent = totals.due ? currency.format(totals.due) : '';
            balance.className = totals.due ? 'due' : 'paid-status';
        });
        const matchingCount = records.filter((record) => matchesFilters(record, getTotals(record))).length;
        const totalPages = Math.max(1, Math.ceil(matchingCount / 10));
        document.querySelector('#employee-page-label').textContent = `Employees ${matchingCount ? employeePage * 10 + 1 : 0}-${Math.min((employeePage + 1) * 10, matchingCount)} of ${matchingCount}`;
        document.querySelector('#previous-employees').disabled = employeePage === 0;
        document.querySelector('#next-employees').disabled = employeePage >= totalPages - 1;
    }

    function renderSummary() {
        const visibleRecords = records.filter((record) => {
            const loc = selectedLocation();
            return !loc || record.location === loc;
        });
        const totals = visibleRecords.reduce((sum, record) => { const value = getTotals(record); sum.payable += value.total; sum.paid += Number(record.paid || 0); sum.due += value.due; return sum; }, { payable: 0, paid: 0, due: 0 });
        summaryValues[0].textContent = visibleRecords.length;
        summaryValues[1].textContent = visibleRecords.filter((record) => getTotals(record).present > 0).length;
        summaryValues[2].textContent = daysInMonth();
        summaryValues[3].textContent = currency.format(totals.payable);
        summaryValues[4].textContent = currency.format(totals.paid);
        summaryValues[5].textContent = currency.format(totals.due);
    }

    function showMessage(message) { let toast = document.querySelector('.attendance-toast'); if (!toast) { toast = document.createElement('div'); toast.className = 'attendance-toast'; document.body.appendChild(toast); } toast.textContent = message; toast.classList.add('visible'); clearTimeout(toast.timeout); toast.timeout = setTimeout(() => toast.classList.remove('visible'), 2200); }
    function updateDetailsSummary(record) { const totals = getTotals(record); const values = document.querySelectorAll('.employee-summary strong'); values[0].textContent = `${totals.hours.toFixed(1)} hrs`; values[1].textContent = totals.present; values[2].textContent = currency.format(totals.total); values[3].textContent = currency.format(totals.due); document.querySelector('#paid-amount').value = Number(record.paid || 0); }
    function cycleStatus(day) { day.status = { P: 'A', A: 'H', H: 'P' }[day.status] || 'P'; if (day.status !== 'P') { day.hours = 0; day.inTime = ''; day.outTime = ''; } }
    function renderDetails(record, dayIndex) {
        selectedId = record.id; detailsModal.hidden = false; document.body.classList.add('modal-open'); updateDetailsSummary(record);
        document.querySelector('.large-avatar').textContent = record.name.split(' ').map((part) => part[0]).join('').slice(0, 2);
        document.querySelector('.selected-employee h2').textContent = record.name;
        document.querySelector('.selected-employee p').textContent = `${record.department}${record.location ? ' • ' + record.location : ''} • Employee ID: ${record.id}`;
        dailyTableBody.innerHTML = getMonthDays(record).map((day, index) => {
            const unavailable = isFutureDate(day.date) || isBeforeJoining(record, day.date);
            const disabled = unavailable ? ' disabled' : '';
            const value = (field) => unavailable ? '' : (day[field] || '');
            const statusButton = unavailable ? '<span class="empty-day-box" aria-label="Unavailable date"></span>' : `<button type="button" class="status-badge ${day.status ? `${statusClasses[day.status]}-badge` : 'pending-badge'} day-status">${day.status ? statusNames[day.status] : 'Mark Present'}</button>`;
            return `<tr data-date="${day.date}"${Number.isInteger(dayIndex) && index !== dayIndex ? ' hidden' : ''}><td>${displayDate(day.date)}</td><td>${statusButton}</td><td><input class="rate-input" type="number" min="0" step="1" value="${value('rate')}"${disabled}></td><td><input class="in-time-input" type="time" value="${value('inTime')}"${disabled}></td><td><input class="out-time-input" type="time" value="${value('outTime')}"${disabled}></td><td><input class="hours-input" type="number" min="0" max="24" step="0.5" value="${value('hours')}" readonly${disabled}></td><td class="daily-pay">${unavailable ? '' : dailyPay(day)}</td><td><input class="remarks-input" type="text" value="${escapeHtml(value('remarks'))}"${disabled}></td></tr>`;
        }).join('');
    }
    function closeDetails() { detailsModal.hidden = true; document.body.classList.remove('modal-open'); }
    function addEmployee() {
        document.querySelector('#employee-form-overlay').hidden = false;
        document.querySelector('#new-employee-name').focus();
    }
    function closeEmployeeForm() { document.querySelector('#employee-form-overlay').hidden = true; }
    function createEmployee(event) {
        event.preventDefault();
        const nameInput = document.querySelector('#new-employee-name');
        const departmentInput = document.querySelector('#new-employee-department');
        const locationInput = document.querySelector('#new-employee-location');
        const startDateInput = document.querySelector('#new-employee-start-date');
        const name = nameInput.value.trim();
        const department = departmentInput.value.trim();
        const location = locationInput ? locationInput.value.trim() : '';
        const joiningDate = startDateInput.value;
        if (!name || !department || !joiningDate) return;
        records.push({ id: `EMP${String(records.length + 1).padStart(3, '0')}`, name: name.trim(), department: department.trim(), location, joiningDate, paid: 0, daily: Array.from({ length: daysInMonth() }, (_, index) => ({ date: isoDate(index + 1), status: '', rate: '', hours: '', inTime: '', outTime: '', remarks: '' })) });
        const row = document.createElement('tr'); row.className = 'employee-row'; row.innerHTML = '<td class="employee-name"><div class="employee-info"><div class="avatar"></div><div><strong></strong><small></small></div></div></td><td class="total"></td><td class="paid"></td><td class="due"></td>'; tableBody.appendChild(row);
        renderMonthlyRows();
        renderSummary();
        saveRecords('Employee added');
        document.querySelector('#employee-form').reset();
        document.querySelector('#new-employee-department').value = 'Production';
        closeEmployeeForm();
    }

    /* =========================================================
       EXCEL EXPORT
    ========================================================== */

    function buildSummarySheet() {
        const loc = selectedLocation();
        return records
            .filter((record) => !loc || record.location === loc)
            .map((record) => {
                const totals = getTotals(record);
                return {
                    'Employee ID': record.id,
                    'Employee Name': record.name,
                    'Department': record.department || '',
                    'Location': record.location || '',
                    'Joining Date': record.joiningDate || '',
                    'Month': selectedPeriod(),
                    'Present Days': totals.present,
                    'Monthly Hours': Number(totals.hours.toFixed(2)),
                    'Total Payable': Number(totals.total.toFixed(2)),
                    'Paid Amount': Number(record.paid || 0),
                    'Due Amount': Number(totals.due.toFixed(2))
                };
            });
    }

    function buildDailySheet() {
        const rows = [];
        const loc = selectedLocation();
        records
            .filter((record) => !loc || record.location === loc)
            .forEach((record) => {
                getMonthDays(record).forEach((day) => {
                    if (!day) return;
                    if (!day.status && !day.rate && !day.hours && !day.inTime && !day.outTime && !day.remarks) return;
                    rows.push({
                        'Employee ID': record.id,
                        'Employee Name': record.name,
                        'Department': record.department || '',
                        'Location': record.location || '',
                        'Date': day.date || '',
                        'Status': day.status || '',
                        'Rate': day.rate === '' ? '' : Number(day.rate),
                        'In Time': day.inTime || '',
                        'Out Time': day.outTime || '',
                        'Hours': day.hours === '' ? '' : Number(day.hours),
                        'Daily Pay': (day.rate !== '' && day.hours !== '') ? Number(day.rate) * Number(day.hours) : '',
                        'Remarks': day.remarks || ''
                    });
                });
            });
        return rows;
    }

    function exportToExcel() {
        if (typeof XLSX === 'undefined') { showMessage('Excel library not loaded'); return; }
        const workbook = XLSX.utils.book_new();
        const summarySheet = XLSX.utils.json_to_sheet(buildSummarySheet());
        const dailySheet = XLSX.utils.json_to_sheet(buildDailySheet());
        summarySheet['!cols'] = [{ wch: 12 }, { wch: 22 }, { wch: 16 }, { wch: 22 }, { wch: 14 }, { wch: 12 }, { wch: 13 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
        dailySheet['!cols'] = [{ wch: 12 }, { wch: 22 }, { wch: 16 }, { wch: 22 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 22 }];
        XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');
        XLSX.utils.book_append_sheet(workbook, dailySheet, 'Daily Details');
        XLSX.writeFile(workbook, `attendance-${selectedPeriod()}.xlsx`);
        showMessage('Excel exported');
    }

    /* =========================================================
       EXCEL IMPORT
    ========================================================== */

    function importFromWorkbook(workbook) {
        const dailySheetName = workbook.SheetNames.find((name) => /daily/i.test(name)) || workbook.SheetNames[0];
        const summarySheetName = workbook.SheetNames.find((name) => /summary/i.test(name));
        const dailyRows = XLSX.utils.sheet_to_json(workbook.Sheets[dailySheetName], { defval: '' });
        const summaryRows = summarySheetName ? XLSX.utils.sheet_to_json(workbook.Sheets[summarySheetName], { defval: '' }) : [];
        if (!dailyRows.length && !summaryRows.length) { showMessage('No data found in the workbook'); return; }
        const byId = new Map();

        summaryRows.forEach((row) => {
            const id = String(row['Employee ID'] || '').trim();
            if (!id) return;
            byId.set(id, {
                id,
                name: String(row['Employee Name'] || '').trim() || id,
                department: String(row['Department'] || '').trim(),
                location: String(row['Location'] || '').trim(),
                joiningDate: validDate(String(row['Joining Date'] || '')),
                paid: parseMoney(row['Paid Amount']),
                daily: []
            });
        });

        dailyRows.forEach((row) => {
            const id = String(row['Employee ID'] || '').trim();
            if (!id) return;
            if (!byId.has(id)) {
                byId.set(id, { id, name: String(row['Employee Name'] || '').trim() || id, department: String(row['Department'] || '').trim(), location: String(row['Location'] || '').trim(), joiningDate: isoDate(1), paid: 0, daily: [] });
            }
            const record = byId.get(id);
            const date = String(row['Date'] || '').trim();
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
            const status = String(row['Status'] || '').trim().toUpperCase();
            const rateRaw = row['Rate'];
            const hoursRaw = row['Hours'];
            record.daily.push({
                date,
                status: ['P', 'A', 'H'].includes(status) ? status : (status === 'PRESENT' ? 'P' : status === 'ABSENT' ? 'A' : status === 'HOLIDAY' ? 'H' : ''),
                rate: rateRaw === '' ? '' : Number(rateRaw),
                inTime: String(row['In Time'] || ''),
                outTime: String(row['Out Time'] || ''),
                hours: hoursRaw === '' ? '' : Number(hoursRaw),
                remarks: String(row['Remarks'] || '')
            });
        });

        const imported = Array.from(byId.values());
        imported.forEach((record) => { if (!Array.isArray(record.daily)) record.daily = []; });
        if (!imported.length) { showMessage('No valid records in workbook'); return; }
        records = imported;
        normalizeMonthRecords();
        tableBody.innerHTML = '';
        records.forEach(() => { const row = document.createElement('tr'); row.className = 'employee-row'; row.innerHTML = '<td class="employee-name"><div class="employee-info"><div class="avatar"></div><div><strong></strong><small></small></div></div></td><td class="total"></td><td class="paid"></td><td class="due"></td>'; tableBody.appendChild(row); });
        renderMonthlyRows();
        renderSummary();
        saveRecords('Attendance imported');
    }

    function importFile(file) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            const fileName = (file.name || '').toLowerCase();
            if (fileName.endsWith('.json')) {
                try {
                    const imported = JSON.parse(event.target.result);
                    if (!Array.isArray(imported)) throw new Error('bad json');
                    records = imported;
                    normalizeMonthRecords();
                    tableBody.innerHTML = '';
                    records.forEach(() => { const row = document.createElement('tr'); row.className = 'employee-row'; row.innerHTML = '<td class="employee-name"><div class="employee-info"><div class="avatar"></div><div><strong></strong><small></small></div></div></td><td class="total"></td><td class="paid"></td><td class="due"></td>'; tableBody.appendChild(row); });
                    renderMonthlyRows();
                    renderSummary();
                    saveRecords('Attendance imported');
                } catch (error) { showMessage('Invalid JSON file'); }
                return;
            }
            if (typeof XLSX === 'undefined') { showMessage('Excel library not loaded'); return; }
            try {
                const data = new Uint8Array(event.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                importFromWorkbook(workbook);
            } catch (error) { showMessage('Could not read the Excel file'); }
        };
        if ((file.name || '').toLowerCase().endsWith('.json')) reader.readAsText(file);
        else reader.readAsArrayBuffer(file);
    }

    /* ========== EVENT WIRING ========== */

    document.querySelector('#export-button').addEventListener('click', exportToExcel);
    document.querySelector('#import-button').addEventListener('click', () => document.querySelector('#import-file').click());
    document.querySelector('#import-file').addEventListener('change', (event) => { if (event.target.files[0]) importFile(event.target.files[0]); event.target.value = ''; });

    document.querySelector('#employee-form').addEventListener('submit', createEmployee);
    document.querySelector('#employee-form-close').addEventListener('click', closeEmployeeForm);
    document.querySelector('#employee-form-cancel').addEventListener('click', closeEmployeeForm);
    detailsModal.querySelector('.modal-close').addEventListener('click', closeDetails);
    detailsModal.addEventListener('click', (event) => { if (event.target === detailsModal) closeDetails(); });
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeDetails(); });

    function resetEmployeePage() { employeePage = 0; renderMonthlyRows(); }
    searchInput.addEventListener('input', resetEmployeePage);
    departmentFilter.addEventListener('change', resetEmployeePage);
    paymentFilter.addEventListener('change', resetEmployeePage);
    if (locationSelector) locationSelector.addEventListener('change', () => { employeePage = 0; renderMonthlyRows(); renderSummary(); });

    function normalizeMonthRecords() {
        records.forEach((record) => {
            const daily = Array.isArray(record.daily) ? record.daily : [];
            const defaultRate = daily.find((day) => day.rate)?.rate || '';
            const joiningDate = record.joiningDate || isoDate(1);
            const daysByDate = new Map(daily.filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day.date)).map((day) => [day.date, day]));
            record.joiningDate = joiningDate;
            Array.from({ length: daysInMonth() }, (_, index) => isoDate(index + 1)).forEach((date) => {
                if (daysByDate.has(date)) return;
                const historicalDay = new Date(`${date}T00:00:00`) < new Date(new Date().toDateString());
                const beforeJoining = date < joiningDate;
                const autoFill = !beforeJoining && historicalDay;
                daysByDate.set(date, { date, status: autoFill ? 'P' : '', rate: autoFill ? defaultRate : '', hours: autoFill ? 8 : '', inTime: autoFill ? '09:00' : '', outTime: autoFill ? '17:00' : '', remarks: '' });
            });
            record.daily = Array.from(daysByDate.values()).sort((first, second) => first.date.localeCompare(second.date));
        });
    }

    function changePeriod() { page = 0; normalizeMonthRecords(); renderMonthlyRows(); renderSummary(); }
    monthSelector.addEventListener('change', changePeriod);
    yearSelector.addEventListener('change', changePeriod);

    document.querySelector('#previous-days').addEventListener('click', () => { if (page > 0) { page--; renderMonthlyRows(); } });
    document.querySelector('#next-days').addEventListener('click', () => { if ((page + 1) * 10 < daysInMonth()) { page++; renderMonthlyRows(); } });
    document.querySelector('#previous-employees').addEventListener('click', () => { if (employeePage > 0) { employeePage--; renderMonthlyRows(); } });
    document.querySelector('#next-employees').addEventListener('click', () => { if ((employeePage + 1) * 10 < records.filter((record) => matchesFilters(record, getTotals(record))).length) { employeePage++; renderMonthlyRows(); } });

    table.addEventListener('click', (event) => {
        const row = event.target.closest('.employee-row');
        if (!row || event.target.closest('.status')) return;
        const record = records.find((item) => item.id === row.dataset.employeeId);
        if (record) renderDetails(record);
    });

    dailyTableBody.addEventListener('click', (event) => {
        const status = event.target.closest('.day-status');
        if (!status) return;
        const row = event.target.closest('tr');
        const record = records.find((item) => item.id === selectedId);
        const day = record.daily.find((item) => item.date === row.dataset.date);
        cycleStatus(day);
        renderDetails(record);
        renderMonthlyRows();
        renderSummary();
    });

    dailyTableBody.addEventListener('input', (event) => {
        const row = event.target.closest('tr');
        if (!row) return;
        const day = records.find((record) => record.id === selectedId).daily.find((item) => item.date === row.dataset.date);
        if (event.target.classList.contains('date-input')) day.date = event.target.value;
        if (event.target.classList.contains('rate-input')) day.rate = event.target.value === '' ? '' : Number(event.target.value);
        if (event.target.classList.contains('in-time-input')) day.inTime = event.target.value;
        if (event.target.classList.contains('out-time-input')) day.outTime = event.target.value;
        if (event.target.classList.contains('in-time-input') || event.target.classList.contains('out-time-input')) {
            day.hours = computeHours(day.inTime, day.outTime);
            const hoursField = row.querySelector('.hours-input');
            if (hoursField) hoursField.value = day.hours === '' ? '' : day.hours;
        }
        if (event.target.classList.contains('remarks-input')) day.remarks = event.target.value;
        row.querySelector('.daily-pay').textContent = dailyPay(day);
        updateDetailsSummary(records.find((record) => record.id === selectedId));
        renderMonthlyRows();
        renderSummary();
    });

    document.querySelector('#paid-amount').addEventListener('input', (event) => {
        const record = records.find((item) => item.id === selectedId);
        record.paid = event.target.value === '' ? 0 : Math.max(0, Number(event.target.value));
        updateDetailsSummary(record);
        renderMonthlyRows();
        renderSummary();
    });

    document.querySelector('.details-actions .btn-outline').addEventListener('click', () => {
        saveRecords('Employee updated');
        closeDetails();
    });

    // Initial paint — empty table until DB responds
    renderMonthlyRows();
    renderSummary();
    loadDatabaseRecords();
}());