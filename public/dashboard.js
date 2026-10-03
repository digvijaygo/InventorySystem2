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
    { id: 'proforma',      label: 'Proforma Invoice', icon: 'fa-file-lines',          color: 'indigo' },
    { id: 'sale-order',    label: 'Sale Order',     icon: 'fa-file-signature',        color: 'green'  },
    { id: 'purchase-order',label: 'Purchase Order', icon: 'fa-file-contract',         color: 'red'    },
    { id: 'delivery',      label: 'Delivery Challan', icon: 'fa-truck',               color: 'orange' },
    { id: 'sale-return',   label: 'Sale Return',    icon: 'fa-rotate-left',           color: 'pink'   },
    { id: 'purchase-return',label:'Purchase Return',icon: 'fa-rotate-right',          color: 'purple' },
    { id: 'cash-bank',     label: 'Cash & Bank',    icon: 'fa-building-columns',      color: 'teal'   },
    { id: 'reports',       label: 'Reports',        icon: 'fa-chart-line',            color: 'blue'   },
    { id: 'money-transfer',label: 'Money Transfer', icon: 'fa-arrow-right-arrow-left',color: 'indigo' },
    { id: 'journal',       label: 'Journal Voucher',icon: 'fa-book',                  color: 'orange' },
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

    // If API fails, keep the hardcoded demo values in the HTML.
    if (!data) return;

    // --- Stat cards ---
    const elToCollect = document.getElementById('is2DashToCollect');
    const elToPay     = document.getElementById('is2DashToPay');
    const elCash      = document.getElementById('is2DashCash');
    const elStock     = document.getElementById('is2DashStock');

    if (elToCollect) elToCollect.innerHTML = `<i class="fas fa-arrow-trend-up"></i> ${fmtINR(data.to_collect)}`;
    if (elToPay)     elToPay.innerHTML     = `<i class="fas fa-arrow-trend-down"></i> ${fmtINR(data.to_pay)}`;
    if (elCash)      elCash.innerHTML      = `<i class="fas fa-wallet"></i> ${fmtINR(data.cash_in_hand)}`;
    if (elStock)     elStock.innerHTML     = `<i class="fas fa-boxes-stacked"></i> ${fmtINR(data.stock_value)}`;

    // --- Chips ---
    const chipSale = document.getElementById('is2DashChipSale');
    const chipPur  = document.getElementById('is2DashChipPurchase');
    const chipExp  = document.getElementById('is2DashChipExpense');
    if (chipSale) chipSale.textContent = `Sale ${fmtINR(data.sale_total)}`;
    if (chipPur)  chipPur.textContent  = `Purchase ${fmtINR(data.purchase_total)}`;
    if (chipExp)  chipExp.textContent  = `Expense ${fmtINR(data.expense_total)}`;

    // --- Recent transactions table ---
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