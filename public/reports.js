/* =========================================================
   InventorySystem2 — Reports page controller
   Scoped to #is2-reports, SPA-friendly (idempotent)
   ========================================================= */
(function () {
  'use strict';

  if (window.__is2ReportsInit) return;
  window.__is2ReportsInit = true;

  function getRoot() {
    return document.getElementById('is2-reports');
  }

  /* =========================================================
     SHARED HELPERS
     ========================================================= */
  function fmtCurrency(v) {
    const n = Number(v) || 0;
    return new Intl.NumberFormat('en-IN', {
      maximumFractionDigits: 2,
      minimumFractionDigits: 0
    }).format(n);
  }

  function fmtNumber(v) {
    const n = Number(v) || 0;
    return Number.isInteger(n) ? String(n) : n.toFixed(2);
  }

  function monthStartISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  }

  function todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function el(id) { return document.getElementById(id); }

  function selectedLocation() {
    const sel = el('is2ReportsLocation');
    return sel ? String(sel.value || '').trim() : '';
  }

  function renderSummary(panelSelector, items, totalElId, totalFormatter) {
    const root = getRoot();
    if (!root) return;
    const panel = root.querySelector(panelSelector);
    if (!panel) return;

    const values = items.map(i => Number(i.value) || 0);
    const maxVal = Math.max(1, ...values);
    const total = values.reduce((s, v) => s + v, 0);

    const totalEl = el(totalElId);
    if (totalEl) {
      totalEl.textContent = totalFormatter ? totalFormatter(total) : total;
    }

    items.forEach(({ key, value }) => {
      const bar = panel.querySelector(`.is2-cp-progress-bar[data-bar="${key}"]`);
      const valEl = panel.querySelector(`.is2-cp-work-value[data-val="${key}"]`);
      const v = Number(value) || 0;
      const pct = Math.round((v / maxVal) * 100);
      if (bar) bar.style.width = pct + '%';
      if (valEl) valEl.textContent = fmtNumber(v);
    });
  }

  /* =========================================================
     CONTRACTOR REPORT MODULE
     ========================================================= */
  const CONTRACTOR_API_URL = './api/contractor-payments';
  const WORK_SUMMARY_CONFIG = [
    { key: 'fabrication', label: 'Fabrication' }, { key: 'cement_sheet', label: 'Cement Sheet' },
    { key: 'electrical', label: 'Electrical' }, { key: 'tiles', label: 'Tiles' },
    { key: 'plumbing', label: 'Plumbing' }, { key: 'door_fitting', label: 'Door Fitting' },
    { key: 'outer_colour', label: 'Outer Colour' }, { key: 'inner_colour', label: 'Inner Colour' }
  ];
  const cpState = { initialized: false, rows: [] };

  function cpRenderKpis(rows) {
    const totalContractors = rows.length;
    const totalAmount  = rows.reduce((s, r) => s + (Number(r.total_amount)  || 0), 0);
    const totalPayment = rows.reduce((s, r) => s + (Number(r.total_payment) || 0), 0);
    const totalBalance = totalAmount - totalPayment;

    const elT = el('is2CpTotalContractors'); const elA = el('is2CpTotalAmount');
    const elP = el('is2CpTotalPayment'); const elB = el('is2CpTotalBalance');

    if (elT) elT.textContent = totalContractors;
    if (elA) elA.textContent = `₹${fmtCurrency(totalAmount)}`;
    if (elP) elP.textContent = `₹${fmtCurrency(totalPayment)}`;
    if (elB) elB.textContent = `₹${fmtCurrency(totalBalance)}`;
  }

  function cpRenderWorkSummary(rows) {
    const totals = {};
    WORK_SUMMARY_CONFIG.forEach(cfg => { totals[cfg.key] = rows.reduce((s, r) => s + (Number(r[cfg.key]) || 0), 0); });
    const maxVal = Math.max(1, ...Object.values(totals));
    const totalQty = Object.values(totals).reduce((s, v) => s + v, 0);
    const qtyEl = el('is2CpTotalQuantity');
    if (qtyEl) qtyEl.textContent = fmtNumber(totalQty);

    const root = getRoot();
    if (!root) return;
    WORK_SUMMARY_CONFIG.forEach(cfg => {
      const barEl = root.querySelector(`.is2-cp-progress-bar[data-bar="${cfg.key}"]`);
      const valEl = root.querySelector(`.is2-cp-work-value[data-val="${cfg.key}"]`);
      const value = totals[cfg.key] || 0;
      const pct = Math.round((value / maxVal) * 100);
      if (barEl) barEl.style.width = pct + '%';
      if (valEl) valEl.textContent = fmtNumber(value);
    });
  }

  async function cpFetchRows() {
    const params = new URLSearchParams();
    const from = el('is2CpFromDate')?.value; const to = el('is2CpToDate')?.value;
    const st = el('is2CpStatus')?.value; const wt = el('is2CpWorkType')?.value;
    const srch = el('is2CpSearch')?.value?.trim(); const loc = selectedLocation();

    if (from) params.set('fromDate', from);
    if (to)   params.set('toDate', to);
    if (st && st !== 'ALL') params.set('status', st);
    if (wt && wt !== 'ALL') params.set('workType', wt);
    if (srch) params.set('search', srch);
    if (loc)  params.append('location', loc);

    try {
      const res = await fetch(`${CONTRACTOR_API_URL}?${params.toString()}`, { credentials: 'include' });
      if (!res.ok) return [];
      const payload = await res.json();
      return Array.isArray(payload.rows) ? payload.rows : [];
    } catch (e) { return []; }
  }

  async function cpRefresh() {
    const rows = await cpFetchRows();
    cpState.rows = rows;
    cpRenderKpis(rows);
    cpRenderWorkSummary(rows);
  }

  function cpApplyDefaultDates() {
    const from = el('is2CpFromDate'); const to = el('is2CpToDate');
    if (from && !from.value) from.value = monthStartISO();
    if (to   && !to.value)   to.value   = todayISO();
  }

  function cpWireEvents() {
    if (cpState.initialized) return;
    cpState.initialized = true;
    el('is2CpApply')?.addEventListener('click', cpRefresh);
    el('is2CpReset')?.addEventListener('click', () => {
      const from = el('is2CpFromDate'); const to = el('is2CpToDate');
      if (from) from.value = monthStartISO();
      if (to)   to.value   = todayISO();
      if (el('is2CpSearch'))   el('is2CpSearch').value   = '';
      if (el('is2CpStatus'))   el('is2CpStatus').value   = 'ALL';
      if (el('is2CpWorkType')) el('is2CpWorkType').value = 'ALL';
      cpRefresh();
    });
    el('is2CpSearch')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); cpRefresh(); } });
  }

  window.is2ReportsOnContractor = function () {
    cpApplyDefaultDates(); cpWireEvents(); cpRefresh();
  };

  /* =========================================================
     SALE REPORT MODULE
     ========================================================= */
  const SALE_API_URL = './api/sale-reports';
  const SALE_TOP_ITEMS = [ { key: 'cement', label: 'Cement' }, { key: 'steel',  label: 'Steel'  }, { key: 'paint',  label: 'Paint'  }, { key: 'tiles',  label: 'Tiles'  } ];
  const saleState = { initialized: false, rows: [] };

  function saleRenderKpis(rows) {
    const totalInvoices = rows.length;
    const totalValue    = rows.reduce((s, r) => s + (Number(r.total_value) || 0), 0);
    const received      = rows.reduce((s, r) => s + (Number(r.received)    || 0), 0);
    const outstanding   = totalValue - received;
    if (el('is2SaleTotalInvoices')) el('is2SaleTotalInvoices').textContent = totalInvoices;
    if (el('is2SaleTotalValue')) el('is2SaleTotalValue').textContent = `₹${fmtCurrency(totalValue)}`;
    if (el('is2SaleReceivedAmount')) el('is2SaleReceivedAmount').textContent = `₹${fmtCurrency(received)}`;
    if (el('is2SaleOutstanding')) el('is2SaleOutstanding').textContent = `₹${fmtCurrency(outstanding)}`;
  }

  function saleRenderTopItems(rows) {
    const totals = {};
    SALE_TOP_ITEMS.forEach(cfg => { totals[cfg.key] = rows.reduce((s, r) => s + (Number(r[cfg.key]) || 0), 0); });
    const items = SALE_TOP_ITEMS.map(cfg => ({ key: cfg.key, value: totals[cfg.key] }));
    renderSummary('[data-panel="sale"]', items, 'is2SaleTotalItems');
  }

  async function saleFetchRows() {
    const params = new URLSearchParams();
    const from = el('is2SaleFromDate')?.value; const to = el('is2SaleToDate')?.value;
    const st = el('is2SaleStatus')?.value; const cat = el('is2SaleCategory')?.value;
    const srch = el('is2SaleSearch')?.value?.trim(); const loc = selectedLocation();

    if (from) params.set('fromDate', from); if (to) params.set('toDate', to);
    if (st && st !== 'ALL') params.set('status', st); if (cat && cat !== 'ALL') params.set('category', cat);
    if (srch) params.set('search', srch); if (loc)  params.set('location', loc);

    try {
      const res = await fetch(`${SALE_API_URL}?${params.toString()}`, { credentials: 'include' });
      if (!res.ok) return [];
      const payload = await res.json();
      return Array.isArray(payload.rows) ? payload.rows : [];
    } catch (e) { return []; }
  }

  async function saleRefresh() {
    const rows = await saleFetchRows();
    saleState.rows = rows;
    saleRenderKpis(rows);
    saleRenderTopItems(rows);
  }

  function saleApplyDefaultDates() {
    const from = el('is2SaleFromDate'); const to = el('is2SaleToDate');
    if (from && !from.value) from.value = monthStartISO();
    if (to   && !to.value)   to.value   = todayISO();
  }

  function saleWireEvents() {
    if (saleState.initialized) return;
    saleState.initialized = true;
    el('is2SaleApply')?.addEventListener('click', saleRefresh);
    el('is2SaleReset')?.addEventListener('click', () => {
      const from = el('is2SaleFromDate'); const to = el('is2SaleToDate');
      if (from) from.value = monthStartISO(); if (to)   to.value   = todayISO();
      if (el('is2SaleSearch'))   el('is2SaleSearch').value   = '';
      if (el('is2SaleStatus'))   el('is2SaleStatus').value   = 'ALL';
      if (el('is2SaleCategory')) el('is2SaleCategory').value = 'ALL';
      saleRefresh();
    });
    el('is2SaleSearch')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); saleRefresh(); } });
  }

  window.is2ReportsOnSale = function () { saleApplyDefaultDates(); saleWireEvents(); saleRefresh(); };

  /* =========================================================
     PURCHASE REPORT MODULE
     ========================================================= */
  const PURCHASE_API_URL = './api/purchase-reports';
  const PURCHASE_TOP_SUPPLIERS = [ { key: 'supplier_a', label: 'Supplier A' }, { key: 'supplier_b', label: 'Supplier B' }, { key: 'supplier_c', label: 'Supplier C' }, { key: 'supplier_d', label: 'Supplier D' } ];
  const purchaseState = { initialized: false, rows: [] };

  function purchaseRenderKpis(rows) {
    const totalOrders  = rows.length;
    const totalValue   = rows.reduce((s, r) => s + (Number(r.total_value) || 0), 0);
    const paid         = rows.reduce((s, r) => s + (Number(r.paid)        || 0), 0);
    const balance      = totalValue - paid;
    if (el('is2PurTotalOrders')) el('is2PurTotalOrders').textContent = totalOrders;
    if (el('is2PurTotalValue')) el('is2PurTotalValue').textContent = `₹${fmtCurrency(totalValue)}`;
    if (el('is2PurPaidAmount')) el('is2PurPaidAmount').textContent = `₹${fmtCurrency(paid)}`;
    if (el('is2PurBalance')) el('is2PurBalance').textContent = `₹${fmtCurrency(balance)}`;
  }

  function purchaseRenderTopSuppliers(rows) {
    const totals = {};
    PURCHASE_TOP_SUPPLIERS.forEach(cfg => { totals[cfg.key] = rows.reduce((s, r) => s + (Number(r[cfg.key]) || 0), 0); });
    const items = PURCHASE_TOP_SUPPLIERS.map(cfg => ({ key: cfg.key, value: totals[cfg.key] }));
    renderSummary('[data-panel="purchase"]', items, 'is2PurTotalSuppliers');
  }

  async function purchaseFetchRows() {
    const params = new URLSearchParams();
    const from = el('is2PurFromDate')?.value; const to = el('is2PurToDate')?.value;
    const st = el('is2PurStatus')?.value; const cat = el('is2PurCategory')?.value;
    const srch = el('is2PurSearch')?.value?.trim(); const loc = selectedLocation();

    if (from) params.set('fromDate', from); if (to) params.set('toDate', to);
    if (st && st !== 'ALL') params.set('status', st); if (cat && cat !== 'ALL') params.set('category', cat);
    if (srch) params.set('search', srch); if (loc)  params.set('location', loc);

    try {
      const res = await fetch(`${PURCHASE_API_URL}?${params.toString()}`, { credentials: 'include' });
      if (!res.ok) return [];
      const payload = await res.json();
      return Array.isArray(payload.rows) ? payload.rows : [];
    } catch (e) { return []; }
  }

  async function purchaseRefresh() {
    const rows = await purchaseFetchRows();
    purchaseState.rows = rows;
    purchaseRenderKpis(rows);
    purchaseRenderTopSuppliers(rows);
  }

  function purchaseApplyDefaultDates() {
    const from = el('is2PurFromDate'); const to = el('is2PurToDate');
    if (from && !from.value) from.value = monthStartISO();
    if (to   && !to.value)   to.value   = todayISO();
  }

  function purchaseWireEvents() {
    if (purchaseState.initialized) return;
    purchaseState.initialized = true;
    el('is2PurApply')?.addEventListener('click', purchaseRefresh);
    el('is2PurReset')?.addEventListener('click', () => {
      const from = el('is2PurFromDate'); const to = el('is2PurToDate');
      if (from) from.value = monthStartISO(); if (to)   to.value   = todayISO();
      if (el('is2PurSearch'))   el('is2PurSearch').value   = '';
      if (el('is2PurStatus'))   el('is2PurStatus').value   = 'ALL';
      if (el('is2PurCategory')) el('is2PurCategory').value = 'ALL';
      purchaseRefresh();
    });
    el('is2PurSearch')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); purchaseRefresh(); } });
  }

  window.is2ReportsOnPurchase = function () { purchaseApplyDefaultDates(); purchaseWireEvents(); purchaseRefresh(); };

  /* =========================================================
     ATTENDANCE REPORT MODULE
     ========================================================= */
  const ATT_STORAGE_KEY = 'attendance_payment_records_v2';
  const ATT_DEPARTMENTS  = ['Production', 'Accounts', 'HR', 'Sales'];
  const attendanceState = { initialized: false, rows: [] };

  function attDaysInMonth(month, year) { return new Date(Number(year), Number(month), 0).getDate(); }
  function attIsoDate(month, year, day) { return `${year}-${month}-${String(day).padStart(2, '0')}`; }
  function attIsFutureDate(isoStr) {
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return isoStr > today;
  }

  function attGetTotals(record, month, year) {
    const daysInM = attDaysInMonth(month, year);
    const byDate  = new Map((record.daily || []).map(d => [d.date, d]));
    const presentDays = [];
    for (let i = 1; i <= daysInM; i++) {
      const date = attIsoDate(month, year, i);
      const day  = byDate.get(date);
      if (!day) continue;
      if (day.status !== 'P') continue;
      if (attIsFutureDate(date)) continue;
      if (record.joiningDate && date < record.joiningDate) continue;
      presentDays.push(day);
    }
    const hours = presentDays.reduce((s, d) => s + Number(d.hours || 0), 0);
    const total = presentDays.reduce((s, d) => s + (Number(d.rate || 0) * Number(d.hours || 0)), 0);
    const paid  = Number(record.paid || 0);
    const due   = Math.max(0, total - paid);
    return { hours, present: presentDays.length, total, paid, due };
  }

  function attLoadRecords() {
    try { const saved = JSON.parse(localStorage.getItem(ATT_STORAGE_KEY)); if (Array.isArray(saved) && saved.length) return saved; } catch (e) {}
    return [];
  }

  function attMatchesFilters(record, totals, filters) {
    const q = (filters.search || '').toLowerCase();
    const nameMatch = !q || `${record.name} ${record.id}`.toLowerCase().includes(q);
    const deptMatch = filters.department === 'ALL' || record.department === filters.department;
    const locMatch  = !filters.location || record.location === filters.location;
    let statusMatch = true;
    if (filters.status === 'PAID')    statusMatch = totals.due === 0 && totals.paid > 0;
    if (filters.status === 'PARTIAL') statusMatch = totals.paid > 0 && totals.due > 0;
    if (filters.status === 'PENDING') statusMatch = totals.paid === 0 && totals.total > 0;
    return nameMatch && deptMatch && locMatch && statusMatch;
  }

  function attReadFilters() {
    return {
      month:      el('is2AttMonth')?.value      || String(new Date().getMonth() + 1).padStart(2, '0'),
      year:       el('is2AttYear')?.value       || String(new Date().getFullYear()),
      search:     el('is2AttSearch')?.value?.trim() || '',
      department: el('is2AttDepartment')?.value || 'ALL',
      status:     el('is2AttStatus')?.value     || 'ALL',
      location:   selectedLocation()
    };
  }

  function attRenderKpis(rows, totals) {
    const totalEmployees = rows.length;
    const totalPresent   = totals.reduce((s, t) => s + t.present, 0);
    const totalPayable   = totals.reduce((s, t) => s + t.total,   0);
    const totalPaid      = totals.reduce((s, t) => s + t.paid,    0);
    const totalDue       = totals.reduce((s, t) => s + t.due,     0);
    const set = (id, v) => { const n = el(id); if (n) n.textContent = v; };
    set('is2AttTotalEmployees', totalEmployees); set('is2AttTotalPresent',   totalPresent);
    set('is2AttTotalPayable',   '₹' + fmtCurrency(totalPayable)); set('is2AttTotalDue',       '₹' + fmtCurrency(totalDue));
    set('is2AttTotalPaid',      '₹' + fmtCurrency(totalPaid));
  }

  function attRenderDepartmentSummary(rows, totals) {
    const root = getRoot(); if (!root) return;
    const panel = root.querySelector('[data-panel="attendance"]'); if (!panel) return;
    const deptTotals = {}; ATT_DEPARTMENTS.forEach(d => { deptTotals[d.toLowerCase()] = 0; });
    rows.forEach((record, i) => { const key = (record.department || '').toLowerCase(); if (key in deptTotals) deptTotals[key] += totals[i].total; });
    const maxVal = Math.max(1, ...Object.values(deptTotals));
    ATT_DEPARTMENTS.forEach(dept => {
      const key   = dept.toLowerCase();
      const value = deptTotals[key] || 0;
      const pct   = Math.round((value / maxVal) * 100);
      const bar   = panel.querySelector(`.is2-cp-progress-bar[data-bar="${key}"]`);
      const valEl = panel.querySelector(`.is2-cp-work-value[data-val="${key}"]`);
      if (bar)   bar.style.width = pct + '%';
      if (valEl) valEl.textContent = '₹' + fmtCurrency(value);
    });
  }

  function attRefresh() {
    const filters = attReadFilters();
    const all     = attLoadRecords();
    const filtered = []; const totals   = [];
    all.forEach(record => {
      const t = attGetTotals(record, filters.month, filters.year);
      if (attMatchesFilters(record, t, filters)) { filtered.push(record); totals.push(t); }
    });
    attendanceState.rows = filtered;
    attRenderKpis(filtered, totals);
    attRenderDepartmentSummary(filtered, totals);
  }

  function attApplyDefaults() {
    const now   = new Date();
    const month = el('is2AttMonth'); const year  = el('is2AttYear');
    if (month) month.value = String(now.getMonth() + 1).padStart(2, '0');
    if (year)  year.value  = String(now.getFullYear());
  }

  function attWireEvents() {
    if (attendanceState.initialized) return;
    attendanceState.initialized = true;
    el('is2AttApply')?.addEventListener('click', attRefresh);
    el('is2AttReset')?.addEventListener('click', () => {
      attApplyDefaults();
      if (el('is2AttSearch'))     el('is2AttSearch').value     = '';
      if (el('is2AttDepartment')) el('is2AttDepartment').value = 'ALL';
      if (el('is2AttStatus'))     el('is2AttStatus').value     = 'ALL';
      attRefresh();
    });
    el('is2AttSearch')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); attRefresh(); } });
    el('is2AttMonth')?.addEventListener('change', attRefresh);
    el('is2AttYear')?.addEventListener('change', attRefresh);
  }

  window.is2ReportsOnAttendance = function () { attApplyDefaults(); attWireEvents(); attRefresh(); };

  window.addEventListener('storage', (e) => {
    if (e.key !== ATT_STORAGE_KEY) return;
    const root = getRoot(); if (!root) return;
    if (root.querySelector('.is2-reports-tab.is2-active')?.dataset.tab === 'attendance') { attRefresh(); }
  });

  /* =========================================================
     PRODUCTS REPORT MODULE (NEW)
     ========================================================= */
  const PRODUCTS_API_URL = './api/products';
  const PRODUCT_CATEGORIES = [
    { key: 'cat_cement', label: 'Cement', search: 'cement' },
    { key: 'cat_steel', label: 'Steel', search: 'steel' },
    { key: 'cat_paint', label: 'Paint', search: 'paint' },
    { key: 'cat_tiles', label: 'Tiles', search: 'tile' }
  ];
  const productState = { initialized: false, rows: [] };

  function prodRenderKpis(rows) {
    const totalItems = rows.length;
    const totalStock = rows.reduce((s, r) => s + Number(r.stock || 0), 0);
    const purchaseValue = rows.reduce((s, r) => s + (Number(r.stock || 0) * Number(r.purchase_price || 0)), 0);
    const saleValue = rows.reduce((s, r) => s + (Number(r.stock || 0) * Number(r.sale_price || 0)), 0);

    if (el('is2ProdTotalItems')) el('is2ProdTotalItems').textContent = totalItems;
    if (el('is2ProdTotalStock')) el('is2ProdTotalStock').textContent = fmtNumber(totalStock);
    if (el('is2ProdPurchaseValue')) el('is2ProdPurchaseValue').textContent = `₹${fmtCurrency(purchaseValue)}`;
    if (el('is2ProdSaleValue')) el('is2ProdSaleValue').textContent = `₹${fmtCurrency(saleValue)}`;
  }

  function prodRenderCategorySummary(rows) {
    const totals = {};
    PRODUCT_CATEGORIES.forEach(cfg => {
      totals[cfg.key] = rows
        .filter(r => String(r.category || '').toLowerCase().includes(cfg.search) || String(r.product_name || '').toLowerCase().includes(cfg.search))
        .reduce((s, r) => s + Number(r.stock || 0), 0);
    });
    const items = PRODUCT_CATEGORIES.map(cfg => ({ key: cfg.key, value: totals[cfg.key] }));
    renderSummary('[data-panel="products"]', items, 'is2ProdTotalCategories');
  }

  async function prodFetchRows() {
    const params = new URLSearchParams();
    const srch = el('is2ProdSearch')?.value?.trim();
    const cat  = el('is2ProdCategory')?.value;
    const loc  = selectedLocation();

    if (srch) params.set('search', srch);
    if (cat && cat !== 'ALL') params.set('category', cat);
    if (loc) params.append('location', loc);

    try {
      const res = await fetch(`${PRODUCTS_API_URL}?${params.toString()}`, { credentials: 'include' });
      if (!res.ok) return [];
      const payload = await res.json();
      return Array.isArray(payload.rows) ? payload.rows : [];
    } catch (e) { return []; }
  }

  async function prodRefresh() {
    const rows = await prodFetchRows();
    productState.rows = rows;
    prodRenderKpis(rows);
    prodRenderCategorySummary(rows);
  }

  function prodWireEvents() {
    if (productState.initialized) return;
    productState.initialized = true;
    el('is2ProdApply')?.addEventListener('click', prodRefresh);
    el('is2ProdReset')?.addEventListener('click', () => {
      if (el('is2ProdSearch')) el('is2ProdSearch').value = '';
      if (el('is2ProdCategory')) el('is2ProdCategory').value = 'ALL';
      prodRefresh();
    });
    el('is2ProdSearch')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); prodRefresh(); } });
  }

  window.is2ReportsOnProducts = function () { prodWireEvents(); prodRefresh(); };

  /* =========================================================
     PROJECTS REPORT MODULE (NEW)
     ========================================================= */
  const PROJECTS_API_URL = './api/projects';
  const projectState = { initialized: false, rows: [] };

  function projRenderKpis(rows) {
    const totalProjects = rows.length;
    const totalBudget = rows.reduce((s, r) => s + Number(r.budget || 0), 0);
    const totalCost = rows.reduce((s, r) => s + Number(r.total_cost || 0), 0);
    const totalBalance = rows.reduce((s, r) => s + Number(r.balance || 0), 0);

    if (el('is2ProjTotal')) el('is2ProjTotal').textContent = totalProjects;
    if (el('is2ProjTotalBudget')) el('is2ProjTotalBudget').textContent = `₹${fmtCurrency(totalBudget)}`;
    if (el('is2ProjTotalCost')) el('is2ProjTotalCost').textContent = `₹${fmtCurrency(totalCost)}`;
    if (el('is2ProjTotalBalance')) el('is2ProjTotalBalance').textContent = `₹${fmtCurrency(totalBalance)}`;
  }

  function projRenderStatusSummary(rows) {
    const active = rows.filter(r => r.status === 'Active').length;
    const completed = rows.filter(r => r.status === 'Completed').length;
    const onhold = rows.filter(r => r.status === 'On Hold').length;

    if (el('is2ProjActiveCount')) el('is2ProjActiveCount').textContent = active;

    const items = [
      { key: 'proj_active', value: active },
      { key: 'proj_completed', value: completed },
      { key: 'proj_onhold', value: onhold }
    ];
    renderSummary('[data-panel="projects"]', items, 'is2ProjTotalCount', (v) => v);
  }

  async function projFetchRows() {
    const params = new URLSearchParams();
    const srch = el('is2ProjSearch')?.value?.trim();
    const st   = el('is2ProjStatus')?.value;
    const loc  = selectedLocation();

    if (srch) params.set('search', srch);
    if (st && st !== 'ALL') params.set('status', st);
    if (loc) params.append('location', loc);

    try {
      const res = await fetch(`${PROJECTS_API_URL}?${params.toString()}`, { credentials: 'include' });
      if (!res.ok) return [];
      const payload = await res.json();
      return Array.isArray(payload) ? payload : (payload.rows || []);
    } catch (e) { return []; }
  }

  async function projRefresh() {
    const rows = await projFetchRows();
    projectState.rows = rows;
    projRenderKpis(rows);
    projRenderStatusSummary(rows);
  }

  function projWireEvents() {
    if (projectState.initialized) return;
    projectState.initialized = true;
    el('is2ProjApply')?.addEventListener('click', projRefresh);
    el('is2ProjReset')?.addEventListener('click', () => {
      if (el('is2ProjSearch')) el('is2ProjSearch').value = '';
      if (el('is2ProjStatus')) el('is2ProjStatus').value = 'ALL';
      projRefresh();
    });
    el('is2ProjSearch')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); projRefresh(); } });
  }

  window.is2ReportsOnProjects = function () { projWireEvents(); projRefresh(); };


  /* =========================================================
     LOCATION SELECTOR — applies to the active tab
     ========================================================= */
  function wireLocationSelector(root) {
    const sel = root.querySelector('#is2ReportsLocation');
    if (!sel || sel.dataset.wired === '1') return;
    sel.dataset.wired = '1';

    sel.addEventListener('change', () => {
      const activeTab = root.querySelector('.is2-reports-tab.is2-active')?.dataset.tab || 'contractor';
      const hooks = {
        contractor: window.is2ReportsOnContractor,
        sale:       window.is2ReportsOnSale,
        purchase:   window.is2ReportsOnPurchase,
        attendance: window.is2ReportsOnAttendance,
        products:   window.is2ReportsOnProducts,
        projects:   window.is2ReportsOnProjects
      };
      const hook = hooks[activeTab];
      if (typeof hook === 'function') hook(root);
    });
  }

  /* =========================================================
     TAB SWITCHING
     ========================================================= */
  function activateTab(root, tabName) {
    root.querySelectorAll('.is2-reports-tab').forEach(btn => {
      const isActive = btn.dataset.tab === tabName;
      btn.classList.toggle('is2-active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
    root.querySelectorAll('.is2-reports-panel').forEach(panel => {
      panel.classList.toggle('is2-active', panel.dataset.panel === tabName);
    });
    try { localStorage.setItem('is2.reports.activeTab', tabName); } catch (e) {}
    root.dispatchEvent(new CustomEvent('is2:reportTabChange', { bubbles: true, detail: { tab: tabName } }));

    const hooks = {
      contractor: window.is2ReportsOnContractor,
      sale:       window.is2ReportsOnSale,
      purchase:   window.is2ReportsOnPurchase,
      attendance: window.is2ReportsOnAttendance,
      products:   window.is2ReportsOnProducts,
      projects:   window.is2ReportsOnProjects
    };
    const hook = hooks[tabName];
    if (typeof hook === 'function') {
      try { hook(root); } catch (e) { console.error('[reports.js] hook error:', e); }
    }
  }

  function wireTabs(root) {
    if (root.dataset.tabsWired === '1') return;
    root.dataset.tabsWired = '1';
    root.querySelectorAll('.is2-reports-tab').forEach(btn => {
      btn.addEventListener('click', () => { activateTab(root, btn.dataset.tab); });
    });
  }

  function wireExport(root) {
    const btn = root.querySelector('#is2ReportsExport');
    if (!btn || btn.dataset.wired === '1') return;
    btn.dataset.wired = '1';
    btn.addEventListener('click', () => {
      const activeTab = root.querySelector('.is2-reports-tab.is2-active')?.dataset.tab || 'contractor';
      console.log('[reports.js] Export requested for tab:', activeTab);
      root.dispatchEvent(new CustomEvent('is2:reportExport', { bubbles: true, detail: { tab: activeTab } }));
    });
  }

  /* =========================================================
     INIT
     ========================================================= */
  function init() {
    const root = getRoot();
    if (!root) return;
    wireTabs(root); wireExport(root); wireLocationSelector(root);
    let saved = 'contractor';
    try { saved = localStorage.getItem('is2.reports.activeTab') || 'contractor'; } catch (e) {}
    if (!root.querySelector(`.is2-reports-tab[data-tab="${saved}"]`)) saved = 'contractor';
    activateTab(root, saved);
  }

  window.initReportsPage = function () {
    window.__is2ReportsInit = false;
    cpState.initialized = false; saleState.initialized = false;
    purchaseState.initialized = false; attendanceState.initialized = false;
    productState.initialized = false; projectState.initialized = false;
    init();
  };

  if (document.readyState !== 'loading') { init(); } else { document.addEventListener('DOMContentLoaded', init); }
})();