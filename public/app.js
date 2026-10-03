(function () {
    'use strict';

    const pages = [
        { name: 'dashboard',         fragment: 'dashboard.html',        script: 'dashboard.js' },
        { name: 'contractors',       fragment: 'contractor.html',       script: 'contractor.js' },
        { name: 'attendance',        fragment: 'attendance.html',       script: 'attendance.js'  },
        { name: 'users',             fragment: 'users.html',            script: 'users.js'       },
        { name: 'sale',              fragment: 'sale.html',             script: 'sale.js'        },
        { name: 'purchase',          fragment: 'purchase.html',         script: 'purchase.js'    },
        { name: 'reports',           fragment: 'reports.html',          script: 'reports.js'     },
        // --- Inventory sub-pages ---
        { name: 'daily-stocks',      fragment: 'dailystocks.html',      script: 'dailystocks.js' },
        { name: 'stock-transfer',    fragment: 'stocktransfer.html',    script: null },
        { name: 'stock-adjustment',  fragment: 'stockadjustment.html',  script: null },
        { name: 'inventory-report',  fragment: 'inventoryreport.html',  script: null },
    ];

    const CURRENT_PAGE_KEY = 'is2.currentPage';

    /* ============================================================
       QUICK ACTIONS → page routing
       ============================================================ */
    const QA_ROUTES = {
        'add-sale':         { page: 'sale',           action: null },
        'new-sale':         { page: 'sale',           action: null },
        'sale-order':       { page: 'sale',           action: null },
        'sale-return':      { page: 'sale',           action: null },
        'estimate':         { page: 'sale',           action: null },
        'proforma':         { page: 'sale',           action: null },

        'add-purchase':     { page: 'purchase',       action: null },
        'new-purchase':     { page: 'purchase',       action: null },
        'purchase-order':   { page: 'purchase',       action: null },
        'purchase-return':  { page: 'purchase',       action: null },
        'delivery':         { page: 'purchase',       action: null },

        'add-contractor':   { page: 'contractors',    action: null },
        'add-payment':      { page: 'contractors',    action: null },
        'add-work-entry':   { page: 'contractors',    action: null },

        'add-employee':     { page: 'users',          action: null },
        'add-party':        { page: 'users',          action: null },

        'add-item':         { page: 'daily-stocks',   action: null },
        'stock-transfer':   { page: 'stock-transfer', action: null },
        'stock-adj':        { page: 'stock-adjustment', action: null },

        'payment-in':       { page: 'sale',           action: null },
        'payment-out':      { page: 'purchase',       action: null },
        'expense':          { page: 'purchase',       action: null },
        'transfer':         { page: 'daily-stocks',   action: null },
        'money-transfer':   { page: 'daily-stocks',   action: null },
        'cash-bank':        { page: 'reports',        action: null },
        'journal':          { page: 'reports',        action: null },
        'reports':          { page: 'reports',        action: null },
    };

    function loadScript(source) {
        return new Promise((resolve, reject) => {
            const existing = document.querySelector(`script[data-dynamic-src="${source}"]`);
            if (existing) return resolve();
            const script = document.createElement('script');
            script.src = source;
            script.dataset.dynamicSrc = source;
            script.onload = resolve;
            script.onerror = () => reject(new Error(`Unable to load ${source}`));
            document.body.appendChild(script);
        });
    }

    function showPage(pageName) {
        document.querySelectorAll('.nav-links li[data-page]').forEach((item) => {
            item.classList.toggle('active', item.dataset.page === pageName);
        });

        document.querySelectorAll('.nav-links .nav-submenu li[data-page]').forEach((sub) => {
            if (sub.dataset.page === pageName) {
                const group = sub.closest('.nav-group');
                if (group) group.classList.add('open');
            }
        });

        document.querySelectorAll('.page-view').forEach((page) => {
            const isActive = page.dataset.page === pageName;
            page.style.display = isActive ? '' : 'none';
            if (isActive) page.scrollTop = 0;
        });

        // Reset any outer scroll containers so we never land mid-page.
        const contentEl = document.querySelector('.content');
        if (contentEl) contentEl.scrollTop = 0;
        window.scrollTo(0, 0);

        try { localStorage.setItem(CURRENT_PAGE_KEY, pageName); } catch (e) {}
    }

    function getCurrentPage() {
        const visible = document.querySelector('.page-view:not([style*="display: none"])');
        if (visible && visible.dataset.page) return visible.dataset.page;
        try { return localStorage.getItem(CURRENT_PAGE_KEY) || 'dashboard'; } catch (e) { return 'dashboard'; }
    }

    /* ============================================================
       SOFT-REFRESH HOOKS
       ============================================================ */
    function getSoftRefreshHooks() {
        return {
            'dashboard':      window.initDashboardPage,
            'contractors':    window.initContractorPage,
            'sale':           window.initSalePage,
            'purchase':       window.initPurchasePage,
            'users':          window.initUsersPage,
            'reports':        window.initReportsPage,
            'daily-stocks':   window.initDailyStocksPage,
        };
    }

    function refreshCurrentPage() {
        const pageName = getCurrentPage();
        const hooks = getSoftRefreshHooks();
        const hook = hooks[pageName];

        if (typeof hook === 'function') {
            try {
                hook();
                console.log('[refresh] Soft-refreshed page:', pageName);
                return;
            } catch (err) {
                console.error('[refresh] Soft hook failed for', pageName, err);
            }
        }

        console.log('[refresh] Full reload for page:', pageName);
        location.reload();
    }

    function wireRefresh() {
        const refreshBtn = document.getElementById('refreshBtn');

        function triggerRefresh() {
            if (!refreshBtn) { refreshCurrentPage(); return; }
            if (refreshBtn.disabled) return;

            refreshBtn.classList.add('spinning');
            refreshBtn.disabled = true;

            setTimeout(() => {
                try {
                    refreshCurrentPage();
                } finally {
                    setTimeout(() => {
                        refreshBtn.classList.remove('spinning');
                        refreshBtn.disabled = false;
                    }, 200);
                }
            }, 350);
        }

        if (refreshBtn) refreshBtn.addEventListener('click', triggerRefresh);

        document.addEventListener('keydown', (e) => {
            if (!e.shiftKey || e.key.toLowerCase() !== 'r') return;
            const tag = (document.activeElement && document.activeElement.tagName || '').toLowerCase();
            if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
            e.preventDefault();
            triggerRefresh();
        });
    }

    /* ============================================================
       QUICK ACTIONS DROPDOWN
       ============================================================ */
    function getActiveQuickActionIds() {
        const key = window.IS2_QA_STORAGE_KEY || 'is2.qa.config.v1';
        const defaultIds = [
            'add-sale', 'add-purchase', 'estimate',
            'payment-in', 'expense', 'transfer', 'payment-out'
        ];
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return defaultIds;
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed) || !parsed.length) return defaultIds;
            return parsed;
        } catch (e) {
            return defaultIds;
        }
    }

    function getQuickActionCatalog() {
        return window.IS2_QA_CATALOG || [
            { id: 'add-sale',      label: 'Add Sale',      icon: 'fa-cart-plus',              color: 'green'  },
            { id: 'add-purchase',  label: 'Add Purchase',  icon: 'fa-bag-shopping',           color: 'purple' },
            { id: 'estimate',      label: 'Estimate',      icon: 'fa-file-invoice',           color: 'blue'   },
            { id: 'payment-in',    label: 'Payment In',    icon: 'fa-money-bill',             color: 'orange' },
            { id: 'expense',       label: 'Expense',       icon: 'fa-hand-holding-dollar',    color: 'pink'   },
            { id: 'transfer',      label: 'Transfer',      icon: 'fa-arrow-right-arrow-left', color: 'teal'   },
            { id: 'payment-out',   label: 'Payment Out',   icon: 'fa-money-bill-transfer',    color: 'red'    },
            { id: 'add-party',     label: 'Add Party',     icon: 'fa-user-plus',              color: 'indigo' },
        ];
    }

    function getQuickActions() {
        const ids = getActiveQuickActionIds();
        const catalog = getQuickActionCatalog();
        const byId = new Map(catalog.map((c) => [c.id, c]));

        return ids
            .map((id) => {
                const item = byId.get(id);
                if (!item) return null;
                const route = QA_ROUTES[id] || { page: 'dashboard', action: null };
                return { ...item, page: route.page };
            })
            .filter(Boolean);
    }

    function renderQuickActions() {
        const menu = document.getElementById('quickActionsMenu');
        const list = document.getElementById('quickActionsList');
        if (!menu || !list) return;

        const actions = getQuickActions();

        if (!actions.length) {
            list.innerHTML = `<li class="qa-empty"><i class="fa-solid fa-bolt"></i>No quick actions configured</li>`;
            return;
        }

        list.innerHTML = actions.map((a) => `
            <li data-page="${a.page}" data-qa-id="${a.id}" role="button" tabindex="0">
                <i class="fa-solid ${a.icon} qa-icon"></i>
                <span class="qa-label">${a.label}</span>
                <i class="fa-solid fa-arrow-right qa-arrow"></i>
            </li>
        `).join('');

        list.querySelectorAll('li[data-page]').forEach((li) => {
            const go = () => {
                const page = li.dataset.page;
                closeQuickActions();
                if (typeof window.showPage === 'function') {
                    window.showPage(page);
                } else {
                    console.warn('[quick-actions] showPage not available');
                }
            };
            li.addEventListener('click', go);
            li.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
            });
        });
    }

    function openQuickActions() {
        const wrap = document.getElementById('quickActionsWrap');
        const menu = document.getElementById('quickActionsMenu');
        const btn  = document.getElementById('quickActionsBtn');
        if (!wrap || !menu || !btn) return;

        renderQuickActions();
        wrap.classList.add('open');
        menu.hidden = false;
        btn.setAttribute('aria-expanded', 'true');
    }

    function closeQuickActions() {
        const wrap = document.getElementById('quickActionsWrap');
        const menu = document.getElementById('quickActionsMenu');
        const btn  = document.getElementById('quickActionsBtn');
        if (!wrap || !menu || !btn) return;

        wrap.classList.remove('open');
        menu.hidden = true;
        btn.setAttribute('aria-expanded', 'false');
    }

    function toggleQuickActions() {
        const menu = document.getElementById('quickActionsMenu');
        if (!menu) return;
        if (menu.hidden) openQuickActions();
        else closeQuickActions();
    }

    function wireQuickActions() {
        const btn  = document.getElementById('quickActionsBtn');
        const wrap = document.getElementById('quickActionsWrap');
        if (!btn || !wrap) return;

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleQuickActions();
        });

        document.addEventListener('click', (e) => {
            if (!wrap.contains(e.target)) closeQuickActions();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeQuickActions();
        });

        window.addEventListener('storage', (e) => {
            if (e.key === 'is2.qa.config.v1') {
                const menu = document.getElementById('quickActionsMenu');
                if (menu && !menu.hidden) renderQuickActions();
            }
        });
    }

    /* ============================================================
       SUBMENU TOGGLE
       ============================================================ */
    function wireSubmenuToggle() {
        document.querySelectorAll('.nav-links .nav-group-header').forEach((header) => {
            header.addEventListener('click', () => {
                header.closest('.nav-group').classList.toggle('open');
            });
        });
    }

    function wireNavClicks() {
        document.querySelectorAll('.nav-links li[data-page]').forEach((item) => {
            item.addEventListener('click', (event) => {
                if (event.target.closest('.nav-group-header')) return;
                showPage(item.dataset.page);
            });
        });
    }

    /* ============================================================
       SIDEBAR USER NAME
       ============================================================ */
    function setSidebarUserName(name) {
        const el = document.getElementById('sidebarUserName');
        if (!el) return;
        el.textContent = name || 'User';
        el.classList.remove('sidebar-user-loading');
    }

    /* ============================================================
       INIT
       ============================================================ */
    async function initialize() {
        const host = document.querySelector('#pageHost');
        let revealed = false;

        function revealHost() {
            if (revealed) return;
            revealed = true;
            if (host) host.classList.remove('page-host-loading');
        }

        // Safety net: reveal the host after 3s even if something hangs.
        const safetyTimer = setTimeout(revealHost, 3000);

        try {
            const session = await window.authReady;
            if (!session) return;

            // 1) Set sidebar name FIRST — before any fragment renders.
            const user = session.user || {};
            setSidebarUserName(user.full_name || 'User');

            // 2) Load all fragments
            const fragments = await Promise.all(pages.map(async (page) => {
                const response = await fetch(page.fragment);
                if (!response.ok) throw new Error(`Unable to load ${page.fragment}`);
                return response.text();
            }));
            host.innerHTML = fragments.join('\n');

            // 3) Deduplicate .page-view
            const seen = new Set();
            document.querySelectorAll('.page-view').forEach((el) => {
                const name = el.dataset.page;
                if (seen.has(name)) {
                    console.warn('[app.js] Duplicate .page-view removed:', name);
                    el.remove();
                } else {
                    seen.add(name);
                }
            });
            console.log('[app.js] page-views:', [...seen]);

            // 4) Load page scripts
            await Promise.all(pages.filter(p => p.script).map((page) => loadScript(page.script)));

            // 5) Init controllers
            if (typeof window.initContractorPage === 'function')      window.initContractorPage();
            if (typeof window.initUsersPage === 'function')           window.initUsersPage();
            if (typeof window.initSalePage === 'function')            window.initSalePage();
            if (typeof window.initPurchasePage === 'function')        window.initPurchasePage();
            if (typeof window.initDashboardPage === 'function')       window.initDashboardPage();
            if (typeof window.initReportsPage === 'function')         window.initReportsPage();
            if (typeof window.initDailyStocksPage === 'function')     window.initDailyStocksPage();
            if (typeof window.initStockTransferPage === 'function')   window.initStockTransferPage();
            if (typeof window.initStockAdjustmentPage === 'function') window.initStockAdjustmentPage();
            if (typeof window.initInventoryReportPage === 'function') window.initInventoryReportPage();

            // 6) Logout
            const logoutBtn = document.querySelector('#logoutBtn');
            logoutBtn.addEventListener('click', async () => {
                await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
                window.location.href = '/login.html';
            });

            // 7) Wire UI
            wireSubmenuToggle();
            wireNavClicks();
            wireRefresh();
            wireQuickActions();

            // 8) ALWAYS land on dashboard after login.
            const initialPage = 'dashboard';
            if (document.querySelector(`.page-view[data-page="${initialPage}"]`)) {
                showPage(initialPage);
            } else {
                console.error('[app.js] Dashboard fragment missing');
            }

            // 9) Reveal the host now that we're on the right page.
            revealHost();
        } catch (error) {
            console.error('[app.js] Initialize failed:', error);
            host.innerHTML = `<div class="page-load-error">${error.message}</div>`;
            revealHost();
        } finally {
            clearTimeout(safetyTimer);
        }

        // Expose for debugging
        window.showPage = showPage;
        window.refreshCurrentPage = refreshCurrentPage;
    }

    initialize();
}());