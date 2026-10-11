/* =========================================================
   InventorySystem2 — Stock Transfer page controller
   Scoped to #is2-stocktransfer, SPA-friendly (idempotent)
   ========================================================= */
(function () {
  'use strict';

  const API_BASE = '/api';
  const TRANSFER_API_URL   = `${API_BASE}/stock-transfers`;
  const CATEGORY_API_URL   = `${API_BASE}/daily-stock-categories`;
  const SUBCATEGORY_API_URL = `${API_BASE}/daily-stock-subcategories`;
  const LOCATIONS_API_URL  = null; // locations are static, defined below

  const LOCATIONS = [
    'Arneel Industries Karodi',
    'Anil Industries Karodi',
    'Anil Industries Ghanegoan',
    'Anil Industries Yavatmal',
    'Kpr Projections'
  ];

  let stState = { initialized: false };

  function initStockTransfer() {
    try {
      const root = document.getElementById('is2-stocktransfer');
      if (!root) {
        console.warn('[stocktransfer.js] #is2-stocktransfer not found');
        return;
      }
      if (stState.initialized) return;
      stState.initialized = true;

    /* ============ ELEMENT REFERENCES ============ */
    const stDateInput = document.getElementById('stDate');

    const categoryMultiSelect = document.getElementById('stCategoryMultiSelect');
    const categoryDropdownBtn = document.getElementById('stCategoryDropdownBtn');
    const categoryDropdownMenu = document.getElementById('stCategoryDropdownMenu');
    const categorySelectAllCheckbox = document.getElementById('stCategorySelectAll');
    const categoryOptionsContainer = document.getElementById('stCategoryOptions');
    const categorySelect = document.getElementById('stCategorySelect');

    const subCategoryMultiSelect = document.getElementById('stSubCategoryMultiSelect');
    const subCategoryDropdownBtn = document.getElementById('stSubCategoryDropdownBtn');
    const subCategoryDropdownMenu = document.getElementById('stSubCategoryDropdownMenu');
    const subCategorySelectAllCheckbox = document.getElementById('stSubCategorySelectAll');
    const subCategoryOptionsContainer = document.getElementById('stSubCategoryOptions');
    const subCategorySelect = document.getElementById('stSubCategorySelect');

    const loadBtn = document.getElementById('stLoadBtn');
    const findInput = document.getElementById('stFindInput');
    const findBtn = document.getElementById('stFindBtn');
    const clearFindBtn = document.getElementById('stClearFindBtn');
    const openAddBtn = document.getElementById('stOpenAddBtn');
    const exportBtn = document.getElementById('stExportBtn');

    const tableBody = document.getElementById('stTableBody');
    const totalQtyEl = document.getElementById('stTotalQty');

    const recordModal = document.getElementById('stRecordModal');
    const closeModalBtn = document.getElementById('stCloseModalBtn');
    const cancelBtn = document.getElementById('stCancelBtn');
    const modalTitle = document.getElementById('stModalTitle');
    const transferForm = document.getElementById('stTransferForm');
    const formCategory = document.getElementById('stFormCategory');
    const formSubCategory = document.getElementById('stFormSubCategory');
    const formFromLocation = document.getElementById('stFormFromLocation');
    const formToLocation = document.getElementById('stFormToLocation');
    const formQty = document.getElementById('stFormQty');
    const formRemarks = document.getElementById('stFormRemarks');
    const formDateDisplay = document.getElementById('stFormDateDisplay');

    let allRows = [];
    let currentRows = [];
    let editingId = null;
    let availableCategories = [];

    /* ============ HELPERS ============ */
    function normalizeName(value) {
      return String(value || '').trim().replace(/\s+/g, ' ');
    }
    function toNumber(value) {
      const num = Number(value);
      return Number.isFinite(num) ? num : 0;
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
    function getTodayLocalISO() {
      const now = new Date();
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, '0');
      const d = String(now.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    function getSelectedValues(selectElement) {
      return Array.from(selectElement.selectedOptions)
        .map((option) => normalizeName(option.value))
        .filter(Boolean);
    }
    function setSelectedValues(selectElement, values) {
      const wanted = new Set(values.map((v) => normalizeName(v)));
      Array.from(selectElement.options).forEach((option) => {
        option.selected = wanted.has(normalizeName(option.value));
      });
    }
    function getOptionValues(selectElement) {
      return Array.from(selectElement.options)
        .map((option) => normalizeName(option.value))
        .filter(Boolean);
    }
    function updateMultiSelectLabel(btn, selected, all, emptyLabel, allLabel, pluralSuffix) {
      if (!selected.length) { btn.textContent = emptyLabel; return; }
      if (all.length > 0 && selected.length === all.length) { btn.textContent = allLabel; return; }
      if (selected.length === 1) { btn.textContent = selected[0]; return; }
      btn.textContent = `${selected.length} ${pluralSuffix}`;
    }
    function syncSelectAll(selectAllCheckbox, selected, all) {
      selectAllCheckbox.checked = all.length > 0 && selected.length === all.length;
      selectAllCheckbox.indeterminate = selected.length > 0 && selected.length < all.length;
      selectAllCheckbox.disabled = all.length === 0;
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
    function renderCheckboxDropdownForSelect({ selectElement, optionsContainer, selectAllCheckbox, dropdownButton, emptyLabel, allLabel, pluralSuffix, onSelectionChange }) {
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
          const checkbox = document.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.value = value;
          checkbox.checked = selectedSet.has(value);
          checkbox.addEventListener('change', () => {
            const next = collectChecked(optionsContainer);
            setSelectedValues(selectElement, next);
            syncSelectAll(selectAllCheckbox, next, all);
            updateMultiSelectLabel(dropdownButton, next, all, emptyLabel, allLabel, pluralSuffix);
            if (typeof onSelectionChange === 'function') void onSelectionChange(next);
          });
          const text = document.createElement('span');
          text.textContent = value;
          label.appendChild(checkbox);
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
      const response = await fetch(CATEGORY_API_URL);
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Unable to load categories.');
      }
      const rows = await response.json();
      availableCategories = rows.map((r) => normalizeName(r.name)).filter(Boolean);
      categorySelect.innerHTML = '';
      availableCategories.forEach((name) => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        categorySelect.appendChild(option);
      });
      if (availableCategories.length) setSelectedValues(categorySelect, availableCategories);
      renderCategoryFilterDropdown();
    }

    async function getSubCategories(category) {
      const params = new URLSearchParams({ category });
      const response = await fetch(`${SUBCATEGORY_API_URL}?${params.toString()}`);
      if (!response.ok) throw new Error('Unable to load sub-categories.');
      const rows = await response.json();
      return rows.map((r) => normalizeName(r.name)).filter(Boolean);
    }

    async function refreshFilterSubCategories() {
      const selectedCats = getSelectedValues(categorySelect);
      subCategorySelect.innerHTML = '';
      if (!selectedCats.length) {
        subCategorySelect.disabled = false;
        renderFilterSubCategoryDropdown();
        return;
      }
      const results = await Promise.all(selectedCats.map((c) => getSubCategories(c).catch(() => [])));
      const union = new Set();
      results.forEach((list) => list.forEach((name) => union.add(name)));
      const options = Array.from(union).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      options.forEach((name) => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        subCategorySelect.appendChild(option);
      });
      subCategorySelect.disabled = false;
      if (options.length) setSelectedValues(subCategorySelect, options);
      renderFilterSubCategoryDropdown();
    }

    function renderCategoryFilterDropdown() {
      renderCheckboxDropdownForSelect({
        selectElement: categorySelect,
        optionsContainer: categoryOptionsContainer,
        selectAllCheckbox: categorySelectAllCheckbox,
        dropdownButton: categoryDropdownBtn,
        emptyLabel: 'Select categories',
        allLabel: 'All Categories',
        pluralSuffix: 'categories selected',
        onSelectionChange: async () => {
          await refreshFilterSubCategories();
          await loadTransfers();
        }
      });
    }

    function renderFilterSubCategoryDropdown() {
      renderCheckboxDropdownForSelect({
        selectElement: subCategorySelect,
        optionsContainer: subCategoryOptionsContainer,
        selectAllCheckbox: subCategorySelectAllCheckbox,
        dropdownButton: subCategoryDropdownBtn,
        emptyLabel: 'Select sub-categories',
        allLabel: 'All Sub-Categories',
        pluralSuffix: 'sub-categories selected',
        onSelectionChange: () => renderGrid(currentRows)
      });
    }

    /* ============ LOAD TRANSFERS ============ */
    function getFilteredRows() {
      const selectedSubs = new Set(getSelectedValues(subCategorySelect));
      if (!selectedSubs.size) return allRows;
      return allRows.filter((row) => selectedSubs.has(normalizeName(row.size)));
    }

    async function loadTransfers() {
      const date = stDateInput.value || getTodayLocalISO();
      try {
        const params = new URLSearchParams({ date });
        const response = await fetch(`${TRANSFER_API_URL}?${params.toString()}`);
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error || 'Unable to load transfers.');
        }
        allRows = await response.json();
        renderGrid(getFilteredRows());
      } catch (error) {
        console.error(error);
        alert(error.message || 'Unable to load transfers.');
      }
    }

    /* ============ RENDER ============ */
    function renderGrid(rows) {
      currentRows = rows;
      tableBody.innerHTML = '';

      const query = findInput.value.trim().toLowerCase();
      const visible = query
        ? rows.filter((r) => [r.category, r.size, r.from_location, r.to_location, r.remarks]
            .filter(Boolean).join(' ').toLowerCase().includes(query))
        : rows;

      let totalQty = 0;

      visible.forEach((row, index) => {
        totalQty += toNumber(row.quantity);
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
          <td class="actions-cell">
            <button class="edit-btn" data-id="${row.id}" data-action="edit">Edit</button>
            <button class="delete-btn" data-id="${row.id}" data-action="delete">Delete</button>
          </td>
        `;
        tableBody.appendChild(tr);
      });

      if (!visible.length) {
        const tr = document.createElement('tr');
        tr.innerHTML = '<td colspan="9" class="empty-row">No transfers found for today.</td>';
        tableBody.appendChild(tr);
      }

      totalQtyEl.textContent = formatValue(totalQty);

      tableBody.querySelectorAll('button[data-action]').forEach((btn) => {
        const id = Number(btn.dataset.id);
        const action = btn.dataset.action;
        btn.addEventListener('click', () => {
          if (action === 'edit') openEditModal(id);
          else if (action === 'delete') deleteTransfer(id);
        });
      });
    }

    /* ============ MODAL ============ */
    function buildLocationOptions() {
      formFromLocation.innerHTML = '';
      formToLocation.innerHTML = '';
      LOCATIONS.forEach((loc) => {
        const opt1 = document.createElement('option');
        opt1.value = loc; opt1.textContent = loc;
        formFromLocation.appendChild(opt1);
        const opt2 = document.createElement('option');
        opt2.value = loc; opt2.textContent = loc;
        formToLocation.appendChild(opt2);
      });
      formFromLocation.value = LOCATIONS[0];
      formToLocation.value = LOCATIONS[1] || LOCATIONS[0];
    }

    async function buildFormCategoryOptions() {
      formCategory.innerHTML = '';
      availableCategories.forEach((name) => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        formCategory.appendChild(option);
      });
      if (availableCategories.length) formCategory.value = availableCategories[0];
      await refreshFormSubCategories();
    }

    async function refreshFormSubCategories(preferred = null) {
      const cat = normalizeName(formCategory.value);
      formSubCategory.innerHTML = '';
      if (!cat) return;
      const subs = await getSubCategories(cat).catch(() => []);
      subs.forEach((name) => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        formSubCategory.appendChild(option);
      });
      if (preferred && subs.includes(preferred)) formSubCategory.value = preferred;
    }

    function resetModalFields() {
      editingId = null;
      modalTitle.textContent = 'New Transfer';
      transferForm.reset();
      buildLocationOptions();
      formQty.value = '';
      formRemarks.value = '';
      formDateDisplay.textContent = getTodayLocalISO();
    }

    async function openAddModal() {
      resetModalFields();
      await buildFormCategoryOptions();
      recordModal.style.display = 'flex';
    }

    async function openEditModal(id) {
      const row = allRows.find((r) => Number(r.id) === Number(id));
      if (!row) return;
      resetModalFields();
      editingId = id;
      modalTitle.textContent = 'Edit Transfer';

      await buildFormCategoryOptions();
      formCategory.value = normalizeName(row.category);
      await refreshFormSubCategories(normalizeName(row.size));
      formSubCategory.value = normalizeName(row.size);
      formFromLocation.value = normalizeName(row.from_location);
      formToLocation.value = normalizeName(row.to_location);
      formQty.value = row.quantity;
      formRemarks.value = row.remarks || '';

      recordModal.style.display = 'flex';
    }

    function closeModal() {
      recordModal.style.display = 'none';
      resetModalFields();
      closeMenu(categoryDropdownMenu);
      closeMenu(subCategoryDropdownMenu);
    }

    /* ============ SAVE / DELETE ============ */
    async function saveTransfer(event) {
      event.preventDefault();
      const payload = {
        transfer_date: getTodayLocalISO(),
        category: normalizeName(formCategory.value),
        size: normalizeName(formSubCategory.value),
        from_location: normalizeName(formFromLocation.value),
        to_location: normalizeName(formToLocation.value),
        quantity: Number(formQty.value),
        remarks: formRemarks.value.trim()
      };

      if (!payload.category || !payload.size) return alert('Please select category and sub-category.');
      if (payload.from_location === payload.to_location) return alert('From and To locations must be different.');
      if (!Number.isFinite(payload.quantity) || payload.quantity <= 0) return alert('Quantity must be positive.');

      try {
        const url = editingId ? `${TRANSFER_API_URL}/${editingId}` : TRANSFER_API_URL;
        const method = editingId ? 'PUT' : 'POST';
        const response = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error(err.error || 'Unable to save transfer.');
        }
        closeModal();
        await loadTransfers();
      } catch (error) {
        console.error(error);
        alert(error.message || 'Unable to save transfer.');
      }
    }

    async function deleteTransfer(id) {
      if (!confirm('Delete this transfer? Stock movements will be reversed.')) return;
      try {
        const response = await fetch(`${TRANSFER_API_URL}/${id}`, { method: 'DELETE' });
        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error(err.error || 'Unable to delete transfer.');
        }
        await loadTransfers();
      } catch (error) {
        console.error(error);
        alert(error.message || 'Unable to delete transfer.');
      }
    }

    /* ============ EXPORT ============ */
    function exportExcel() {
      if (!currentRows.length) return alert('No transfers to export.');
      if (typeof XLSX === 'undefined') return alert('Excel export library not loaded.');
      const rows = currentRows.map((r, i) => ({
        'SR NO': i + 1,
        'DATE': r.transfer_date,
        'CATEGORY': r.category,
        'SUB-CATEGORY': r.size,
        'FROM': r.from_location,
        'TO': r.to_location,
        'QTY': toNumber(r.quantity),
        'REMARKS': r.remarks || ''
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Stock Transfers');
      XLSX.writeFile(wb, `stock-transfers-${stDateInput.value}.xlsx`);
    }

    /* ============ EVENT WIRING ============ */
    loadBtn.addEventListener('click', loadTransfers);
    findBtn.addEventListener('click', () => renderGrid(getFilteredRows()));
    findInput.addEventListener('input', () => renderGrid(getFilteredRows()));
    findInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); renderGrid(getFilteredRows()); }
    });
    clearFindBtn.addEventListener('click', () => {
      findInput.value = '';
      renderGrid(getFilteredRows());
    });

    openAddBtn.addEventListener('click', openAddModal);
    closeModalBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    recordModal.addEventListener('click', (e) => { if (e.target === recordModal) closeModal(); });
    transferForm.addEventListener('submit', saveTransfer);
    formCategory.addEventListener('change', () => refreshFormSubCategories());
    formFromLocation.addEventListener('change', () => {
      if (formFromLocation.value === formToLocation.value) {
        const alt = LOCATIONS.find((l) => l !== formFromLocation.value);
        if (alt) formToLocation.value = alt;
      }
    });
    formToLocation.addEventListener('change', () => {
      if (formFromLocation.value === formToLocation.value) {
        const alt = LOCATIONS.find((l) => l !== formToLocation.value);
        if (alt) formFromLocation.value = alt;
      }
    });

    categoryDropdownBtn.addEventListener('click', () => toggleMenu(categoryDropdownMenu));
    subCategoryDropdownBtn.addEventListener('click', () => { if (!subCategorySelect.disabled) toggleMenu(subCategoryDropdownMenu); });

    document.addEventListener('click', (event) => {
      if (!categoryMultiSelect.contains(event.target)) closeMenu(categoryDropdownMenu);
      if (!subCategoryMultiSelect.contains(event.target)) closeMenu(subCategoryDropdownMenu);
    });

    /* ============ INIT ============ */
    (async function initializePage() {
      stDateInput.value = getTodayLocalISO();
      buildLocationOptions();
      try {
        await loadCategories();
        await refreshFilterSubCategories();
        await loadTransfers();
      } catch (error) {
        console.error('[stocktransfer] init failed:', error);
        alert(error.message || 'Unable to initialize Stock Transfer page.');
      }
    })();

    stState.refresh = async function () {
      try {
        await loadCategories();
        await refreshFilterSubCategories();
        await loadTransfers();
      } catch (err) {
        console.error('[stocktransfer] soft refresh failed:', err);
      }
    };

    } catch (err) {
      console.error('[stocktransfer.js] initStockTransfer failed:', err);
    }
  }

  window.initStockTransferPage = function () {
    if (!stState.initialized) { initStockTransfer(); return; }
    if (typeof stState.refresh === 'function') { stState.refresh(); return; }
    stState.initialized = false;
    initStockTransfer();
  };
})();