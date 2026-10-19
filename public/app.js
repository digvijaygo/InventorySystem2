(function () {
    'use strict';

    const pages = [
        { name: 'dashboard',         fragment: 'dashboard.html',        script: 'dashboard.js' },
        { name: 'contractors',       fragment: 'contractor.html',       script: 'contractor.js' },
        { name: 'products',          fragment: 'products.html',         script: 'products.js' },
        { name: 'attendance',        fragment: 'attendance.html',       script: 'attendance.js'  },
        { name: 'users',             fragment: 'users.html',            script: 'users.js'       },
        { name: 'sale',              fragment: 'sale.html',             script: 'sale.js'        },
        { name: 'estimate',          fragment: 'estimate.html',         script: 'estimate.js' },
        { name: 'purchase',          fragment: 'purchase.html',         script: 'purchase.js'    },
        { name: 'projects',          fragment: 'projects.html',        script: 'projects.js'    },
        { name: 'reports',           fragment: 'reports.html',          script: 'reports.js'     },
        // --- Inventory sub-pages ---
        { name: 'daily-stocks',      fragment: 'dailystocks.html',      script: 'dailystocks.js' },
        { name: 'stock-transfer',    fragment: 'stocktransfer.html',    script: 'stocktransfer.js' },
        { name: 'inventory-report',  fragment: 'inventoryreport.html',  script: 'inventoryreport.js' },

        { name: 'sharewithCA', fragment: 'sharewithCA.html', script: 'sharewithCA.js' },
        { name: 'settings', fragment: 'settings.html', script: 'settings.js' },
    ];

    const CURRENT_PAGE_KEY = 'is2.currentPage';
    let activePage = null;

    /* ============================================================
       QUICK ACTIONS → page routing
       ============================================================ */
    const QA_ROUTES = {
        'add-sale':         { page: 'sale',           action: 'newSaleBtn' },
        'estimate':         { page: 'estimate',       action: 'newEstimateBtn' },
        'add-purchase':     { page: 'purchase',       action: 'newPurchaseBtn' },
        'add-contractor':   { page: 'contractors',    action: 'addContractorBtn' },
        'add-product':      { page: 'products',       action: 'addProductBtn' },
        'add-payment':      { page: 'contractors',    action: 'addPaymentBtn' },
        'add-work-entry':   { page: 'contractors',    action: 'addWorkEntryBtn' },
        'add-item':         { page: 'daily-stocks',   action: 'openAddRecordBtn' },
        'stock-transfer':   { page: 'stock-transfer', action: 'stOpenAddBtn' },
        'reports':          { page: 'reports',        action: null },
    };

    window.is2CanQuickAction = (id) => {
        const route = QA_ROUTES[id];
        if (!route || typeof window.is2CanAccess !== 'function') return false;
        return window.is2CanAccess(route.page, 'view') &&
            (!route.action || window.is2CanAccess(route.page, 'create'));
    };
    window.is2RunQuickAction = (id) => {
        if (!window.is2CanQuickAction(id)) return;
        const route = QA_ROUTES[id];
        showPage(route.page);
        if (route.action) {
            const button = document.getElementById(route.action);
            if (button && !button.disabled && !button.hidden) button.click();
        }
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
        activePage = pageName;
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
        window.dispatchEvent(new CustomEvent('is2-page-shown', { detail: { page: pageName } }));
    }

    function getCurrentPage() {
        if (activePage) return activePage;
        const activeNav = document.querySelector('.nav-links li[data-page].active');
        return (activeNav && activeNav.dataset.page) || 'dashboard';
    }

    /* ============================================================
       PAGE REFRESH
       ============================================================ */
    const REFRESH_PAGE_KEY = 'is2.refreshPage';

    // Page init functions are not idempotent (they re-bind listeners),
    // so reload everything and restore the current page afterwards.
    function refreshCurrentPage() {
        const pageName = getCurrentPage();
        try { sessionStorage.setItem(REFRESH_PAGE_KEY, pageName); } catch (e) {}
        location.reload();
    }

    function consumeRefreshPage() {
        try {
            const page = sessionStorage.getItem(REFRESH_PAGE_KEY);
            sessionStorage.removeItem(REFRESH_PAGE_KEY);
            return page;
        } catch (e) { return null; }
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
        const key = window.IS2_QA_STORAGE_KEY || 'is2.qa.config.v2';
        const defaultIds = window.IS2_QA_DEFAULTS || [
            'add-sale', 'add-purchase', 'add-contractor',
            'add-product', 'stock-transfer', 'add-payment'
        ];
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return defaultIds;
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return defaultIds;
            return parsed;
        } catch (e) {
            return defaultIds;
        }
    }

    function getQuickActionCatalog() {
        return window.IS2_QA_CATALOG || [
            { id: 'add-sale',      label: 'Add Sale',      icon: 'fa-cart-plus',              color: 'green'  },
            { id: 'add-purchase',  label: 'Add Purchase',  icon: 'fa-bag-shopping',           color: 'purple' },
            { id: 'add-contractor',label: 'Add Contractor',icon: 'fa-helmet-safety',          color: 'orange' },
            { id: 'add-product',   label: 'Add Product',   icon: 'fa-box',                    color: 'blue'   },
            { id: 'stock-transfer',label: 'New Transfer',  icon: 'fa-right-left',             color: 'purple' },
            { id: 'add-payment',   label: 'Add Payment',   icon: 'fa-indian-rupee-sign',       color: 'green'  },
        ];
    }

    function getQuickActions() {
        const ids = getActiveQuickActionIds();
        const catalog = getQuickActionCatalog();
        const byId = new Map(catalog.map((c) => [c.id, c]));

        return ids
            .filter(window.is2CanQuickAction)
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
                closeQuickActions();
                window.is2RunQuickAction(li.dataset.qaId);
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
            if (e.key === (window.IS2_QA_STORAGE_KEY || 'is2.qa.config.v2')) {
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
        const refreshPage = consumeRefreshPage();
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
            window.is2User = user;
            function filterLocationControls() {
                if (user.role === 'Super Admin') return;
                const allowedLocations = new Set((user.locations || []).map((location) => String(location).toLowerCase()));
                document.querySelectorAll('#pageHost option, #pageHost input[type="checkbox"][value]').forEach((control) => {
                    const value = String(control.value || control.textContent || '').trim();
                    if (!value || !['arneel industries karodi', 'anil industries karodi', 'anil industries ghanegoan', 'anil industries yavatmal', 'kpr projections'].includes(value.toLowerCase())) return;
                    if (allowedLocations.has(value.toLowerCase())) return;
                    if (control.tagName === 'OPTION') control.remove();
                    else if (control.closest('label')) control.closest('label').remove();
                });
            }
            window.is2CanAccess = (moduleName, action = 'view') => {
                if (user.role === 'Super Admin') return true;
                const rights = user.permissions?.[moduleName] || {};
                return Boolean(rights.all || rights[action]);
            };
            const pageModules = {
                dashboard: 'dashboard', contractors: 'contractors', products: 'products',
                attendance: 'attendance', sale: 'sale', estimate: 'estimate',
                purchase: 'purchase', reports: 'reports', 'daily-stocks': 'daily-stocks',
                projects: 'projects',
                'stock-transfer': 'stock-transfer', 'inventory-report': 'inventory-report',
                sharewithCA: 'sharewithCA', settings: 'settings'
            };
            document.querySelectorAll('.nav-links li[data-page]').forEach((item) => {
                const moduleName = pageModules[item.dataset.page];
                item.hidden = item.dataset.page === 'users'
                    ? user.role !== 'Super Admin'
                    : !moduleName || !window.is2CanAccess(moduleName, 'view');
            });
            document.querySelectorAll('.nav-links .nav-group').forEach((group) => {
                const visibleChild = Array.from(group.querySelectorAll('.nav-submenu li[data-page]'))
                    .some((item) => !item.hidden);
                group.hidden = !visibleChild;
            });

            // 2) Load all fragments
            const fragments = await Promise.all(pages.map(async (page) => {
                const response = await fetch(page.fragment);
                if (!response.ok) throw new Error(`Unable to load ${page.fragment}`);
                return response.text();
            }));
            host.innerHTML = fragments.join('\n');
            filterLocationControls();

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
            if (typeof window.initProductsPage === 'function')        window.initProductsPage();
            if (typeof window.initUsersPage === 'function')           window.initUsersPage();
            if (typeof window.initSalePage === 'function')            window.initSalePage();
            if (typeof window.initEstimatePage === 'function')        window.initEstimatePage();
            if (typeof window.initPurchasePage === 'function')        window.initPurchasePage();
            if (typeof window.initDashboardPage === 'function')       window.initDashboardPage();
            if (typeof window.initProjectsPage === 'function')        window.initProjectsPage();
            if (typeof window.initReportsPage === 'function')         window.initReportsPage();
            if (typeof window.initDailyStocksPage === 'function')     window.initDailyStocksPage();
            if (typeof window.initStockTransferPage === 'function')   window.initStockTransferPage();
            if (typeof window.initInventoryReportPage === 'function') window.initInventoryReportPage();
            if (typeof window.initShareWithCAPage === 'function')     window.initShareWithCAPage();
            if (typeof window.initSettingsPage === 'function')          window.initSettingsPage();    
            filterLocationControls();

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
            initSidebarCollapse();

            // 8) Land on dashboard, unless the refresh button was used.
            const accessiblePages = Array.from(document.querySelectorAll('.nav-links li[data-page]'))
                .filter((item) => !item.hidden)
                .map((item) => item.dataset.page);
            const initialPage = refreshPage && accessiblePages.includes(refreshPage)
                ? refreshPage
                : accessiblePages.includes('dashboard') ? 'dashboard' : accessiblePages[0];
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


 /* ============================================================
   SIDEBAR COLLAPSE
   ============================================================ */
function initSidebarCollapse() {
    const sidebar = document.getElementById('sidebar');
    const btn = document.getElementById('sidebarCollapseBtn');
    if (!sidebar || !btn) {
        console.warn('[sidebar] collapse elements not found');
        return;
    }

    const icon = btn.querySelector('i');

    function apply(collapsed) {
        sidebar.classList.toggle('collapsed', collapsed);
        btn.setAttribute('aria-expanded', String(!collapsed));
        btn.title = collapsed ? 'Expand menu' : 'Collapse menu';
        if (icon) {
            icon.classList.toggle('fa-angles-left', !collapsed);
            icon.classList.toggle('fa-angles-right', collapsed);
        }
    }

    // Always start expanded on page load
    apply(false);

    btn.addEventListener('click', () => {
        const next = !sidebar.classList.contains('collapsed');
        apply(next);
        window.dispatchEvent(new Event('resize'));
    });

    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
            e.preventDefault();
            btn.click();
        }
    });
}
    initialize();
}());