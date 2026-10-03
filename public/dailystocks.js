/* =========================================================
   InventorySystem2 — Daily Stocks page controller
   Scoped to #is2-dailystocks, SPA-friendly (idempotent)
   ========================================================= */
(function () {
  'use strict';

  /* Absolute path so the SPA and the standalone page hit the same endpoint,
     regardless of which HTML file is currently loaded. */
  const API_BASE = '/api';
  const API_URL             = `${API_BASE}/daily-stocks`;
  const CATEGORY_API_URL    = `${API_BASE}/daily-stock-categories`;
  const SUBCATEGORY_API_URL = `${API_BASE}/daily-stock-subcategories`;

  const LOCATION_FILTER_STORAGE_KEY = 'inventory_selected_locations';
  const ITEM_LOCATION_STORAGE_KEY   = 'inventory_selected_location';
  const LOCATIONS = [
    'Arneel Industries Karodi',
    'Anil Industries Karodi',
    'Anil Industries Ghanegoan',
    'Anil Industries Yavatmal',
    'Kpr Projections'
  ];

  let dsState = { initialized: false };

  function initDailyStocks() {
    try {
      const root = document.getElementById('is2-dailystocks');
      if (!root) {
        console.warn('[dailystocks.js] #is2-dailystocks not found');
        return;
      }
      if (dsState.initialized) return;
      dsState.initialized = true;

      // *** EVERYTHING ELSE IN initDailyStocks GOES INSIDE THIS try ***

    /* ============ ELEMENT REFERENCES ============ */
    const stockDateInput = document.getElementById('stockDate');
    const locationDropdownBtn = document.getElementById('locationDropdownBtn');
    const locationDropdownMenu = document.getElementById('locationDropdownMenu');
    const locationSelectAllCheckbox = document.getElementById('locationSelectAll');
    const locationOptionsContainer = document.getElementById('locationOptions');
    const locationMultiSelect = document.getElementById('locationMultiSelect');

    const categoryMultiSelect = document.getElementById('categoryMultiSelect');
    const categoryDropdownBtn = document.getElementById('categoryDropdownBtn');
    const categoryDropdownMenu = document.getElementById('categoryDropdownMenu');
    const categorySelectAllCheckbox = document.getElementById('categorySelectAll');
    const categoryOptionsContainer = document.getElementById('categoryOptions');
    const addCategoryBtn = document.getElementById('addCategoryBtn');
    const categorySelect = document.getElementById('categorySelect');
    const addSubCategoryBtn = document.getElementById('addSubCategoryBtn');
    const addRecordSubCategoryBtn = document.getElementById('addRecordSubCategoryBtn');

    const subCategoryMultiSelect = document.getElementById('subCategoryMultiSelect');
    const subCategoryDropdownBtn = document.getElementById('subCategoryDropdownBtn');
    const subCategoryDropdownMenu = document.getElementById('subCategoryDropdownMenu');
    const subCategorySelectAllCheckbox = document.getElementById('subCategorySelectAll');
    const subCategoryOptionsContainer = document.getElementById('subCategoryOptions');
    const subCategorySelect = document.getElementById('subCategorySelect');

    const cabinCountInput = document.getElementById('cabinCountInput');
    const loadBtn = document.getElementById('loadBtn');
    const exportExcelBtn = document.getElementById('exportExcelBtn');
    const importExcelBtn = document.getElementById('importExcelBtn');
    const importExcelInput = document.getElementById('importExcelInput');
    const findInput = document.getElementById('findInput');
    const findBtn = document.getElementById('findBtn');
    const clearFindBtn = document.getElementById('clearFindBtn');
    const openAddRecordBtn = document.getElementById('openAddRecordBtn');

    const addRowForm = document.getElementById('addRowForm');
    const itemLocationInput = document.getElementById('itemLocationInput');

    const recordCategoryMultiSelect = document.getElementById('recordCategoryMultiSelect');
    const recordCategoryDropdownBtn = document.getElementById('recordCategoryDropdownBtn');
    const recordCategoryDropdownMenu = document.getElementById('recordCategoryDropdownMenu');
    const recordCategorySelectAllCheckbox = document.getElementById('recordCategorySelectAll');
    const recordCategoryOptionsContainer = document.getElementById('recordCategoryOptions');
    const recordCategoryInput = document.getElementById('recordCategoryInput');

    const recordSubCategoryMultiSelect = document.getElementById('recordSubCategoryMultiSelect');
    const recordSubCategoryDropdownBtn = document.getElementById('recordSubCategoryDropdownBtn');
    const recordSubCategoryDropdownMenu = document.getElementById('recordSubCategoryDropdownMenu');
    const recordSubCategorySelectAllCheckbox = document.getElementById('recordSubCategorySelectAll');
    const recordSubCategoryOptionsContainer = document.getElementById('recordSubCategoryOptions');
    const recordSubCategoryInput = document.getElementById('recordSubCategoryInput');

    const recordDateDisplay = document.getElementById('recordDateDisplay');
    const recordModal = document.getElementById('recordModal');
    const closeRecordModalBtn = document.getElementById('closeRecordModalBtn');
    const cancelRecordBtn = document.getElementById('cancelRecordBtn');
    const stocksTableBody = document.getElementById('stocksTableBody');
    const readOnlyBadge = document.getElementById('readOnlyBadge');
    const descriptionHeader = document.getElementById('descriptionHeader');
    const qtyForCountHeader = document.getElementById('qtyForCountHeader');
    const dailyStockDonut = document.getElementById('dailyStockDonut');
    const totalStockAtKpr = document.getElementById('totalStockAtKpr');
    const totalStockSummary = document.getElementById('totalStockSummary');
    const stockLegendBar = document.getElementById('stockLegendBar');
    const requiredLegendBar = document.getElementById('requiredLegendBar');
    const cabinLegendBar = document.getElementById('cabinLegendBar');
    const totalRequired = document.getElementById('totalRequired');
    const totalCabinWiseStock = document.getElementById('totalCabinWiseStock');

    let currentRows = [];
    let loadedRows = [];
    let selectedFilterLocations = new Set();
    let editingRowId = null;
    let availableCategories = [];
    let recordSubCategoryCategoryMap = new Map();

    /* ============ HELPERS ============ */
    function normalizeCategoryName(value) {
      return String(value || '').trim().replace(/\s+/g, ' ');
    }
    function normalizeLocationName(value) {
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
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    function getCabinCount() {
      const count = Number(cabinCountInput.value || 20);
      if (!Number.isFinite(count) || count <= 0) return 20;
      return Math.floor(count);
    }
    function isTodaySelected() {
      return stockDateInput.value === getTodayLocalISO();
    }
    function isValidLocation(value) {
      return LOCATIONS.includes(normalizeLocationName(value));
    }
    function getSelectedValues(selectElement, excludedValues = []) {
      const excludedSet = new Set(excludedValues);
      const values = Array.from(selectElement.selectedOptions)
        .map((option) => normalizeCategoryName(option.value))
        .filter((value) => value && !excludedSet.has(value));
      return [...new Set(values)];
    }
    function setSelectedValues(selectElement, values) {
      const valueSet = new Set(values.map((value) => normalizeCategoryName(value)));
      Array.from(selectElement.options).forEach((option) => {
        option.selected = valueSet.has(normalizeCategoryName(option.value));
      });
    }
    function getOptionValues(selectElement) {
      return Array.from(selectElement.options)
        .map((option) => normalizeCategoryName(option.value))
        .filter(Boolean);
    }
    function updateMultiSelectLabel(buttonElement, selectedValues, allValues, emptyLabel, allLabel, pluralSuffix) {
      if (!selectedValues.length) { buttonElement.textContent = emptyLabel; return; }
      if (selectedValues.length === allValues.length && allValues.length > 0) { buttonElement.textContent = allLabel; return; }
      if (selectedValues.length === 1) { buttonElement.textContent = selectedValues[0]; return; }
      buttonElement.textContent = `${selectedValues.length} ${pluralSuffix}`;
    }
    function syncSelectAllCheckbox(selectAllCheckbox, selectedValues, allValues) {
      selectAllCheckbox.checked = allValues.length > 0 && selectedValues.length === allValues.length;
      selectAllCheckbox.indeterminate = selectedValues.length > 0 && selectedValues.length < allValues.length;
      selectAllCheckbox.disabled = allValues.length === 0;
    }
    function collectCheckedValues(container) {
      return Array.from(container.querySelectorAll('input[type="checkbox"]:checked'))
        .map((checkbox) => normalizeCategoryName(checkbox.value))
        .filter(Boolean);
    }
    function closeMenu(menuElement) { menuElement.setAttribute('hidden', 'hidden'); }
    function toggleMenu(menuElement) {
      const isHidden = menuElement.hasAttribute('hidden');
      if (isHidden) { menuElement.removeAttribute('hidden'); return; }
      closeMenu(menuElement);
    }
    function renderCheckboxDropdownForSelect({ selectElement, optionsContainer, selectAllCheckbox, dropdownButton, emptyLabel, allLabel, pluralSuffix, onSelectionChange }) {
      const allValues = getOptionValues(selectElement);
      const selectedValues = getSelectedValues(selectElement);
      const selectedSet = new Set(selectedValues);
      optionsContainer.innerHTML = '';

      if (!allValues.length) {
        const emptyRow = document.createElement('div');
        emptyRow.className = 'multi-empty';
        emptyRow.textContent = 'No options available';
        optionsContainer.appendChild(emptyRow);
      } else {
        allValues.forEach((value) => {
          const label = document.createElement('label');
          label.className = 'multi-option';
          const checkbox = document.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.value = value;
          checkbox.checked = selectedSet.has(value);
          checkbox.addEventListener('change', () => {
            const nextSelected = collectCheckedValues(optionsContainer);
            setSelectedValues(selectElement, nextSelected);
            syncSelectAllCheckbox(selectAllCheckbox, nextSelected, allValues);
            updateMultiSelectLabel(dropdownButton, nextSelected, allValues, emptyLabel, allLabel, pluralSuffix);
            if (typeof onSelectionChange === 'function') void onSelectionChange(nextSelected);
          });
          const text = document.createElement('span');
          text.textContent = value;
          label.appendChild(checkbox);
          label.appendChild(text);
          optionsContainer.appendChild(label);
        });
      }

      selectAllCheckbox.onchange = () => {
        const nextSelected = selectAllCheckbox.checked ? allValues : [];
        setSelectedValues(selectElement, nextSelected);
        Array.from(optionsContainer.querySelectorAll('input[type="checkbox"]')).forEach((checkbox) => {
          checkbox.checked = selectAllCheckbox.checked;
        });
        syncSelectAllCheckbox(selectAllCheckbox, nextSelected, allValues);
        updateMultiSelectLabel(dropdownButton, nextSelected, allValues, emptyLabel, allLabel, pluralSuffix);
        if (typeof onSelectionChange === 'function') void onSelectionChange(nextSelected);
      };

      syncSelectAllCheckbox(selectAllCheckbox, selectedValues, allValues);
      updateMultiSelectLabel(dropdownButton, selectedValues, allValues, emptyLabel, allLabel, pluralSuffix);
    }
    function parseStoredLocationList(rawValue) {
      if (!rawValue) return [];
      try {
        const parsed = JSON.parse(rawValue);
        if (!Array.isArray(parsed)) return [];
        return parsed.map((value) => normalizeLocationName(value)).filter((value) => isValidLocation(value));
      } catch (_error) { return []; }
    }
    function getSelectedFilterLocations() { return Array.from(selectedFilterLocations); }
    function updateLocationDropdownLabel() {
      const selectedLocations = getSelectedFilterLocations();
      if (!selectedLocations.length) { locationDropdownBtn.textContent = 'Select locations'; return; }
      if (selectedLocations.length === LOCATIONS.length) { locationDropdownBtn.textContent = 'All Locations'; return; }
      if (selectedLocations.length === 1) { locationDropdownBtn.textContent = selectedLocations[0]; return; }
      locationDropdownBtn.textContent = `${selectedLocations.length} locations selected`;
    }
    function syncLocationCheckboxStates() {
      const selectedSet = new Set(getSelectedFilterLocations());
      Array.from(locationOptionsContainer.querySelectorAll('input[type="checkbox"]')).forEach((checkbox) => {
        checkbox.checked = selectedSet.has(checkbox.value);
      });
      const selectedCount = selectedSet.size;
      locationSelectAllCheckbox.checked = selectedCount === LOCATIONS.length;
      locationSelectAllCheckbox.indeterminate = selectedCount > 0 && selectedCount < LOCATIONS.length;
      updateLocationDropdownLabel();
    }
    function setSelectedFilterLocations(locations) {
      selectedFilterLocations = new Set(
        locations.map((value) => normalizeLocationName(value)).filter((value) => isValidLocation(value))
      );
      syncLocationCheckboxStates();
    }
    function getPrimarySelectedLocation() {
      const selectedLocations = getSelectedFilterLocations();
      return selectedLocations.length ? selectedLocations[0] : '';
    }
    function initializeItemLocationOptions(defaultLocation) {
      itemLocationInput.innerHTML = '';
      LOCATIONS.forEach((locationName) => {
        const option = document.createElement('option');
        option.value = locationName;
        option.textContent = locationName;
        itemLocationInput.appendChild(option);
      });
      const normalizedDefault = normalizeLocationName(defaultLocation);
      itemLocationInput.value = isValidLocation(normalizedDefault) ? normalizedDefault : LOCATIONS[0];
    }
    function getSelectedLocation() { return normalizeLocationName(itemLocationInput.value); }
    function updateItemLocationDefault() {
      const savedItemLocation = normalizeLocationName(localStorage.getItem(ITEM_LOCATION_STORAGE_KEY) || '');
      const primarySelected = getPrimarySelectedLocation();
      const defaultLocation = isValidLocation(savedItemLocation) ? savedItemLocation : primarySelected;
      if (isValidLocation(defaultLocation)) itemLocationInput.value = defaultLocation;
    }
    function syncLocationUIAfterSelectionChange() {
      syncLocationCheckboxStates();
      updateItemLocationDefault();
      localStorage.setItem(LOCATION_FILTER_STORAGE_KEY, JSON.stringify(getSelectedFilterLocations()));
    }
    function handleLocationToggle(locationName, isChecked) {
      const normalizedLocation = normalizeLocationName(locationName);
      if (!isValidLocation(normalizedLocation)) return;
      if (isChecked) selectedFilterLocations.add(normalizedLocation);
      else selectedFilterLocations.delete(normalizedLocation);
      syncLocationUIAfterSelectionChange();
    }
    function initializeLocationOptions() {
      locationOptionsContainer.innerHTML = '';
      LOCATIONS.forEach((locationName) => {
        const label = document.createElement('label');
        label.className = 'multi-option';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = locationName;
        checkbox.addEventListener('change', async () => {
          handleLocationToggle(locationName, checkbox.checked);
          editingRowId = null;
          await loadStocks();
        });
        const text = document.createElement('span');
        text.textContent = locationName;
        label.appendChild(checkbox);
        label.appendChild(text);
        locationOptionsContainer.appendChild(label);
      });
      const savedFilterLocations = parseStoredLocationList(localStorage.getItem(LOCATION_FILTER_STORAGE_KEY));
      const savedItemLocation = normalizeLocationName(localStorage.getItem(ITEM_LOCATION_STORAGE_KEY) || '');
      const initialLocations = savedFilterLocations.length ? savedFilterLocations : LOCATIONS;
      setSelectedFilterLocations(initialLocations);
      initializeItemLocationOptions(savedItemLocation || initialLocations[0]);
      syncLocationUIAfterSelectionChange();
    }
    async function getSubCategories(category) {
      if (!category) return [];
      const params = new URLSearchParams({ category });
      const response = await fetch(`${SUBCATEGORY_API_URL}?${params.toString()}`);
      if (!response.ok) throw new Error('Unable to load sub-categories.');
      const rows = await response.json();
      return rows.map((row) => normalizeCategoryName(row.name)).filter(Boolean);
    }
    async function getSubCategoryMapForCategories(categories) {
      const map = new Map();
      await Promise.all(categories.map(async (category) => {
        try { map.set(category, await getSubCategories(category)); }
        catch (error) { console.error(error); map.set(category, []); }
      }));
      return map;
    }
    function getSelectedFilterCategories() { return getSelectedValues(categorySelect); }
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
          editingRowId = null;
          populateRecordCategories(getSelectedFilterCategories());
          await refreshFilterSubCategoryOptions();
          await loadStocks();
        }
      });
    }
    function renderFilterSubCategoryDropdown() {
      subCategoryDropdownBtn.disabled = false;
      renderCheckboxDropdownForSelect({
        selectElement: subCategorySelect,
        optionsContainer: subCategoryOptionsContainer,
        selectAllCheckbox: subCategorySelectAllCheckbox,
        dropdownButton: subCategoryDropdownBtn,
        emptyLabel: 'Select sub-categories',
        allLabel: 'All Sub-Categories',
        pluralSuffix: 'sub-categories selected',
        onSelectionChange: () => { editingRowId = null; renderFilteredGrid(); }
      });
    }
    function renderRecordCategoryDropdown() {
      renderCheckboxDropdownForSelect({
        selectElement: recordCategoryInput,
        optionsContainer: recordCategoryOptionsContainer,
        selectAllCheckbox: recordCategorySelectAllCheckbox,
        dropdownButton: recordCategoryDropdownBtn,
        emptyLabel: 'Select categories',
        allLabel: 'All Categories',
        pluralSuffix: 'categories selected',
        onSelectionChange: async () => { await refreshRecordSubCategoryOptions(); }
      });
    }
    function renderRecordSubCategoryDropdown() {
      recordSubCategoryDropdownBtn.disabled = false;
      renderCheckboxDropdownForSelect({
        selectElement: recordSubCategoryInput,
        optionsContainer: recordSubCategoryOptionsContainer,
        selectAllCheckbox: recordSubCategorySelectAllCheckbox,
        dropdownButton: recordSubCategoryDropdownBtn,
        emptyLabel: 'Select sub-categories',
        allLabel: 'All Sub-Categories',
        pluralSuffix: 'sub-categories selected'
      });
    }
    function renderCategoryOptions(categories, selectedCategories = []) {
      categorySelect.innerHTML = '';
      categories.forEach((categoryName) => {
        const option = document.createElement('option');
        option.value = categoryName;
        option.textContent = categoryName;
        categorySelect.appendChild(option);
      });
      if (selectedCategories.length) setSelectedValues(categorySelect, selectedCategories);
      else if (categories.length) setSelectedValues(categorySelect, categories);
      renderCategoryFilterDropdown();
    }
    function populateRecordCategories(selectedCategories = []) {
      recordCategoryInput.innerHTML = '';
      availableCategories.forEach((categoryName) => {
        const option = document.createElement('option');
        option.value = categoryName;
        option.textContent = categoryName;
        recordCategoryInput.appendChild(option);
      });
      if (selectedCategories.length) setSelectedValues(recordCategoryInput, selectedCategories);
      else if (availableCategories.length) recordCategoryInput.options[0].selected = true;
      renderRecordCategoryDropdown();
    }
    async function refreshFilterSubCategoryOptions(preferredSelected = null) {
      const selectedCategories = getSelectedFilterCategories();
      subCategorySelect.innerHTML = '';
      if (!selectedCategories.length) {
        subCategorySelect.disabled = false;
        renderFilterSubCategoryDropdown();
        return;
      }
      const map = await getSubCategoryMapForCategories(selectedCategories);
      const unionSet = new Set();
      selectedCategories.forEach((category) => {
        (map.get(category) || []).forEach((subCategory) => unionSet.add(subCategory));
      });
      const options = Array.from(unionSet).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      options.forEach((name) => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        subCategorySelect.appendChild(option);
      });
      subCategorySelect.disabled = false;
      const selectionToApply = preferredSelected ? preferredSelected.filter((value) => unionSet.has(value)) : options;
      if (options.length) setSelectedValues(subCategorySelect, selectionToApply);
      renderFilterSubCategoryDropdown();
    }
    async function refreshRecordSubCategoryOptions(preferredSelected = null) {
      const selectedCategories = getSelectedValues(recordCategoryInput);
      const previousSelected = preferredSelected || getSelectedValues(recordSubCategoryInput);
      recordSubCategoryInput.innerHTML = '';
      recordSubCategoryCategoryMap = new Map();
      if (!selectedCategories.length) {
        recordSubCategoryInput.disabled = false;
        renderRecordSubCategoryDropdown();
        return;
      }
      const map = await getSubCategoryMapForCategories(selectedCategories);
      const unionSet = new Set();
      selectedCategories.forEach((category) => {
        (map.get(category) || []).forEach((subCategory) => {
          unionSet.add(subCategory);
          if (!recordSubCategoryCategoryMap.has(subCategory)) {
            recordSubCategoryCategoryMap.set(subCategory, new Set());
          }
          recordSubCategoryCategoryMap.get(subCategory).add(category);
        });
      });
      const options = Array.from(unionSet).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      options.forEach((name) => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        recordSubCategoryInput.appendChild(option);
      });
      recordSubCategoryInput.disabled = false;
      if (options.length) {
        setSelectedValues(recordSubCategoryInput, previousSelected.filter((value) => unionSet.has(value)));
      }
      renderRecordSubCategoryDropdown();
    }

    /* ============ CATEGORY LOAD / ADD ============ */
    async function loadCategories(selectedCategories = []) {
      try {
        const response = await fetch(CATEGORY_API_URL);
        if (!response.ok) {
          const errorPayload = await response.json().catch(() => ({}));
          throw new Error(errorPayload.error || 'Unable to load categories.');
        }
        const rows = await response.json();
        availableCategories = rows.map((row) => normalizeCategoryName(row.name)).filter(Boolean);
        renderCategoryOptions(availableCategories, selectedCategories);
        populateRecordCategories(getSelectedFilterCategories());
        await refreshFilterSubCategoryOptions();
      } catch (error) {
        console.error('[dailystocks] loadCategories failed:', error, {
          url: CATEGORY_API_URL,
          pageUrl: window.location.href
        });
        alert(`${error.message || 'Unable to load categories.'}\n\nURL: ${CATEGORY_API_URL}`);
      }
    }

    async function addNewCategory(existingSelections) {
      const inputValue = window.prompt('Enter new category name:');
      if (inputValue === null) {
        setSelectedValues(categorySelect, existingSelections);
        renderCategoryFilterDropdown();
        return;
      }
      const newCategory = normalizeCategoryName(inputValue);
      if (!newCategory) {
        alert('Please enter a category name.');
        setSelectedValues(categorySelect, existingSelections);
        renderCategoryFilterDropdown();
        return;
      }
      try {
        const response = await fetch(CATEGORY_API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newCategory })
        });
        if (!response.ok) {
          const errorPayload = await response.json().catch(() => ({}));
          throw new Error(errorPayload.error || 'Unable to add category.');
        }
        const nextSelections = [...new Set([...existingSelections, newCategory])];
        await loadCategories(nextSelections);
        await refreshFilterSubCategoryOptions();
        await loadStocks();
      } catch (error) {
        console.error(error);
        alert(error.message || 'Unable to add category.');
        await loadCategories(existingSelections);
      }
    }

    async function addNewSubCategoryToCategories(categories, name) {
      const results = await Promise.allSettled(categories.map((category) => fetch(SUBCATEGORY_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, name })
      })));
      for (const result of results) {
        if (result.status === 'fulfilled' && !result.value.ok && result.value.status !== 409) {
          const errorPayload = await result.value.json().catch(() => ({}));
          throw new Error(errorPayload.error || 'Unable to add sub-category.');
        }
      }
    }

    async function addNewSubCategory(targetCategories, existingSelections, refreshFn) {
      if (!targetCategories.length) {
        alert('Please select at least one category first.');
        return;
      }
      const inputValue = window.prompt('Enter new sub-category name:');
      if (inputValue === null) return;
      const newSubCategory = normalizeCategoryName(inputValue);
      if (!newSubCategory) {
        alert('Please enter a sub-category name.');
        return;
      }
      try {
        await addNewSubCategoryToCategories(targetCategories, newSubCategory);
        const nextSelections = [...new Set([...existingSelections, newSubCategory])];
        await refreshFn(nextSelections);
      } catch (error) {
        console.error(error);
        alert(error.message || 'Unable to add sub-category.');
      }
    }

    /* ============ FILTER / RENDER ============ */
    function getRowsAfterSubCategoryFilter() {
      const selectedSubCategories = new Set(getSelectedValues(subCategorySelect));
      if (!selectedSubCategories.size) return loadedRows;
      return loadedRows.filter((row) => selectedSubCategories.has(normalizeCategoryName(row.size)));
    }
    function updateDynamicLabels() {
      const cabinCount = getCabinCount();
      descriptionHeader.textContent = 'SUB-CATEGORY';
      qtyForCountHeader.textContent = `QTY FOR ${cabinCount} CABIN (20 FT) in NOS`;
    }
    function refreshModeUI() {
      const isToday = isTodaySelected();
      readOnlyBadge.style.display = !isToday ? 'block' : 'none';
      openAddRecordBtn.disabled = false;
      updateDynamicLabels();
    }
    async function openAddRecordModal() {
      addRowForm.reset();
      updateItemLocationDefault();
      const filterCategories = getSelectedFilterCategories();
      const selectedFilterSubCategories = getSelectedValues(subCategorySelect);
      populateRecordCategories(filterCategories.length ? filterCategories : availableCategories.slice(0, 1));
      await refreshRecordSubCategoryOptions(selectedFilterSubCategories);
      recordDateDisplay.textContent = getTodayLocalISO();
      recordModal.style.display = 'flex';
      updateDynamicLabels();
    }
    function closeAddRecordModal() {
      recordModal.style.display = 'none';
      addRowForm.reset();
      closeMenu(recordCategoryDropdownMenu);
      closeMenu(recordSubCategoryDropdownMenu);
    }
    function renderFilteredGrid() {
      const query = findInput.value.trim().toLowerCase();
      const baseRows = getRowsAfterSubCategoryFilter();
      if (!query) { renderGrid(baseRows); return; }
      const filteredRows = baseRows.filter((row) => {
        const qtyOne = toNumber(row.qty_for_1_cabin);
        const stockAtKpr = toNumber(row.stock_at_kpr);
        const joinedText = [row.size, row.location, row.category, formatValue(qtyOne), formatValue(stockAtKpr)].join(' ').toLowerCase();
        return joinedText.includes(query);
      });
      renderGrid(filteredRows);
    }
    function updateDonutChart(rows) {
      const cabinCount = getCabinCount();
      let stockTotal = 0, requiredTotal = 0, cabinWiseTotal = 0;
      rows.forEach((row) => {
        const qtyOne = toNumber(row.qty_for_1_cabin);
        const qtyForCount = qtyOne * cabinCount;
        const stockAtKpr = toNumber(row.stock_at_kpr);
        const required = stockAtKpr - qtyForCount;
        const cabinWiseStock = qtyOne === 0 ? 0 : stockAtKpr / qtyOne;
        stockTotal += stockAtKpr;
        requiredTotal += required;
        cabinWiseTotal += cabinWiseStock;
      });
      totalStockAtKpr.textContent = formatValue(stockTotal);
      totalStockSummary.textContent = formatValue(stockTotal);
      totalRequired.textContent = formatValue(requiredTotal);
      totalCabinWiseStock.textContent = formatValue(cabinWiseTotal);
      const largestLegendValue = Math.max(Math.abs(stockTotal), Math.abs(requiredTotal), Math.abs(cabinWiseTotal), 1);
      stockLegendBar.style.width = ((Math.abs(stockTotal) / largestLegendValue) * 100) + '%';
      requiredLegendBar.style.width = ((Math.abs(requiredTotal) / largestLegendValue) * 100) + '%';
      cabinLegendBar.style.width = ((Math.abs(cabinWiseTotal) / largestLegendValue) * 100) + '%';
      const stockSegment = Math.max(stockTotal, 0);
      const requiredSegment = Math.max(requiredTotal, 0);
      const cabinSegment = Math.max(cabinWiseTotal, 0);
      const total = stockSegment + requiredSegment + cabinSegment;
      if (total <= 0) {
        dailyStockDonut.style.background = 'conic-gradient(#e5e7eb 0deg 360deg)';
        dailyStockDonut.setAttribute('aria-label', 'No positive values available for donut chart');
        return;
      }
      const stockDeg = (stockSegment / total) * 360;
      const requiredDeg = (requiredSegment / total) * 360;
      const cabinDeg = (cabinSegment / total) * 360;
      dailyStockDonut.style.background = `conic-gradient(
        #16a34a 0deg ${stockDeg}deg,
        #ea580c ${stockDeg}deg ${stockDeg + requiredDeg}deg,
        #2563eb ${stockDeg + requiredDeg}deg ${stockDeg + requiredDeg + cabinDeg}deg
      )`;
      dailyStockDonut.setAttribute('aria-label', `Donut chart totals - Stock at KPR: ${formatValue(stockTotal)}, Required: ${formatValue(requiredTotal)}, Cabin Wise Stock: ${formatValue(cabinWiseTotal)}`);
    }
    function renderGrid(rows) {
      stocksTableBody.innerHTML = '';
      currentRows = rows;
      updateDonutChart(rows);
      const cabinCount = getCabinCount();
      const canEditRows = isTodaySelected();
      rows.forEach((row, index) => {
        const qtyOne = toNumber(row.qty_for_1_cabin);
        const qtyForCount = qtyOne * cabinCount;
        const stockAtKpr = toNumber(row.stock_at_kpr);
        const required = stockAtKpr - qtyForCount;
        const cabinWiseStock = qtyOne === 0 ? 0 : stockAtKpr / qtyOne;
        const isEditing = canEditRows && editingRowId === row.id;
        const descriptionCell = isEditing
          ? `<input class="table-input" type="text" id="edit-size-${row.id}" value="${escapeHtml(row.size)}">`
          : escapeHtml(row.size);
        const qtyOneCell = isEditing
          ? `<input class="table-input" type="number" id="edit-qty-one-${row.id}" min="0" step="0.01" value="${qtyOne}">`
          : formatValue(qtyOne);
        const stockCell = isEditing
          ? `<input class="table-input" type="number" id="edit-stock-${row.id}" step="0.01" value="${stockAtKpr}">`
          : formatValue(stockAtKpr);
        const actionsCell = canEditRows
          ? (isEditing
            ? `<button class="save-btn" onclick="saveRowEdit(${row.id})">Save</button><button class="cancel-btn" onclick="cancelRowEdit()">Cancel</button>`
            : `<button class="edit-btn" onclick="startRowEdit(${row.id})">Edit</button><button class="delete-btn" onclick="deleteRow(${row.id})">Delete</button>`)
          : '<span class="readonly-text">Read-only</span>';
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${index + 1}</td>
          <td>${escapeHtml(row.category || '')}</td>
          <td>${descriptionCell}</td>
          <td>${qtyOneCell}</td>
          <td>${formatValue(qtyForCount)}</td>
          <td>${stockCell}</td>
          <td>${formatValue(required)}</td>
          <td>${formatValue(cabinWiseStock)}</td>
          <td class="actions-cell">${actionsCell}</td>
        `;
        stocksTableBody.appendChild(tr);
      });
      if (!rows.length) {
        const tr = document.createElement('tr');
        tr.innerHTML = '<td colspan="9" class="empty-row">No records found for selected filters.</td>';
        stocksTableBody.appendChild(tr);
      }
    }
    function startRowEdit(id) {
      if (!isTodaySelected()) { alert('Past date is read-only.'); return; }
      editingRowId = id;
      renderGrid(currentRows);
    }
    function cancelRowEdit() {
      editingRowId = null;
      renderGrid(currentRows);
    }
    async function saveRowEdit(id) {
      if (!isTodaySelected()) { alert('Past date is read-only.'); return; }
      const sizeInput = document.getElementById(`edit-size-${id}`);
      const qtyInput = document.getElementById(`edit-qty-one-${id}`);
      const stockInput = document.getElementById(`edit-stock-${id}`);
      if (!sizeInput || !qtyInput || !stockInput) return;
      const size = sizeInput.value.trim();
      const qtyFor1Cabin = Number(qtyInput.value || 0);
      const stockAtKpr = Number(stockInput.value || 0);
      const cabinCount = getCabinCount();
      try {
        const response = await fetch(`${API_URL}/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ size, qty_for_1_cabin: qtyFor1Cabin, stock_at_kpr: stockAtKpr, cabin_count: cabinCount })
        });
        if (!response.ok) {
          const errorPayload = await response.json().catch(() => ({}));
          throw new Error(errorPayload.error || 'Unable to update stock row.');
        }
        editingRowId = null;
        await loadStocks();
      } catch (error) {
        console.error(error);
        alert(error.message || 'Unable to update stock row.');
      }
    }
    async function deleteRow(id) {
      if (!isTodaySelected()) { alert('Past date is read-only.'); return; }
      if (!confirm('Are you sure you want to delete this row?')) return;
      try {
        const response = await fetch(`${API_URL}/${id}`, { method: 'DELETE' });
        if (!response.ok) {
          const errorPayload = await response.json().catch(() => ({}));
          throw new Error(errorPayload.error || 'Unable to delete stock row.');
        }
        if (editingRowId === id) editingRowId = null;
        await loadStocks();
      } catch (error) {
        console.error(error);
        alert(error.message || 'Unable to delete stock row.');
      }
    }

    /* ============ LOAD STOCKS (with silent mode) ============ */
    async function loadStocks(options = {}) {
      const silent = options.silent === true;

      if (!stockDateInput.value) {
        if (!silent) alert('Please select a date.');
        return;
      }
      const selectedLocations = getSelectedFilterLocations();
      if (!selectedLocations.length) { loadedRows = []; renderFilteredGrid(); return; }

      const selectedCategories = getSelectedFilterCategories();
      if (!selectedCategories.length) {
        if (!silent) alert('Please select at least one category.');
        loadedRows = [];
        renderFilteredGrid();
        return;
      }
      if (stockDateInput.value > getTodayLocalISO()) {
        alert('Future date is not allowed.');
        stockDateInput.value = getTodayLocalISO();
      }
      refreshModeUI();
      try {
        const requests = [];
        selectedLocations.forEach((locationName) => {
          selectedCategories.forEach((categoryName) => {
            const params = new URLSearchParams({ date: stockDateInput.value, location: locationName, category: categoryName });
            requests.push(fetch(`${API_URL}?${params.toString()}`));
          });
        });
        const responses = await Promise.all(requests);
        for (const response of responses) {
          if (!response.ok) {
            const errorPayload = await response.json().catch(() => ({}));
            throw new Error(errorPayload.error || 'Unable to load daily stocks.');
          }
        }
        const resultSets = await Promise.all(responses.map((response) => response.json()));
        const mergedRows = resultSets.flat();
        const uniqueRowsMap = new Map();
        mergedRows.forEach((row) => { uniqueRowsMap.set(Number(row.id), row); });
        loadedRows = Array.from(uniqueRowsMap.values()).sort((firstRow, secondRow) => {
          const catSort = String(firstRow.category || '').localeCompare(String(secondRow.category || ''));
          if (catSort !== 0) return catSort;
          return String(firstRow.size || '').localeCompare(String(secondRow.size || ''), undefined, { numeric: true });
        });
        await refreshFilterSubCategoryOptions(getSelectedValues(subCategorySelect));
        renderFilteredGrid();
      } catch (error) {
        console.error(error);
        alert(error.message || 'Unable to load daily stocks.');
      }
    }

    /* ============ EVENT WIRING ============ */
    addRowForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const categories = getSelectedValues(recordCategoryInput);
      const subCategories = getSelectedValues(recordSubCategoryInput);
      const qtyFor1Cabin = Number(document.getElementById('qtyOneInput').value || 0);
      const stockAtKpr = Number(document.getElementById('stockInput').value || 0);
      if (!categories.length || !subCategories.length) {
        alert('Please select at least one category and one sub-category.');
        return;
      }
      if (!isValidLocation(getSelectedLocation())) {
        alert('Please select a valid location.');
        return;
      }
      const pairs = [];
      categories.forEach((category) => {
        subCategories.forEach((subCategory) => {
          const allowedCategorySet = recordSubCategoryCategoryMap.get(subCategory);
          if (allowedCategorySet && allowedCategorySet.has(category)) {
            pairs.push({ category, size: subCategory });
          }
        });
      });
      if (!pairs.length) {
        alert('No valid category and sub-category combinations selected.');
        return;
      }
      try {
        for (const pair of pairs) {
          const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              stock_date: getTodayLocalISO(),
              location: getSelectedLocation(),
              category: pair.category,
              size: pair.size,
              qty_for_1_cabin: qtyFor1Cabin,
              cabin_count: getCabinCount(),
              stock_at_kpr: stockAtKpr
            })
          });
          if (!response.ok) {
            const errorPayload = await response.json().catch(() => ({}));
            throw new Error(errorPayload.error || `Unable to add stock row for ${pair.category} - ${pair.size}.`);
          }
        }
        const selectedFilters = getSelectedFilterLocations();
        const selectedItemLocation = getSelectedLocation();
        if (!selectedFilters.includes(selectedItemLocation)) {
          setSelectedFilterLocations([...selectedFilters, selectedItemLocation]);
        }
        stockDateInput.value = getTodayLocalISO();
        setSelectedValues(categorySelect, categories);
        await refreshFilterSubCategoryOptions(subCategories);
        closeAddRecordModal();
        await loadStocks();
      } catch (error) {
        console.error(error);
        alert(error.message || 'Unable to add stock row.');
      }
    });
    loadBtn.addEventListener('click', loadStocks);
    importExcelBtn.addEventListener('click', () => importExcelInput.click());
    importExcelInput.addEventListener('change', async () => {
      const [file] = importExcelInput.files;
      importExcelInput.value = '';
      if (!file) return;
      if (typeof XLSX === 'undefined') { alert('Excel import library failed to load. Please refresh and try again.'); return; }
      if (!isTodaySelected()) { alert("Daily Stocks can import records only for today. Select today's date and try again."); return; }
      try {
        const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        if (!rows.length) throw new Error('The selected file has no data rows.');
        const getValue = (row, ...names) => {
          const normalizedRow = Object.fromEntries(Object.entries(row).map(([key, value]) => [key.replace(/[^a-z0-9]/gi, '').toUpperCase(), value]));
          for (const name of names) {
            const value = normalizedRow[name.replace(/[^a-z0-9]/gi, '').toUpperCase()];
            if (value !== undefined && value !== '') return value;
          }
          return '';
        };
        const records = rows.map((row) => ({
          location: normalizeLocationName(getValue(row, 'LOCATION/PLANT', 'LOCATION')),
          category: normalizeCategoryName(getValue(row, 'CATEGORY')),
          size: normalizeCategoryName(getValue(row, 'SUB-CATEGORY', 'SUBCATEGORY', 'SIZE', 'MATERIAL DESCRIPTION')),
          qty_for_1_cabin: Number(getValue(row, 'QTY FOR 1 CABIN (20 FT) IN NOS', 'QTY FOR 1 CABIN')) || 0,
          stock_at_kpr: Number(getValue(row, 'STOCK AT KPR', 'STOCK AVAILABLE')) || 0
        }));
        const invalidRecord = records.find((record) => !isValidLocation(record.location) || !record.category || !record.size);
        if (invalidRecord) throw new Error('Each row requires LOCATION/PLANT, CATEGORY, and SUB-CATEGORY.');
        const importedCategories = [...new Set(records.map((record) => record.category))];
        for (const category of importedCategories) {
          const response = await fetch(CATEGORY_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: category })
          });
          if (!response.ok && response.status !== 409) {
            const payload = await response.json().catch(() => ({}));
            throw new Error(payload.error || `Unable to add category ${category}.`);
          }
        }
        const categorySubCategoryPairs = new Map();
        records.forEach((record) => categorySubCategoryPairs.set(`${record.category}\u0000${record.size}`, record));
        for (const record of categorySubCategoryPairs.values()) {
          const response = await fetch(SUBCATEGORY_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category: record.category, name: record.size })
          });
          if (!response.ok && response.status !== 409) {
            const payload = await response.json().catch(() => ({}));
            throw new Error(payload.error || `Unable to add sub-category ${record.size}.`);
          }
        }
        for (const record of records) {
          const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              stock_date: stockDateInput.value,
              location: record.location,
              category: record.category,
              size: record.size,
              qty_for_1_cabin: record.qty_for_1_cabin,
              cabin_count: getCabinCount(),
              stock_at_kpr: record.stock_at_kpr
            })
          });
          if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            throw new Error(payload.error || 'Unable to import a daily stock record.');
          }
        }
        const selectedCategories = [...new Set([...getSelectedFilterCategories(), ...importedCategories])];
        const importedLocations = records.map((record) => record.location);
        setSelectedFilterLocations([...getSelectedFilterLocations(), ...importedLocations]);
        await loadCategories(selectedCategories);
        await refreshFilterSubCategoryOptions();
        await loadStocks();
        alert(`${records.length} daily stock record(s) imported.`);
      } catch (error) {
        console.error(error);
        alert(error.message || 'Unable to import daily stock records.');
      }
    });
    exportExcelBtn.addEventListener('click', () => {
      if (!stockDateInput.value) { alert('Please select a date first.'); return; }
      if (!currentRows.length) { alert('No records available to export for selected filters.'); return; }
      if (typeof XLSX === 'undefined') { alert('Excel export library failed to load. Please refresh and try again.'); return; }
      const cabinCount = getCabinCount();
      const descriptionColumn = 'SUB-CATEGORY';
      const qtyForCountColumn = `QTY FOR ${cabinCount} CABIN (20 FT) in NOS`;
      const exportRows = currentRows.map((row, index) => {
        const qtyOne = toNumber(row.qty_for_1_cabin);
        const qtyForCount = qtyOne * cabinCount;
        const stockAtKpr = toNumber(row.stock_at_kpr);
        const required = stockAtKpr - qtyForCount;
        const cabinWiseStock = qtyOne === 0 ? 0 : stockAtKpr / qtyOne;
        return {
          'SR NO': index + 1,
          'LOCATION/PLANT': row.location || '',
          'CATEGORY': row.category || '',
          [descriptionColumn]: row.size || '',
          'QTY FOR 1 CABIN (20 FT) in NOS': qtyOne,
          [qtyForCountColumn]: qtyForCount,
          'STOCK AT KPR': stockAtKpr,
          'REQUIRED': required,
          'Cabin Wise Stock': cabinWiseStock
        };
      });
      const worksheet = XLSX.utils.json_to_sheet(exportRows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Daily Stocks');
      const safeDate = stockDateInput.value || getTodayLocalISO();
      XLSX.writeFile(workbook, `daily-stocks-${safeDate}.xlsx`);
    });
    findBtn.addEventListener('click', renderFilteredGrid);
    findInput.addEventListener('input', renderFilteredGrid);
    findInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') { event.preventDefault(); renderFilteredGrid(); }
    });
    clearFindBtn.addEventListener('click', () => {
      findInput.value = '';
      setSelectedValues(subCategorySelect, []);
      renderFilterSubCategoryDropdown();
      renderFilteredGrid();
    });
    openAddRecordBtn.addEventListener('click', openAddRecordModal);
    addCategoryBtn.addEventListener('click', async () => { await addNewCategory(getSelectedFilterCategories()); });
    addSubCategoryBtn.addEventListener('click', async () => {
      await addNewSubCategory(getSelectedFilterCategories(), getSelectedValues(subCategorySelect), async (nextSelections) => {
        await refreshFilterSubCategoryOptions(nextSelections);
        renderFilteredGrid();
      });
    });
    addRecordSubCategoryBtn.addEventListener('click', async () => {
      await addNewSubCategory(getSelectedValues(recordCategoryInput), getSelectedValues(recordSubCategoryInput), async (nextSelections) => {
        await refreshRecordSubCategoryOptions(nextSelections);
      });
    });
    closeRecordModalBtn.addEventListener('click', closeAddRecordModal);
    cancelRecordBtn.addEventListener('click', closeAddRecordModal);
    recordModal.addEventListener('click', (event) => { if (event.target === recordModal) closeAddRecordModal(); });
    locationDropdownBtn.addEventListener('click', () => { toggleMenu(locationDropdownMenu); });
    categoryDropdownBtn.addEventListener('click', () => { toggleMenu(categoryDropdownMenu); });
    subCategoryDropdownBtn.addEventListener('click', () => { if (!subCategorySelect.disabled) toggleMenu(subCategoryDropdownMenu); });
    recordCategoryDropdownBtn.addEventListener('click', () => { toggleMenu(recordCategoryDropdownMenu); });
    recordSubCategoryDropdownBtn.addEventListener('click', () => { if (!recordSubCategoryInput.disabled) toggleMenu(recordSubCategoryDropdownMenu); });
    document.addEventListener('click', (event) => {
      if (!locationMultiSelect.contains(event.target)) closeMenu(locationDropdownMenu);
      if (!categoryMultiSelect.contains(event.target)) closeMenu(categoryDropdownMenu);
      if (!subCategoryMultiSelect.contains(event.target)) closeMenu(subCategoryDropdownMenu);
      if (!recordCategoryMultiSelect.contains(event.target)) closeMenu(recordCategoryDropdownMenu);
      if (!recordSubCategoryMultiSelect.contains(event.target)) closeMenu(recordSubCategoryDropdownMenu);
    });
    locationSelectAllCheckbox.addEventListener('change', async () => {
      if (locationSelectAllCheckbox.checked) setSelectedFilterLocations(LOCATIONS);
      else setSelectedFilterLocations([]);
      localStorage.setItem(LOCATION_FILTER_STORAGE_KEY, JSON.stringify(getSelectedFilterLocations()));
      editingRowId = null;
      await loadStocks();
    });
    itemLocationInput.addEventListener('change', () => {
      localStorage.setItem(ITEM_LOCATION_STORAGE_KEY, getSelectedLocation());
    });
    stockDateInput.addEventListener('change', loadStocks);
    cabinCountInput.addEventListener('change', () => {
      cabinCountInput.value = String(getCabinCount());
      updateDynamicLabels();
      renderGrid(currentRows);
    });
    window.startRowEdit = startRowEdit;
    window.cancelRowEdit = cancelRowEdit;
    window.saveRowEdit = saveRowEdit;
    window.deleteRow = deleteRow;

    /* ============ INIT ============ */
    (async function initializePage() {
      const today = getTodayLocalISO();
      initializeLocationOptions();
      await loadCategories();
      stockDateInput.max = today;
      stockDateInput.value = today;
      await refreshRecordSubCategoryOptions();
      await loadStocks({ silent: true });
    })();
    } catch (err) {
      console.error('[dailystocks.js] initDailyStocks failed:', err);
    }
    /* ============ SOFT REFRESH HOOK ============ */
    dsState.refresh = async function () {
        try {
            await loadCategories();
            await refreshFilterSubCategoryOptions(getSelectedValues(subCategorySelect));
            await loadStocks({ silent: true });
        } catch (err) {
            console.error('[dailystocks] soft refresh failed:', err);
        }
    };  
    /* ============ INIT ============ */
    (async function initializePage() {
        const today = getTodayLocalISO();
        initializeLocationOptions();
        await loadCategories();
        stockDateInput.max = today;
        stockDateInput.value = today;
        await refreshRecordSubCategoryOptions();
        await loadStocks({ silent: true });
    })();

    dsState.refresh = async function () {   // ← ADD THIS
        try {
            await loadCategories();
            await refreshFilterSubCategoryOptions(getSelectedValues(subCategorySelect));
            await loadStocks({ silent: true });
        } catch (err) {
            console.error('[dailystocks] soft refresh failed:', err);
        }
    };
}

window.initDailyStocksPage = function () {
    // First call → full init
    if (!dsState.initialized) {
        initDailyStocks();
        return;
    }
    // Subsequent calls → soft refresh only (no listener duplication)
    if (typeof dsState.refresh === 'function') {
        dsState.refresh();
        return;
    }
    // Fallback: full re-init (should rarely happen)
    dsState.initialized = false;
    initDailyStocks();
};
})();