/* =========================================================
   InventorySystem2 — Inventory Report page controller
   Scoped to #is2-inventory-report, SPA-friendly (idempotent)
   Reads from /api/stock-transfers with date + category filters.
   ========================================================= */
(function () {
  'use strict';

  const API_BASE = '/api';
  const TRANSFER_API_URL    = `${API_BASE}/stock-transfers`;
  const CATEGORY_API_URL    = `${API_BASE}/daily-stock-categories`;
  const SUBCATEGORY_API_URL = `${API_BASE}/daily-stock-subcategories`;

  let irState = { initialized: false };

  function initInventoryReport() {
    try {
      const root = document.getElementById('is2-inventory-report');
      if (!root) {
        console.warn('[inventoryreport.js] #is2-inventory-report not found');
        return;
      }
      if (irState.initialized) return;
      irState.initialized = true;

      /* ============ ELEMENT REFERENCES ============ */
      const fromDateInput = document.getElementById('irFromDate');
      const toDateInput   = document.getElementById('irToDate');

      const categoryMultiSelect    = document.getElementById('irCategoryMultiSelect');
      const categoryDropdownBtn    = document.getElementById('irCategoryDropdownBtn');
      const categoryDropdownMenu   = document.getElementById('irCategoryDropdownMenu');
      const categorySelectAllCb    = document.getElementById('irCategorySelectAll');
      const categoryOptionsBox     = document.getElementById('irCategoryOptions');
      const categorySelect         = document.getElementById('irCategorySelect');

      const subCategoryMultiSelect  = document.getElementById('irSubCategoryMultiSelect');
      const subCategoryDropdownBtn  = document.getElementById('irSubCategoryDropdownBtn');
      const subCategoryDropdownMenu = document.getElementById('irSubCategoryDropdownMenu');
      const subCategorySelectAllCb  = document.getElementById('irSubCategorySelectAll');
      const subCategoryOptionsBox   = document.getElementById('irSubCategoryOptions');
      const subCategorySelect       = document.getElementById('irSubCategorySelect');

      const loadBtn      = document.getElementById('irLoadBtn');
      const resetBtn     = document.getElementById('irResetBtn');
      const findInput    = document.getElementById('irFindInput');
      const findBtn      = document.getElementById('irFindBtn');
      const clearFindBtn = document.getElementById('irClearFindBtn');
      const exportBtn    = document.getElementById('irExportBtn');

      const tableBody = document.getElementById('irTableBody');

      const totalTransfersEl  = document.getElementById('irTotalTransfers');
      const totalQtyEl        = document.getElementById('irTotalQty');
      const totalCategoriesEl = document.getElementById('irTotalCategories');
      const totalLocationsEl  = document.getElementById('irTotalLocations');

      let allRows = [];       // raw transfer rows for the current date range
      let currentRows = [];   // after category / sub-category / search filters
      let availableCategories = [];

      /* ============ HELPERS ============ */
      function normalizeName(value) {
        return String(value || '').trim().replace(/\s+/g, ' ');
      }
      function toNumber(value) {
        const n = Number(value);
        return Number.isFinite(n) ? n : 0;
      }
      function formatValue(value) {
        if (!Number.isFinite(value)) return '0';
        if (Number.isInteger(value)) return String(value);
        return value.toFixed(2);
      }
      function escapeHtml(value) {
        return String(value)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      }
      function todayISO() {
        const d = new Date();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      }
      function firstOfMonthISO() {
        const d = new Date();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        return `${y}-${m}-01`;
      }
      function isValidDate(v) {
        return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
      }
      function getSelectedValues(selectElement) {
        return Array.from(selectElement.selectedOptions)
          .map((o) => normalizeName(o.value))
          .filter(Boolean);
      }
      function setSelectedValues(selectElement, values) {
        const wanted = new Set(values.map(normalizeName));
        Array.from(selectElement.options).forEach((o) => {
          o.selected = wanted.has(normalizeName(o.value));
        });
      }
      function getOptionValues(selectElement) {
        return Array.from(selectElement.options)
          .map((o) => normalizeName(o.value))
          .filter(Boolean);
      }
      function updateMultiSelectLabel(btn, selected, all, empty, allLabel, pluralSuffix) {
        if (!selected.length) { btn.textContent = empty; return; }
        if (all.length && selected.length === all.length) { btn.textContent = allLabel; return; }
        if (selected.length === 1) { btn.textContent = selected[0]; return; }
        btn.textContent = `${selected.length} ${pluralSuffix}`;
      }
      function syncSelectAll(selectAllCb, selected, all) {
        selectAllCb.checked = all.length > 0 && selected.length === all.length;
        selectAllCb.indeterminate = selected.length > 0 && selected.length < all.length;
        selectAllCb.disabled = all.length === 0;
      }
      function collectChecked(container) {
        return Array.from(container.querySelectorAll('input[type="checkbox"]:checked'))
          .map((cb) => normalizeName(cb.value))
          .filter(Boolean);
      }
      function closeMenu(menu) { menu.setAttribute('hidden', 'hidden'); }
      function toggleMenu(menu) {
        if (menu.hasAttribute('hidden')) menu.removeAttribute('hidden');
        else closeMenu(menu);
      }
      function renderCheckboxDropdown({
        selectElement, optionsContainer, selectAllCheckbox, dropdownButton,
        emptyLabel, allLabel, pluralSuffix, onSelectionChange
      }) {
        const all = getOptionValues(selectElement);
        const selected = getSelectedValues(selectElement);
        const selectedSet = new Set(selected);
        optionsContainer.innerHTML = '';

        if (!all.length) {
          const empty = document.createElement('div');
          empty.className = 'multi-empty';
          empty.textContent = 'No options available';
          optionsContainer.appendChild(empty);
        } else {
          all.forEach((value) => {
            const label = document.createElement('label');
            label.className = 'multi-option';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.value = value;
            cb.checked = selectedSet.has(value);
            cb.addEventListener('change', () => {
              const next = collectChecked(optionsContainer);
              setSelectedValues(selectElement, next);
              syncSelectAll(selectAllCheckbox, next, all);
              updateMultiSelectLabel(dropdownButton, next, all, emptyLabel, allLabel, pluralSuffix);
              if (typeof onSelectionChange === 'function') void onSelectionChange(next);
            });
            const text = document.createElement('span');
            text.textContent = value;
            label.appendChild(cb);
            label.appendChild(text);
            optionsContainer.appendChild(label);
          });
        }

        selectAllCheckbox.onchange = () => {
          const next = selectAllCheckbox.checked ? all : [];
          setSelectedValues(selectElement, next);
          Array.from(optionsContainer.querySelectorAll('input[type="checkbox"]'))
            .forEach((cb) => { cb.checked = selectAllCheckbox.checked; });
          syncSelectAll(selectAllCheckbox, next, all);
          updateMultiSelectLabel(dropdownButton, next, all, emptyLabel, allLabel, pluralSuffix);
          if (typeof onSelectionChange === 'function') void onSelectionChange(next);
        };

        syncSelectAll(selectAllCheckbox, selected, all);
        updateMultiSelectLabel(dropdownButton, selected, all, emptyLabel, allLabel, pluralSuffix);
      }

      /* ============ CATEGORIES / SUBCATEGORIES ============ */
      async function loadCategories() {
        const res = await fetch(CATEGORY_API_URL);
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          throw new Error(payload.error || 'Unable to load categories.');
        }
        const rows = await res.json();
        availableCategories = rows.map((r) => normalizeName(r.name)).filter(Boolean);

        categorySelect.innerHTML = '';
        availableCategories.forEach((name) => {
          const opt = document.createElement('option');
          opt.value = name;
          opt.textContent = name;
          categorySelect.appendChild(opt);
        });
        // Default: select all categories
        if (availableCategories.length) setSelectedValues(categorySelect, availableCategories);
        renderCategoryDropdown();
      }

      async function getSubCategories(category) {
        const params = new URLSearchParams({ category });
        const res = await fetch(`${SUBCATEGORY_API_URL}?${params.toString()}`);
        if (!res.ok) throw new Error('Unable to load sub-categories.');
        const rows = await res.json();
        return rows.map((r) => normalizeName(r.name)).filter(Boolean);
      }

      async function refreshSubCategories(preferred = null) {
        const cats = getSelectedValues(categorySelect);
        subCategorySelect.innerHTML = '';
        if (!cats.length) {
          subCategorySelect.disabled = false;
          renderSubCategoryDropdown();
          return;
        }
        const results = await Promise.all(cats.map((c) => getSubCategories(c).catch(() => [])));
        const union = new Set();
        results.forEach((list) => list.forEach((n) => union.add(n)));
        const options = Array.from(union).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
        options.forEach((name) => {
          const opt = document.createElement('option');
          opt.value = name;
          opt.textContent = name;
          subCategorySelect.appendChild(opt);
        });
        subCategorySelect.disabled = false;
        const want = preferred && preferred.length ? preferred.filter((v) => union.has(v)) : options;
        if (options.length) setSelectedValues(subCategorySelect, want);
        renderSubCategoryDropdown();
      }

      function renderCategoryDropdown() {
        renderCheckboxDropdown({
          selectElement: categorySelect,
          optionsContainer: categoryOptionsBox,
          selectAllCheckbox: categorySelectAllCb,
          dropdownButton: categoryDropdownBtn,
          emptyLabel: 'Select categories',
          allLabel: 'All Categories',
          pluralSuffix: 'categories selected',
          onSelectionChange: async () => {
            await refreshSubCategories();
            applyLocalFilters();
          }
        });
      }

      function renderSubCategoryDropdown() {
        renderCheckboxDropdown({
          selectElement: subCategorySelect,
          optionsContainer: subCategoryOptionsBox,
          selectAllCheckbox: subCategorySelectAllCb,
          dropdownButton: subCategoryDropdownBtn,
          emptyLabel: 'Select sub-categories',
          allLabel: 'All Sub-Categories',
          pluralSuffix: 'sub-categories selected',
          onSelectionChange: () => applyLocalFilters()
        });
      }

      /* ============ FETCH / FILTER ============ */
      async function fetchTransfers() {
        const from = fromDateInput.value;
        const to   = toDateInput.value;

        if (!isValidDate(from) || !isValidDate(to)) {
          alert('Please select both From and To dates.');
          return;
        }
        if (from > to) {
          alert('From Date must be on or before To Date.');
          return;
        }

        try {
          // We fetch the whole list for the date range once and filter client-side
          // using the category / sub-category selection. The /api/stock-transfers
          // endpoint supports a single `date` filter; to cover a range we request
          // each day in the range and merge.
          const days = [];
          const cursor = new Date(`${from}T00:00:00`);
          const end = new Date(`${to}T00:00:00`);
          while (cursor <= end) {
            const y = cursor.getFullYear();
            const m = String(cursor.getMonth() + 1).padStart(2, '0');
            const d = String(cursor.getDate()).padStart(2, '0');
            days.push(`${y}-${m}-${d}`);
            cursor.setDate(cursor.getDate() + 1);
          }

          const results = await Promise.all(days.map((day) => {
            const params = new URLSearchParams({ date: day });
            return fetch(`${TRANSFER_API_URL}?${params.toString()}`)
              .then(async (res) => {
                if (!res.ok) {
                  const payload = await res.json().catch(() => ({}));
                  throw new Error(payload.error || `Unable to load transfers for ${day}.`);
                }
                return res.json();
              });
          }));

          const merged = results.flat();
          const map = new Map();
          merged.forEach((row) => { map.set(Number(row.id), row); });

          allRows = Array.from(map.values()).sort((a, b) => {
            const byDate = String(a.transfer_date || '').localeCompare(String(b.transfer_date || ''));
            if (byDate !== 0) return byDate;
            return Number(a.id) - Number(b.id);
          });

          applyLocalFilters();
        } catch (error) {
          console.error(error);
          alert(error.message || 'Unable to load transfer records.');
        }
      }

      function applyLocalFilters() {
        const selectedCats = new Set(getSelectedValues(categorySelect));
        const selectedSubs = new Set(getSelectedValues(subCategorySelect));

        let rows = allRows.slice();

        if (selectedCats.size) {
          rows = rows.filter((r) => selectedCats.has(normalizeName(r.category)));
        }
        if (selectedSubs.size) {
          rows = rows.filter((r) => selectedSubs.has(normalizeName(r.size)));
        }

        const q = findInput.value.trim().toLowerCase();
        if (q) {
          rows = rows.filter((r) => {
            const haystack = [
              r.transfer_date, r.category, r.size,
              r.from_location, r.to_location, r.remarks
            ].filter(Boolean).join(' ').toLowerCase();
            return haystack.includes(q);
          });
        }

        currentRows = rows;
        renderTable(rows);
        updateSummary(rows);
      }

      function updateSummary(rows) {
        const totalQty = rows.reduce((sum, r) => sum + toNumber(r.quantity), 0);
        const cats = new Set(rows.map((r) => normalizeName(r.category)).filter(Boolean));
        const locs = new Set();
        rows.forEach((r) => {
          if (r.from_location) locs.add(normalizeName(r.from_location));
          if (r.to_location)   locs.add(normalizeName(r.to_location));
        });

        totalTransfersEl.textContent  = String(rows.length);
        totalQtyEl.textContent        = formatValue(totalQty);
        totalCategoriesEl.textContent = String(cats.size);
        totalLocationsEl.textContent  = String(locs.size);
      }

      function renderTable(rows) {
        tableBody.innerHTML = '';
        if (!rows.length) {
          const tr = document.createElement('tr');
          tr.innerHTML = '<td colspan="8" class="empty-row">No transfer records found for the selected filters.</td>';
          tableBody.appendChild(tr);
          return;
        }
        rows.forEach((row, index) => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>${index + 1}</td>
            <td>${escapeHtml(row.transfer_date || '')}</td>
            <td>${escapeHtml(row.category || '')}</td>
            <td>${escapeHtml(row.size || '')}</td>
            <td>${escapeHtml(row.from_location || '')}</td>
            <td>${escapeHtml(row.to_location || '')}</td>
            <td>${formatValue(toNumber(row.quantity))}</td>
            <td>${escapeHtml(row.remarks || '')}</td>
          `;
          tableBody.appendChild(tr);
        });
      }

      /* ============ EXPORT ============ */
      function exportExcel() {
        if (!currentRows.length) {
          alert('No records available to export for the selected filters.');
          return;
        }
        if (typeof XLSX === 'undefined') {
          alert('Excel export library failed to load. Please refresh and try again.');
          return;
        }
        const exportRows = currentRows.map((r, i) => ({
          'SR NO': i + 1,
          'DATE': r.transfer_date || '',
          'CATEGORY': r.category || '',
          'SUB-CATEGORY': r.size || '',
          'FROM': r.from_location || '',
          'TO': r.to_location || '',
          'QTY': toNumber(r.quantity),
          'REMARKS': r.remarks || ''
        }));
        const ws = XLSX.utils.json_to_sheet(exportRows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Inventory Report');
        const safeFrom = fromDateInput.value || firstOfMonthISO();
        const safeTo   = toDateInput.value   || todayISO();
        XLSX.writeFile(wb, `inventory-report-${safeFrom}_to_${safeTo}.xlsx`);
      }

      /* ============ RESET ============ */
      function resetFilters() {
        fromDateInput.value = firstOfMonthISO();
        toDateInput.value   = todayISO();
        findInput.value     = '';
        if (availableCategories.length) setSelectedValues(categorySelect, availableCategories);
        renderCategoryDropdown();
        refreshSubCategories().then(() => {
          applyLocalFilters();
        });
      }

      /* ============ EVENT WIRING ============ */
      loadBtn.addEventListener('click', fetchTransfers);
      fromDateInput.addEventListener('change', fetchTransfers);
      toDateInput.addEventListener('change', fetchTransfers);

      findBtn.addEventListener('click', applyLocalFilters);
      findInput.addEventListener('input', applyLocalFilters);
      findInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); applyLocalFilters(); }
      });
      clearFindBtn.addEventListener('click', () => {
        findInput.value = '';
        applyLocalFilters();
      });

      exportBtn.addEventListener('click', exportExcel);
      resetBtn.addEventListener('click', resetFilters);

      categoryDropdownBtn.addEventListener('click', () => toggleMenu(categoryDropdownMenu));
      subCategoryDropdownBtn.addEventListener('click', () => {
        if (!subCategorySelect.disabled) toggleMenu(subCategoryDropdownMenu);
      });

      document.addEventListener('click', (event) => {
        if (!categoryMultiSelect.contains(event.target)) closeMenu(categoryDropdownMenu);
        if (!subCategoryMultiSelect.contains(event.target)) closeMenu(subCategoryDropdownMenu);
      });

      /* ============ INIT ============ */
      (async function initializePage() {
        fromDateInput.value = firstOfMonthISO();
        toDateInput.value   = todayISO();
        try {
          await loadCategories();
          await refreshSubCategories();
          await fetchTransfers();
        } catch (error) {
          console.error('[inventoryreport] init failed:', error);
          alert(error.message || 'Unable to initialize Inventory Report page.');
        }
      })();

      irState.refresh = async function () {
        try {
          await loadCategories();
          await refreshSubCategories();
          await fetchTransfers();
        } catch (err) {
          console.error('[inventoryreport] soft refresh failed:', err);
        }
      };

    } catch (err) {
      console.error('[inventoryreport.js] initInventoryReport failed:', err);
    }
  }

  window.initInventoryReportPage = function () {
    if (!irState.initialized) { initInventoryReport(); return; }
    if (typeof irState.refresh === 'function') { irState.refresh(); return; }
    irState.initialized = false;
    initInventoryReport();
  };
})();