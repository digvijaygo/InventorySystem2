/* =========================================================
   InventorySystem2 — Dashboard Quick Actions customizer
   + Location filter
   ========================================================= */
(function () {
  'use strict';

  if (window.__is2QaInit) return;
  window.__is2QaInit = true;


  const STORAGE_KEY = 'is2.qa.config.v1';

// Expose to top-nav Quick Actions dropdown in app.js
window.IS2_QA_STORAGE_KEY = STORAGE_KEY;
window.IS2_QA_CATALOG = null;   // filled in below after CATALOG is defined
  const MAX_ACTIVE = 8;

  // ---------- master catalog ----------
  const CATALOG = [
    { id: 'add-sale',      label: 'Add Sale',       icon: 'fa-cart-plus',             color: 'green'  },
    { id: 'add-purchase',  label: 'Add Purchase',   icon: 'fa-bag-shopping',          color: 'purple' },
    { id: 'estimate',      label: 'Estimate',       icon: 'fa-file-invoice',          color: 'blue'   },
    { id: 'payment-in',    label: 'Payment In',     icon: 'fa-money-bill',            color: 'orange' },
    { id: 'expense',       label: 'Expense',        icon: 'fa-hand-holding-dollar',   color: 'pink'   },
    { id: 'transfer',      label: 'Transfer',       icon: 'fa-arrow-right-arrow-left',color: 'teal'   },
    { id: 'payment-out',   label: 'Payment Out',    icon: 'fa-money-bill-transfer',   color: 'red'    },
    { id: 'add-party',     label: 'Add Party',      icon: 'fa-user-plus',             color: 'indigo' },

    // your project-specific additions
    { id: 'add-contractor',label: 'Add Contractor', icon: 'fa-helmet-safety',         color: 'orange' },
    { id: 'add-payment',   label: 'Add Payment',    icon: 'fa-indian-rupee-sign',     color: 'green'  },
    { id: 'add-work-entry',label: 'Add Work Entry', icon: 'fa-clipboard-list',        color: 'blue'   },
    { id: 'add-employee',  label: 'Add New Employee', icon: 'fa-id-badge',            color: 'purple' },
    { id: 'new-sale',      label: 'New Sale',       icon: 'fa-tags',                  color: 'green'  },
    { id: 'new-purchase',  label: 'New Purchase',   icon: 'fa-cart-shopping',         color: 'red'    },

    // extras shown in your screenshot's "Available shortcuts"
    { id: 'add-item',      label: 'Add Item',       icon: 'fa-plus',                  color: 'blue'   },
    { id: 'sale-order',    label: 'Sale Order',     icon: 'fa-file-signature',        color: 'green'  },
    { id: 'purchase-order',label: 'Purchase Order', icon: 'fa-file-contract',         color: 'red'    },
    { id: 'reports',       label: 'Reports',        icon: 'fa-chart-line',            color: 'blue'   },
    { id: 'stock-transfer',label: 'Stock Transfer', icon: 'fa-warehouse',             color: 'purple' },
    { id: 'stock-adj',     label: 'Stock Adjustment',icon:'fa-sliders',               color: 'pink'   }
  ];

  window.IS2_QA_CATALOG = CATALOG;

  const DEFAULT_ACTIVE = [
    'add-sale', 'add-purchase', 'estimate',
    'payment-in', 'expense', 'transfer', 'payment-out'
  ];

  const byId = (id) => CATALOG.find(c => c.id === id);

  // ---------- state ----------
  let activeIds = loadActive();
  // working copy inside the modal (cancel discards)
  let workingIds = [...activeIds];

  function loadActive() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [...DEFAULT_ACTIVE];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [...DEFAULT_ACTIVE];
      return parsed.filter(id => byId(id)).slice(0, MAX_ACTIVE);
    } catch {
      return [...DEFAULT_ACTIVE];
    }
  }

  function saveActive() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(activeIds));
    } catch (e) { /* ignore quota errors */ }
  }

  // ---------- render dashboard grid ----------
  function renderGrid() {
    const grid = document.getElementById('is2QaGrid');
    if (!grid) return;
    grid.innerHTML = activeIds.map(id => {
      const item = byId(id);
      if (!item) return '';
      return `
        <div class="is2-qa-item" data-id="${item.id}">
          <div class="is2-qa-icon is2-${item.color}">
            <i class="fas ${item.icon}"></i>
          </div>
          <span>${item.label}</span>
        </div>`;
    }).join('');
  }

  // ---------- render modal lists ----------
  function renderModal() {
    const listEl = document.getElementById('is2QaActiveList');
    const availEl = document.getElementById('is2QaAvailable');
    const countEl = document.getElementById('is2QaCount');
    if (!listEl || !availEl) return;

    countEl.textContent = `(${workingIds.length}/${MAX_ACTIVE})`;

    listEl.innerHTML = workingIds.map((id, index) => {
      const item = byId(id);
      if (!item) return '';
      return `
        <li class="is2-qa-manage-item" draggable="true" data-id="${item.id}" data-index="${index}">
          <div class="is2-qa-manage-icon is2-${item.color}">
            <i class="fas ${item.icon}"></i>
          </div>
          <span class="is2-qa-manage-label">${item.label}</span>
          <div class="is2-qa-manage-actions">
            <button type="button" data-action="up"   title="Move up"   ${index === 0 ? 'disabled' : ''}><i class="fas fa-arrow-up"></i></button>
            <button type="button" data-action="down" title="Move down" ${index === workingIds.length - 1 ? 'disabled' : ''}><i class="fas fa-arrow-down"></i></button>
            <button type="button" data-action="remove" class="is2-remove" title="Remove"><i class="fas fa-times"></i></button>
          </div>
        </li>`;
    }).join('');

    // available = catalog items not in workingIds
    const available = CATALOG.filter(c => !workingIds.includes(c.id));
    availEl.innerHTML = available.map(item => `
      <button type="button" class="is2-qa-chip" data-add="${item.id}">
        <i class="fas fa-plus"></i> ${item.label}
      </button>
    `).join('') || '<span style="color:#94a3b8;font-size:11.5px;">All shortcuts are on your dashboard.</span>';

    // disable chips if max reached
    if (workingIds.length >= MAX_ACTIVE) {
      availEl.querySelectorAll('.is2-qa-chip').forEach(chip => chip.classList.add('is2-disabled'));
    }

    attachModalListeners();
    attachDragAndDrop();
  }

  function attachModalListeners() {
    const listEl = document.getElementById('is2QaActiveList');
    if (!listEl) return;

    // up / down / remove
    listEl.querySelectorAll('button[data-action]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const li = btn.closest('.is2-qa-manage-item');
        const id = li.dataset.id;
        const action = btn.dataset.action;
        const idx = workingIds.indexOf(id);
        if (idx === -1) return;

        if (action === 'up'   && idx > 0) {
          [workingIds[idx - 1], workingIds[idx]] = [workingIds[idx], workingIds[idx - 1]];
        } else if (action === 'down' && idx < workingIds.length - 1) {
          [workingIds[idx + 1], workingIds[idx]] = [workingIds[idx], workingIds[idx + 1]];
        } else if (action === 'remove') {
          workingIds.splice(idx, 1);
        }
        renderModal();
      });
    });

    // add from available
    document.querySelectorAll('#is2QaAvailable .is2-qa-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const id = chip.dataset.add;
        if (!id) return;
        if (workingIds.length >= MAX_ACTIVE) return;
        if (workingIds.includes(id)) return;
        workingIds.push(id);
        renderModal();
      });
    });
  }

  // ---------- drag & drop reorder ----------
  let dragSrcIndex = null;

  function attachDragAndDrop() {
    const listEl = document.getElementById('is2QaActiveList');
    if (!listEl) return;

    listEl.querySelectorAll('.is2-qa-manage-item').forEach(li => {
      li.addEventListener('dragstart', (e) => {
        dragSrcIndex = Number(li.dataset.index);
        li.classList.add('is2-dragging');
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', String(dragSrcIndex)); } catch {}
      });

      li.addEventListener('dragend', () => {
        li.classList.remove('is2-dragging');
        listEl.querySelectorAll('.is2-drag-over').forEach(x => x.classList.remove('is2-drag-over'));
        dragSrcIndex = null;
      });

      li.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        li.classList.add('is2-drag-over');
      });

      li.addEventListener('dragleave', () => {
        li.classList.remove('is2-drag-over');
      });

      li.addEventListener('drop', (e) => {
        e.preventDefault();
        li.classList.remove('is2-drag-over');
        const targetIndex = Number(li.dataset.index);
        if (dragSrcIndex === null || dragSrcIndex === targetIndex) return;

        const [moved] = workingIds.splice(dragSrcIndex, 1);
        workingIds.splice(targetIndex, 0, moved);
        renderModal();
      });
    });
  }

  // ---------- modal open / close / save / reset ----------
  function openModal() {
    workingIds = [...activeIds];
    const modal = document.getElementById('is2QaModal');
    if (!modal) return;
    renderModal();
    modal.classList.add('is2-open');
    modal.setAttribute('aria-hidden', 'false');
  }

  function closeModal() {
    const modal = document.getElementById('is2QaModal');
    if (!modal) return;
    modal.classList.remove('is2-open');
    modal.setAttribute('aria-hidden', 'true');
  }

  function saveModal() {
    activeIds = [...workingIds];
    saveActive();
    renderGrid();
    closeModal();
  }

  function resetModal() {
    workingIds = [...DEFAULT_ACTIVE];
    renderModal();
  }

  /* =========================================================
     LOCATION FILTER — Dashboard data fetch
     ========================================================= */
  const DASH_API = '/api/dashboard-summary';

  function fmtINR(v) {
    const n = Number(v) || 0;
    return '₹ ' + new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n);
  }

  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(`${iso}T00:00:00`);
    if (Number.isNaN(d.getTime())) return iso;
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  }

  function escHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g,
      c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function selectedLocation() {
    const sel = document.getElementById('is2DashLocation');
    return sel ? String(sel.value || '').trim() : '';
  }

  async function refreshDashboardData() {
    const loc = selectedLocation();
    const params = new URLSearchParams();
    if (loc) params.set('location', loc);

    // -------- Monthly stats (stat cards) --------
    try {
      const res = await fetch(`/api/dashboard-monthly-stats?${params.toString()}`, {
        credentials: 'same-origin', cache: 'no-store'
      });
      if (res.ok) {
        const m = await res.json();
        const elSale  = document.getElementById('is2DashTotalSale');
        const elOut   = document.getElementById('is2DashOutstanding');
        const elPur   = document.getElementById('is2DashTotalPurchase');
        const elBal   = document.getElementById('is2DashBalancePayable');
        if (elSale) elSale.innerHTML = `<i class="fas fa-arrow-trend-up"></i> ${fmtINR(m.total_sale)}`;
        if (elOut)  elOut.innerHTML  = `<i class="fas fa-hourglass-half"></i> ${fmtINR(m.outstanding)}`;
        if (elPur)  elPur.innerHTML  = `<i class="fas fa-arrow-trend-down"></i> ${fmtINR(m.total_purchase)}`;
        if (elBal)  elBal.innerHTML  = `<i class="fas fa-wallet"></i> ${fmtINR(m.balance_payable)}`;
      }
    } catch (e) {
      console.warn('[dashboard] monthly stats fetch failed:', e);
    }

    // -------- Summary (chips + recent) --------
    let data = null;
    try {
      const res = await fetch(`${DASH_API}?${params.toString()}`, {
        credentials: 'same-origin',
        cache: 'no-store'
      });
      if (res.ok) data = await res.json();
    } catch (e) {
      console.warn('[dashboard] summary fetch failed:', e);
    }

    if (data) {
      const chipSale = document.getElementById('is2DashChipSale');
      const chipPur  = document.getElementById('is2DashChipPurchase');
      const chipExp  = document.getElementById('is2DashChipExpense');
      if (chipSale) chipSale.textContent = `Sale ${fmtINR(data.sale_total)}`;
      if (chipPur)  chipPur.textContent  = `Purchase ${fmtINR(data.purchase_total)}`;
      if (chipExp)  chipExp.textContent  = `Expense ${fmtINR(data.expense_total)}`;

      const tbody = document.getElementById('is2DashRecentBody');
      if (tbody && Array.isArray(data.recent)) {
        if (!data.recent.length) {
          tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#94a3b8;padding:18px;">No recent transactions for this location.</td></tr>';
        } else {
          tbody.innerHTML = data.recent.map(r => {
            const statusCls = r.status === 'Paid' ? 'is2-paid' : 'is2-unpaid';
            return `<tr>
              <td>${escHtml(r.type)}</td>
              <td>${escHtml(r.number)}</td>
              <td>${escHtml(r.party)}</td>
              <td>${fmtDate(r.date)}</td>
              <td class="is2-amt">${fmtINR(r.amount)}</td>
              <td><span class="is2-status ${statusCls}">${escHtml(r.status)}</span></td>
            </tr>`;
          }).join('');
        }
      }
    }

    // -------- Chart + Top Selling + Low Stock --------
    refreshBusinessChart();
    refreshTopSelling();
    refreshLowStock();
  }

  /* =========================================================
     LOW STOCK ALERTS — today's data, < 15
     ========================================================= */
  async function refreshLowStock() {
    const listEl = document.getElementById('is2LowStockList');
    if (!listEl) return;

    const loc = selectedLocation();
    const params = new URLSearchParams();
    if (loc) params.set('location', loc);

    let items = null;
    try {
      const res = await fetch(`/api/dashboard-low-stock?${params.toString()}`, {
        credentials: 'same-origin', cache: 'no-store'
      });
      if (res.ok) items = await res.json();
    } catch (e) {
      console.warn('[dashboard] low stock fetch failed:', e);
    }

    if (!items || !items.length) {
      listEl.innerHTML = `
        <div class="is2-alert-item" style="justify-content:center;color:#64748b;font-size:12px;background:#f0fdf4;border-left-color:#22c55e;">
          <i class="fas fa-circle-check" style="margin-right:6px;color:#22c55e;"></i>
          No low stock items today (below 15).
        </div>`;
      return;
    }

    listEl.innerHTML = items.map(it => {
      const qty = Number(it.stock_at_kpr) || 0;
      const qtyStr = Number.isInteger(qty) ? String(qty) : qty.toFixed(2);
      return `
        <div class="is2-alert-item">
          <span class="is2-alert-name">${escHtml(it.size)}</span>
          <span class="is2-tag">${qtyStr} pcs</span>
        </div>`;
    }).join('');
  }

  /* =========================================================
     BUSINESS OVERVIEW CHART — Sale vs Purchase (current month, last 30 days)
     ========================================================= */
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  function fmtShort(n) {
    n = Number(n) || 0;
    if (n >= 10000000) return (n / 10000000).toFixed(2).replace(/\.00$/, '') + ' Cr';
    if (n >= 100000)   return (n / 100000).toFixed(2).replace(/\.00$/, '') + ' L';
    if (n >= 1000)     return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
    return String(Math.round(n));
  }

  function escXml(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g,
      c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function renderBusinessChart(series) {
    const svgG   = document.getElementById('is2ChartPaths');
    const xEl    = document.getElementById('is2ChartXLabels');
    const yEl    = document.getElementById('is2ChartYLabels');
    if (!svgG || !xEl || !yEl) return;

    // series: [{ date: 'YYYY-MM-DD', sale: n, purchase: n }, ...] oldest -> newest
    const W = 600, H = 220, PAD_TOP = 10, PAD_BOTTOM = 20;

    // find max
    let maxVal = 0;
    series.forEach(p => { maxVal = Math.max(maxVal, p.sale || 0, p.purchase || 0); });
    // nice ceiling
    const niceStep = (v) => {
      if (v <= 0) return 1000;
      const exp = Math.floor(Math.log10(v));
      const base = Math.pow(10, exp);
      const n = v / base;
      let m = 1;
      if (n > 5) m = 10; else if (n > 2) m = 5; else if (n > 1) m = 2;
      return m * base;
    };
    const top = niceStep(maxVal * 1.15 || 1000);

    // y labels (5 ticks)
    const ticks = 5;
    const yLabels = [];
    for (let i = ticks - 1; i >= 0; i--) {
      yLabels.push(`<span>${fmtShort(top * i / (ticks - 1))}</span>`);
    }
    yEl.innerHTML = yLabels.join('');

    // build path coords
    const n = series.length;
    const stepX = n > 1 ? W / (n - 1) : W;
    const yFor = (v) => {
      const usable = H - PAD_TOP - PAD_BOTTOM;
      const ratio = top > 0 ? (Number(v) || 0) / top : 0;
      return PAD_TOP + usable * (1 - Math.min(ratio, 1));
    };

    const salePts     = series.map((p, i) => [i * stepX, yFor(p.sale)]);
    const purchasePts = series.map((p, i) => [i * stepX, yFor(p.purchase)]);

    const linePath = (pts) => pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ');
    const areaPath = (pts) => {
      if (!pts.length) return '';
      const baseY = H;
      return `M${pts[0][0].toFixed(2)},${baseY} ` +
        pts.map(p => `L${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ') +
        ` L${pts[pts.length - 1][0].toFixed(2)},${baseY} Z`;
    };

    svgG.innerHTML = `
      <path d="${areaPath(salePts)}" fill="url(#gGreen)"/>
      <path d="${linePath(salePts)}" fill="none" stroke="#22c55e" stroke-width="2"/>
      <path d="${areaPath(purchasePts)}" fill="url(#gRed)"/>
      <path d="${linePath(purchasePts)}" fill="none" stroke="#ef4444" stroke-width="2"/>
    `;

    // x labels — show ~8 evenly spaced
    const labelCount = 8;
    const labels = [];
    for (let i = 0; i < labelCount; i++) {
      const idx = Math.round(i * (n - 1) / (labelCount - 1));
      const d = series[idx];
      if (!d) continue;
      const dt = new Date(`${d.date}T00:00:00`);
      labels.push(`<span>${dt.getDate()} ${MONTHS[dt.getMonth()]}</span>`);
    }
    xEl.innerHTML = labels.join('');
  }

  function buildMonthSeries(rows) {
    // current month only, every day from 1st to today
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth();
    const today = now.getDate();
    const series = [];
    const map = new Map();
    (rows || []).forEach(r => {
      const key = r.date || r.day || r.txn_date;
      if (!key) return;
      map.set(String(key).slice(0, 10), {
        sale: Number(r.sale || r.sale_amount || 0),
        purchase: Number(r.purchase || r.purchase_amount || 0)
      });
    });
    for (let d = 1; d <= today; d++) {
      const dt = new Date(y, m, d);
      const iso = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
      const entry = map.get(iso) || { sale: 0, purchase: 0 };
      series.push({ date: iso, sale: entry.sale, purchase: entry.purchase });
    }
    return series;
  }

  async function refreshBusinessChart() {
    const loc = selectedLocation();
    const params = new URLSearchParams();
    if (loc) params.set('location', loc);

    let rows = null;
    try {
      const res = await fetch(`/api/dashboard-trend?${params.toString()}`, {
        credentials: 'same-origin', cache: 'no-store'
      });
      if (res.ok) {
        const data = await res.json();
        rows = Array.isArray(data) ? data : (data.series || data.rows || []);
      }
    } catch (e) {
      console.warn('[dashboard] trend fetch failed:', e);
    }

    // Fallback: derive from recent transactions if available
    if (!rows) rows = [];

    const series = buildMonthSeries(rows);
    renderBusinessChart(series);

    // update month chip label
    const chip = document.getElementById('is2DashMonthChip');
    if (chip) {
      const now = new Date();
      chip.textContent = `${MONTHS[now.getMonth()]} ${now.getFullYear()}`;
    }
  }

  /* =========================================================
     TOP SELLING PRODUCTS — current month, from sale items
     ========================================================= */
  async function refreshTopSelling() {
    const listEl = document.getElementById('is2TopSellList');
    if (!listEl) return;

    const loc = selectedLocation();
    const params = new URLSearchParams();
    if (loc) params.set('location', loc);
    params.set('month', 'current');

    let items = null;
    try {
      const res = await fetch(`/api/top-selling?${params.toString()}`, {
        credentials: 'same-origin', cache: 'no-store'
      });
      if (res.ok) {
        const data = await res.json();
        items = Array.isArray(data) ? data : (data.items || []);
      }
    } catch (e) {
      console.warn('[dashboard] top-selling fetch failed:', e);
    }

    if (!items || !items.length) {
      listEl.innerHTML = `<div class="is2-sell-item" style="justify-content:center;color:#94a3b8;font-size:12px;padding:16px 0;">
        No sales data for this period.
      </div>`;
      return;
    }

    listEl.innerHTML = items.slice(0, 5).map(it => `
      <div class="is2-sell-item">
        <div class="is2-sell-info">
          <div class="is2-sell-icon"><i class="fas fa-layer-group"></i></div>
          <span>${escHtml(it.item_name || it.name || '-')}</span>
        </div>
        <span class="is2-amount">${fmtINR(it.amount || it.total || 0)}</span>
      </div>
    `).join('');
  }

  function wireLocationSelector() {
    const sel = document.getElementById('is2DashLocation');
    if (!sel || sel.dataset.wired === '1') return;
    sel.dataset.wired = '1';
    sel.addEventListener('change', refreshDashboardData);
  }

  // ---------- wire up ----------
  function init() {
    const root = document.getElementById('is2-dashboard');
    if (!root) return;

    // initial grid
    renderGrid();

    // gear click
    const gear = document.getElementById('is2QaGear');
    if (gear) gear.addEventListener('click', openModal);

    // close / cancel / save / reset
    const closeBtn = document.getElementById('is2QaClose');
    const cancelBtn = document.getElementById('is2QaCancel');
    const saveBtn = document.getElementById('is2QaSave');
    const resetBtn = document.getElementById('is2QaReset');
    const overlay = document.getElementById('is2QaModal');

    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
    if (saveBtn) saveBtn.addEventListener('click', saveModal);
    if (resetBtn) resetBtn.addEventListener('click', resetModal);

    // click outside modal → close
    if (overlay) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal();
      });
    }
    // View all → Daily Stocks
    const lowStockViewAll = document.getElementById('is2LowStockViewAll');
    if (lowStockViewAll) {
      lowStockViewAll.addEventListener('click', () => {
        if (window.showPage) window.showPage('daily-stocks');
      });
    }
    
    // ESC key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeModal();
    });

    // Clicking a QA item on the dashboard grid does nothing yet —
    // wire actual navigation here later:
    document.getElementById('is2QaGrid')?.addEventListener('click', (e) => {
      const item = e.target.closest('.is2-qa-item');
      if (!item) return;
      // TODO: navigate based on item.dataset.id
      console.log('[QA] Clicked:', item.dataset.id);
    });

    // Location filter
    wireLocationSelector();
    refreshDashboardData();
  }

  // ---------- expose globally (SPA-friendly) ----------
  window.initDashboardPage = function () {
    init();
  };

  // If DOM is already rendered (direct load / re-init), run now
  if (document.readyState !== 'loading') {
    init();
  } else {
    document.addEventListener('DOMContentLoaded', init);
  }

})();

document.getElementById('is2QaGrid')?.addEventListener('click', (e) => {
  const item = e.target.closest('.is2-qa-item');
  if (!item) return;
  const id = item.dataset.id;

  const routes = {
    'add-sale':       () => window.showPage && window.showPage('sale'),
    'new-sale':       () => window.showPage && window.showPage('sale'),
    'add-purchase':   () => window.showPage && window.showPage('purchase'),
    'new-purchase':   () => window.showPage && window.showPage('purchase'),
    'add-contractor': () => window.showPage && window.showPage('contractors'),
    'add-employee':   () => window.showPage && window.showPage('users'),
  };

  if (routes[id]) routes[id]();
  else console.log('[QA] No route for:', id);
});