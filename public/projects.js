(function() {
    'use strict';

    const API_URL = '/api/projects';
    const CONTRACTORS_API = '/api/contractor-payments'; 
    const PAGE_SIZE = 10;
    
    let currentPage = 1;
    let selectedLocations = new Set();
    let projectsData = [];
    let currentProject = null; 
    let currentProjectParties = []; 
    let globalContractors = []; 
    
    // Holds the combined data (entries + payments) for the active statement/party
    let activeContractorData = { entries: [], payments: [] };
    let activeContractorId = null;
    let projectStatements = new Map();
    let partiesLoadVersion = 0;
    let statementLoadVersion = 0;
    let projectTransactions = [];
    let editingRecord = null;
    let refreshingProject = null;
    const WORK_CATEGORIES = [
        { key: 'fabrication', label: 'Fabrication', rate: 100 },
        { key: 'cement_sheet', label: 'Cement Sheet', rate: 150 },
        { key: 'electrical', label: 'Electrical', rate: 200 },
        { key: 'plumbing', label: 'Plumbing', rate: 130 },
        { key: 'inner_colour', label: 'Inner Colour', rate: 90 },
        { key: 'outer_colour', label: 'Outer Colour', rate: 80 },
        { key: 'tiles', label: 'Tiles', rate: 120 },
        { key: 'door_fitting', label: 'Door Fitting', rate: 250 },
        { key: 'paint', label: 'Paint', rate: 100 }
    ];
    const workAmount = (entry) => entry.amount != null ? Number(entry.amount) || 0 : WORK_CATEGORIES.reduce((total, category) =>
        total + (Number(entry[category.key]) || 0) * category.rate, 0);

    function projectRows() {
        const rows = [];
        projectStatements.forEach((data, contractorId) => {
            const party = data.contractor?.contractor_name || '';
            (data.entries || []).forEach((entry) => rows.push({
                ...entry, contractor_id: contractorId, party, type: 'Work',
                date: entry.entry_date, reference: `WE-${entry.id}`, amount: workAmount(entry)
            }));
            (data.payments || []).forEach((payment) => rows.push({
                ...payment, contractor_id: contractorId, party, type: 'Payment',
                date: payment.payment_date, reference: `PAY-${payment.id}`, amount: Number(payment.payment_amount) || 0
            }));
        });
        projectTransactions.forEach((transaction) => rows.push({
            ...transaction, party: transaction.contractor_name || '', date: transaction.entry_date,
            reference: transaction.reference || `${transaction.type === 'Material' ? 'MAT' : 'EXP'}-${transaction.id}`
        }));
        return rows.sort((first, second) => String(second.date).localeCompare(String(first.date)) || Number(second.id) - Number(first.id));
    }

    function recordActions(row) {
        return `<div class="action-buttons">
            <button type="button" data-project-action="edit" data-type="${row.type}" data-id="${Number(row.id)}" data-contractor="${Number(row.contractor_id) || ''}" title="Edit" aria-label="Edit ${row.type}"><i class="fa-solid fa-pen"></i></button>
            <button type="button" data-project-action="delete" data-type="${row.type}" data-id="${Number(row.id)}" data-contractor="${Number(row.contractor_id) || ''}" title="Delete" aria-label="Delete ${row.type}"><i class="fa-solid fa-trash"></i></button>
        </div>`;
    }

    function renderOverviewTotals() {
        if (!currentProject) return;
        const rows = projectRows();
        const sumType = (type) => rows.filter((row) => row.type === type).reduce((sum, row) => sum + Number(row.amount || 0), 0);
        const work = sumType('Work');
        const material = sumType('Material');
        const expenses = sumType('Expense');
        const paid = sumType('Payment');
        const total = work + material + expenses;
        const budget = Number(currentProject.budget) || 0;
        currentProject.total_cost = total;
        currentProject.paid = paid;
        currentProject.balance = total - paid;
        document.getElementById('dtCostWork').textContent = formatCurrency(work);
        document.getElementById('dtCostMaterial').textContent = formatCurrency(material);
        document.getElementById('dtCostExpenses').textContent = formatCurrency(expenses);
        document.getElementById('dtTotalCost').textContent = formatCurrency(total);
        document.getElementById('dtTotalPaid').textContent = formatCurrency(paid);
        document.getElementById('dtOutstanding').textContent = formatCurrency(total - paid);
        document.getElementById('dtBudgetRemaining').textContent = formatCurrency(Math.max(0, budget - total));
        document.getElementById('dtBudgetUsedPct').textContent = `${budget > 0 ? (total / budget * 100).toFixed(1) : '0.0'}% used`;
    }

    function syncStatementParties() {
        const select = document.getElementById('statementPartySelect');
        select.innerHTML = '<option value="">Select a Party...</option>' + currentProjectParties.map((party) =>
            `<option value="${Number(party.contractor_id)}">${escapeHtml(party.contractor_name)}</option>`).join('');
        select.value = activeContractorId == null ? '' : String(activeContractorId);
    }

    function renderWorkCategories() {
        const entries = Array.from(projectStatements.values()).flatMap((data) => data.entries || []);
        const totals = WORK_CATEGORIES.map((category) => {
            const quantity = entries.reduce((sum, entry) => sum + (Number(entry[category.key]) || 0), 0);
            const amount = entries.reduce((sum, entry) => sum + (entry.work_amounts
                ? Number(entry.work_amounts[category.key] || 0)
                : (Number(entry[category.key]) || 0) * category.rate), 0);
            return { ...category, quantity, amount };
        });
        const totalAmount = totals.reduce((sum, category) => sum + category.amount, 0);
        document.getElementById('dtCategoryRows').innerHTML = entries.length ? totals.map((category) => `
            <tr><td>${category.label}</td><td class="text-right">${category.quantity}</td>
            <td class="text-right">${formatCurrency(category.amount)}</td>
            <td class="text-right">${totalAmount ? (category.amount / totalAmount * 100).toFixed(1) : '0.0'}%</td></tr>
        `).join('') : '<tr><td colspan="4" class="empty-state">No work entries found.</td></tr>';
        document.getElementById('dtCostWork').textContent = formatCurrency(totalAmount);
        renderOverviewTotals();
    }

    const LOCATION_OPTIONS = [
        'Arneel industries karodi', 'Anil industries karodi', 'Anil industries ghanegoan', 
        'Anil industries yavatmal', 'Kpr projections'
    ];

    const formatCurrency = (amount) => {
        return '₹ ' + Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };
    
    const formatDate = (dateStr) => {
        if (!dateStr) return '—';
        try {
            return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        } catch (e) { return dateStr; }
    };

    function escapeHtml(v) {
        return String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    }

    // --- MAIN PROJECT LIST ---
    function getFilteredData() {
        const query = document.getElementById('projectSearch').value.trim().toLowerCase();
        const status = document.getElementById('projectStatusFilter').value;
        return projectsData.filter(p => {
            const matchesSearch = !query || (p.project_name.toLowerCase().includes(query) || p.project_code.toLowerCase().includes(query));
            const matchesLocation = selectedLocations.size === 0 || selectedLocations.has(p.location);
            const matchesStatus = !status || p.status === status;
            return matchesSearch && matchesLocation && matchesStatus;
        });
    }

    function renderTable() {
        const tbody = document.getElementById('projectsTableBody');
        if (!tbody) return;
        const filtered = getFilteredData();
        
        const totalProjects = filtered.length;
        const activeProjects = filtered.filter(p => p.status === 'Active').length;
        const totalCost = filtered.reduce((sum, p) => sum + Number(p.total_cost || 0), 0);
        const outstanding = filtered.reduce((sum, p) => sum + Number(p.balance || 0), 0);

        document.getElementById('statTotalProjects').textContent = totalProjects;
        document.getElementById('statActiveProjects').textContent = activeProjects;
        document.getElementById('statTotalCost').textContent = formatCurrency(totalCost);
        document.getElementById('statOutstanding').textContent = formatCurrency(outstanding);

        const totalItems = filtered.length;
        const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
        if (currentPage > totalPages) currentPage = totalPages;
        
        const start = (currentPage - 1) * PAGE_SIZE;
        const pageItems = filtered.slice(start, start + PAGE_SIZE);

        if (pageItems.length === 0) {
            tbody.innerHTML = '<tr><td class="empty-state" colspan="9">No projects found.</td></tr>';
        } else {
            tbody.innerHTML = pageItems.map(project => `
                <tr>
                    <td><strong>${escapeHtml(project.project_code)}</strong></td>
                    <td><span class="project-link" onclick="window.openProject(${project.id})">${escapeHtml(project.project_name)}</span></td>
                    <td>${escapeHtml(project.location)}</td>
                    <td>${formatDate(project.start_date)}</td>
                    <td class="text-right"><strong>${formatCurrency(project.total_cost)}</strong></td>
                    <td class="text-right">${formatCurrency(project.paid)}</td>
                    <td class="text-right" style="color: ${project.balance > 0 ? '#d93035' : '#344054'}; font-weight: 600;">${formatCurrency(project.balance)}</td>
                    <td>
                        <span class="badge-status" style="background: ${project.status === 'Active' ? '#ecfdf3' : (project.status === 'Completed' ? '#e0f2fe' : '#f2f4f7')}; color: ${project.status === 'Active' ? '#027a48' : (project.status === 'Completed' ? '#0369a1' : '#344054')};">
                            ${escapeHtml(project.status)}
                        </span>
                    </td>
                    <td>
                        <div class="action-buttons">
                            <button type="button" class="edit-project" onclick="window.editProject(${project.id})" title="Edit"><i class="fa-solid fa-pen"></i></button>
                            <button type="button" class="delete-project delete-action" onclick="window.deleteProject(${project.id})" title="Delete"><i class="fa-solid fa-trash"></i></button>
                        </div>
                    </td>
                </tr>
            `).join('');
        }
        document.getElementById('projectRecordCount').textContent = `Showing ${totalItems} project${totalItems === 1 ? '' : 's'}`;
        renderPagination(totalItems);
    }

    function renderPagination(totalItems) {
        const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
        const start = (currentPage - 1) * PAGE_SIZE;
        const end = Math.min(start + PAGE_SIZE, totalItems);
        document.getElementById('projectPaginationInfo').textContent = totalItems === 0 ? 'Showing 0 of 0 records' : `Showing ${start + 1}\u2013${end} of ${totalItems} records`;
        const container = document.getElementById('projectPaginationButtons');
        const buttons = [];
        buttons.push(`<button ${currentPage === 1 ? 'disabled' : ''} data-page="${currentPage - 1}"><i class="fa-solid fa-chevron-left"></i></button>`);
        for (let i = 1; i <= totalPages; i += 1) {
            buttons.push(`<button class="${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`);
        }
        buttons.push(`<button ${currentPage === totalPages ? 'disabled' : ''} data-page="${currentPage + 1}"><i class="fa-solid fa-chevron-right"></i></button>`);
        container.innerHTML = buttons.join('');
    }

    function renderLocationFilter() {
        const menu = document.getElementById('projectLocationFilterMenu');
        if (!menu) return;
        const allChecked = selectedLocations.size === 0 ? 'checked' : '';
        let html = `<label class="multi-select-option all-option"><input type="checkbox" data-location="__all__" ${allChecked}><span>All Locations</span></label>`;
        html += LOCATION_OPTIONS.map((loc) => {
            const checked = selectedLocations.has(loc) ? 'checked' : '';
            return `<label class="multi-select-option"><input type="checkbox" data-location="${escapeHtml(loc)}" ${checked}><span>${escapeHtml(loc)}</span></label>`;
        }).join('');
        menu.innerHTML = html;
        updateLocationFilterLabel();
    }

    function updateLocationFilterLabel() {
        const label = document.getElementById('projectLocationFilterLabel');
        if (!label) return;
        if (selectedLocations.size === 0) label.textContent = 'All Locations';
        else if (selectedLocations.size === 1) label.textContent = [...selectedLocations][0];
        else label.textContent = `${selectedLocations.size} locations selected`;
    }

    // --- DETAILS VIEW & TABS LOGIC ---
    window.openProject = async function(id) {
        currentProject = projectsData.find(p => p.id === id);
        if (!currentProject) return;

        document.getElementById('projectListView').style.display = 'none';
        document.getElementById('projectDetailsView').style.display = 'block';

        // Default to Overview Tab
        document.querySelectorAll('.details-tabs .tab').forEach(t => t.classList.remove('active'));
        document.querySelector('.details-tabs .tab[data-tab="overview"]').classList.add('active');
        document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
        document.getElementById('tab-overview').style.display = 'block';

        populateOverview(currentProject);
        await loadProjectParties(id);
    };

    window.closeProjectDetails = function() {
        document.getElementById('projectDetailsView').style.display = 'none';
        document.getElementById('projectListView').style.display = 'block';
    };

    document.querySelectorAll('.details-tabs .tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            const tabId = e.target.dataset.tab;
            document.querySelectorAll('.details-tabs .tab').forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');
            document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
            document.getElementById(`tab-${tabId}`).style.display = 'block';
            if (tabId === 'statement') {
                syncStatementParties();
                renderStatement();
            }
            if (tabId === 'overview') renderWorkCategories();

            // If switching to work/payments/transactions, ensure data is loaded
            if (tabId === 'work' || tabId === 'payments' || tabId === 'transactions') {
                if (currentProjectParties.length > 0 && activeContractorData) {
                    renderWorkTab();
                    renderPaymentsTab();
                    renderTransactionsTab();
                }
            }
        });
    });

    function populateOverview(project) {
        document.getElementById('detailProjectName').textContent = project.project_name;
        document.getElementById('detailProjectCode').textContent = project.project_code;
        
        const statusBadge = document.getElementById('detailProjectStatus');
        statusBadge.textContent = project.status;
        statusBadge.style.background = project.status === 'Active' ? '#ecfdf3' : (project.status === 'Completed' ? '#e0f2fe' : '#f2f4f7');
        statusBadge.style.color = project.status === 'Active' ? '#027a48' : (project.status === 'Completed' ? '#0369a1' : '#344054');

        document.getElementById('dtTotalCost').textContent = formatCurrency(project.total_cost);
        document.getElementById('dtTotalPaid').textContent = formatCurrency(project.paid);
        document.getElementById('dtOutstanding').textContent = formatCurrency(project.balance);
        
        const budget = Number(project.budget || 0);
        const budgetRemaining = Math.max(0, budget - Number(project.total_cost || 0));
        document.getElementById('dtBudgetRemaining').textContent = formatCurrency(budgetRemaining);
        const pctUsed = budget > 0 ? ((Number(project.total_cost) / budget) * 100).toFixed(1) : 0;
        document.getElementById('dtBudgetUsedPct').textContent = `${pctUsed}% used`;

        document.getElementById('dtCustomer').textContent = project.customer || '—';
        document.getElementById('dtStartDate').textContent = formatDate(project.start_date);
        document.getElementById('dtEndDate').textContent = formatDate(project.end_date);
        document.getElementById('dtBudget').textContent = formatCurrency(budget);
        document.getElementById('dtSiteAddress').textContent = project.site_address || '—';

        // Placeholder logic for Cost Summary
        document.getElementById('dtCostWork').textContent = formatCurrency(project.total_cost);
        document.getElementById('dtCostMaterial').textContent = formatCurrency(0);
        document.getElementById('dtCostExpenses').textContent = formatCurrency(0);
    }

    // --- PARTIES TAB LOGIC ---
    async function loadProjectParties(projectId) {
        const version = ++partiesLoadVersion;
        statementLoadVersion += 1;
        projectStatements = new Map();
        projectTransactions = [];
        activeContractorData = { entries: [], payments: [] };
        currentProjectParties = [];
        syncStatementParties();
        renderStatement();
        renderWorkCategories();
        try {
            const response = await fetch(`${API_URL}/${projectId}/parties`, { credentials: 'same-origin' });
            if (!response.ok) throw new Error('Failed to load project parties');
            const parties = await response.json();
            if (version !== partiesLoadVersion) return;
            currentProjectParties = parties;
            if (!parties.some((party) => Number(party.contractor_id) === Number(activeContractorId))) {
                activeContractorId = parties[0]?.contractor_id || null;
            }
            syncStatementParties();
            document.getElementById('dtVendors').textContent = currentProjectParties.length;
            renderPartiesTable();
            const statements = await Promise.all([...new Set(parties.map((party) => Number(party.contractor_id)))].map(async (contractorId) => {
                const statementResponse = await fetch(`/api/contractors/${contractorId}/statement`, { credentials: 'same-origin' });
                if (!statementResponse.ok) throw new Error('Failed to load statement data');
                return [contractorId, await statementResponse.json()];
            }));
            const transactionsResponse = await fetch(`${API_URL}/${projectId}/transactions`, { credentials: 'same-origin' });
            if (!transactionsResponse.ok) throw new Error('Failed to load materials and expenses');
            const transactions = await transactionsResponse.json();
            if (version !== partiesLoadVersion) return;
            projectStatements = new Map(statements);
            projectTransactions = transactions;
            currentProjectParties.forEach((party) => {
                const statement = projectStatements.get(Number(party.contractor_id));
                const work = (statement?.entries || []).reduce((sum, entry) => sum + workAmount(entry), 0);
                party.paid = (statement?.payments || []).reduce((sum, payment) => sum + Number(payment.payment_amount || 0), 0);
                party.balance = work - party.paid;
            });
            renderPartiesTable();
            renderWorkCategories();
            await window.loadStatement(activeContractorId);
        } catch (error) {
            console.error(error);
        }
    }

    function renderPartiesTable() {
        const tbody = document.getElementById('partiesTableBody');
        if (!tbody) return;

        if (currentProjectParties.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="empty-state" style="text-align:center; padding:20px; color:#667085;">No parties assigned to this project yet.</td></tr>';
            return;
        }

        tbody.innerHTML = currentProjectParties.map(p => {
            const contractVal = Number(p.contract_value) || 0;
            const amount = contractVal > 0 ? contractVal : Number(p.balance || 0) + Number(p.paid || 0);
            const balance = amount - Number(p.paid || 0);

            return `
            <tr>
                <td><span class="party-link" onclick="window.openStatement(${p.contractor_id})">${escapeHtml(p.contractor_name)}</span></td>
                <td>${escapeHtml(p.role)}</td>
                <td class="text-right">${formatCurrency(amount)}</td>
                <td class="text-right">${formatCurrency(p.paid)}</td>
                <td class="text-right" style="color: ${balance > 0 ? '#d93035' : '#344054'}; font-weight: 600;">${formatCurrency(balance)}</td>
                <td>
                    <div class="action-buttons">
                        <button type="button" class="edit-party" title="Edit"><i class="fa-solid fa-pen"></i></button>
                        <button type="button" onclick="window.removeParty(${p.id})" title="Delete"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </td>
            </tr>
        `}).join('');
    }

    window.removeParty = async function(id) {
        if(!confirm('Remove this party from the project?')) return;
        try {
            const response = await fetch(`${API_URL}/${currentProject.id}/parties/${id}`, { method: 'DELETE', credentials: 'same-origin' });
            if (!response.ok) throw new Error('Failed to delete party');
            await loadProjectParties(currentProject.id);
        } catch (error) { window.alert(error.message); }
    };

    window.openAssignPartyModal = function() {
        const modal = document.getElementById('assignPartyModal');
        const form = document.getElementById('assignPartyForm');
        form.reset();
        const select = document.getElementById('assignPartySelect');
        const assignedIds = currentProjectParties.map(p => p.contractor_id);
        const availableContractors = globalContractors.filter(c => !assignedIds.includes(c.id));
        select.innerHTML = '<option value="">Search or select contractor...</option>' + 
            availableContractors.map(c => `<option value="${c.id}">${escapeHtml(c.contractor_name)}</option>`).join('');
        modal.classList.add('show');
        modal.setAttribute('aria-hidden', 'false');
    };

    window.closeAssignPartyModal = function() {
        const modal = document.getElementById('assignPartyModal');
        modal.classList.remove('show');
        modal.setAttribute('aria-hidden', 'true');
    };

    document.getElementById('assignPartyForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const payload = {
            contractor_id: Number(formData.get('contractor_id')),
            role: formData.get('role'),
            contract_value: Number(formData.get('contract_value') || 0),
            notes: formData.get('notes')
        };

        try {
            const response = await fetch(`${API_URL}/${currentProject.id}/parties`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify(payload)
            });
            if (!response.ok) throw new Error('Failed to assign party');
            window.closeAssignPartyModal();
            await loadProjectParties(currentProject.id);
        } catch (error) { window.alert(error.message); }
    });

    // --- WORK / PAYMENTS / TRANSACTIONS TABS DATA ---
    
    // We use the same data source (the contractor statement) to populate these tabs
    window.loadStatement = async function(contractorId, switchToStatementTab = false) {
        const version = ++statementLoadVersion;
        if (!contractorId) {
            activeContractorId = null;
            activeContractorData = { entries: [], payments: [] };
            syncStatementParties();
            renderStatement();
            renderWorkTab();
            renderPaymentsTab();
            renderTransactionsTab();
            return;
        }
        const id = Number(contractorId);
        if (!currentProjectParties.some((party) => Number(party.contractor_id) === id)) return;
        const projectId = currentProject.id;
        try {
            let data = projectStatements.get(id);
            if (!data) {
                const response = await fetch(`/api/contractors/${id}/statement`, { credentials: 'same-origin' });
                if (!response.ok) throw new Error('Failed to load statement data');
                data = await response.json();
            }
            if (version !== statementLoadVersion || currentProject.id !== projectId) return;
            projectStatements.set(id, data);
            activeContractorId = id;
            activeContractorData = data;
            syncStatementParties();
            renderStatement();
            renderWorkCategories();
            renderWorkTab();
            renderPaymentsTab();
            renderTransactionsTab();
            
            if (switchToStatementTab) {
                // Manually switch to Statement Tab if requested from Parties table
                document.querySelectorAll('.details-tabs .tab').forEach(t => t.classList.remove('active'));
                document.querySelector('.details-tabs .tab[data-tab="statement"]').classList.add('active');
                document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
                document.getElementById('tab-statement').style.display = 'block';
                
            }
        } catch (error) { console.error(error); }
    };

    window.openStatement = function(contractorId) {
        window.loadStatement(contractorId, true);
    };

    // Populate the Work & Materials Tab
    function renderWorkTab() {
        const tbody = document.getElementById('workTableBody');
        if (!tbody) return;
        const rows = projectRows().filter((row) => row.type === 'Work' || row.type === 'Material');
        tbody.innerHTML = rows.length ? rows.map((row) => `<tr>
            <td>${formatDate(row.date)}</td><td><span class="badge-type badge-work">${row.type === 'Work' ? 'Work Entry' : 'Material'}</span></td>
            <td title="${escapeHtml(row.description || '')}">${escapeHtml(row.reference)}</td><td>${escapeHtml(row.party || '—')}</td>
            <td class="text-right">${formatCurrency(row.amount)}</td><td>${recordActions(row)}</td>
        </tr>`).join('') : '<tr><td colspan="6" class="empty-state">No work entries or material bills.</td></tr>';
    }

    // Populate the Payments Tab
    function renderPaymentsTab() {
        const tbody = document.getElementById('paymentsTableBody');
        const tfoot = document.getElementById('paymentsGrandTotal');
        if (!tbody) return;
        const rows = projectRows().filter((row) => row.type === 'Payment');
        tbody.innerHTML = rows.length ? rows.map((row) => `<tr>
            <td>${formatDate(row.date)}</td><td>${escapeHtml(row.reference)}</td><td>${escapeHtml(row.party)}</td>
            <td>${escapeHtml(row.paid_by || '—')}</td><td>${escapeHtml(row.payment_mode || 'Cash')}</td>
            <td class="text-right">${formatCurrency(row.amount)}</td><td>${recordActions(row)}</td>
        </tr>`).join('') : '<tr><td colspan="7" class="empty-state">No payments recorded.</td></tr>';
        tfoot.textContent = formatCurrency(rows.reduce((sum, row) => sum + row.amount, 0));
    }

    // Populate the Transactions Tab (Combines Work Entries and Payments)
    function renderTransactionsTab() {
        const tbody = document.getElementById('transactionsTableBody');
        if (!tbody) return;
        const rows = projectRows();
        tbody.innerHTML = rows.length ? rows.map((row) => `<tr>
            <td>${formatDate(row.date)}</td><td><span class="badge-type ${row.type === 'Work' ? 'badge-work' : 'badge-payment'}">${row.type}</span></td>
            <td title="${escapeHtml(row.description || '')}">${escapeHtml(row.reference)}</td><td>${escapeHtml(row.party || '—')}</td>
            <td class="text-right">${formatCurrency(row.amount)}</td><td>${recordActions(row)}</td>
        </tr>`).join('') : '<tr><td colspan="6" class="empty-state">No transactions found.</td></tr>';
    }

    // Populate the actual Statement Tab (Side-by-side layout)
    function renderStatement() {
        if (!activeContractorData.contractor) {
            document.getElementById('stmtSummary').style.display = 'none';
            document.getElementById('stmtTablesWrap').style.display = 'none';
            document.getElementById('stmtWorkRows').innerHTML = '';
            document.getElementById('stmtPaymentRows').innerHTML = '';
            return;
        }
        const entries = activeContractorData.entries;
        const payments = activeContractorData.payments;

        // Show UI
        document.getElementById('stmtSummary').style.display = 'flex';
        document.getElementById('stmtTablesWrap').style.display = 'grid';

        const grandTotal = entries.reduce((sum, entry) => sum + workAmount(entry), 0);
        const paidTotal = payments.reduce((sum, payment) => sum + (Number(payment.payment_amount) || 0), 0);
        document.getElementById('stmtTotalBilled').textContent = formatCurrency(grandTotal);
        document.getElementById('stmtTotalPaid').textContent = formatCurrency(paidTotal);
        document.getElementById('stmtBalance').textContent = formatCurrency(grandTotal - paidTotal);

        // Work Table
        const workTbody = document.getElementById('stmtWorkRows');
        let workTotals = { fab: 0, cement: 0, elec: 0, plum: 0, inner: 0, outer: 0, tiles: 0, door: 0, paint: 0 };
        
        if (entries.length === 0) {
            workTbody.innerHTML = '<tr><td colspan="11" style="text-align:center;">No entries.</td></tr>';
        } else {
            workTbody.innerHTML = entries.map(e => {
                workTotals.fab += Number(e.fabrication || 0);
                workTotals.cement += Number(e.cement_sheet || 0);
                workTotals.elec += Number(e.electrical || 0);
                workTotals.plum += Number(e.plumbing || 0);
                workTotals.inner += Number(e.inner_colour || 0);
                workTotals.outer += Number(e.outer_colour || 0);
                workTotals.tiles += Number(e.tiles || 0);
                workTotals.door += Number(e.door_fitting || 0);
                workTotals.paint += Number(e.paint || 0); 
                
                const rowAmount = workAmount(e);

                return `<tr>
                    <td class="sticky-left">${formatDate(e.entry_date)}</td>
                    <td class="text-right">${e.fabrication || 0}</td>
                    <td class="text-right">${e.cement_sheet || 0}</td>
                    <td class="text-right">${e.electrical || 0}</td>
                    <td class="text-right">${e.plumbing || 0}</td>
                    <td class="text-right">${e.inner_colour || 0}</td>
                    <td class="text-right">${e.outer_colour || 0}</td>
                    <td class="text-right">${e.tiles || 0}</td>
                    <td class="text-right">${e.door_fitting || 0}</td>
                    <td class="text-right">${e.paint || 0}</td>
                    <td class="text-right sticky-right">${formatCurrency(rowAmount)}</td>
                </tr>`;
            }).join('');
        }

        document.getElementById('stmtWorkFooter').innerHTML = `
            <tr>
                <td class="sticky-left">Total</td>
                <td class="text-right">${workTotals.fab}</td>
                <td class="text-right">${workTotals.cement}</td>
                <td class="text-right">${workTotals.elec}</td>
                <td class="text-right">${workTotals.plum}</td>
                <td class="text-right">${workTotals.inner}</td>
                <td class="text-right">${workTotals.outer}</td>
                <td class="text-right">${workTotals.tiles}</td>
                <td class="text-right">${workTotals.door}</td>
                <td class="text-right">${workTotals.paint}</td>
                <td class="text-right sticky-right">${formatCurrency(grandTotal)}</td>
            </tr>
        `;

        // Payments Table (Strict layout)
        const payTbody = document.getElementById('stmtPaymentRows');
        let payTotal = 0;
        if (payments.length === 0) {
            payTbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No payments.</td></tr>';
        } else {
            payTbody.innerHTML = payments.map(p => {
                payTotal += Number(p.payment_amount || 0);
                return `<tr>
                    <td>${formatDate(p.payment_date)}</td>
                    <td>${escapeHtml(p.paid_by || '—')}</td>
                    <td>${escapeHtml(p.payment_mode || 'Cash')}</td>
                    <td class="text-right">${formatCurrency(p.payment_amount)}</td>
                </tr>`;
            }).join('');
        }

        document.getElementById('stmtPaymentFooter').innerHTML = `
            <tr>
                <td colspan="3"><strong>Total</strong></td>
                <td class="text-right"><strong>${formatCurrency(payTotal)}</strong></td>
            </tr>
        `;
    }

    async function projectRequest(url, options = {}) {
        const response = await fetch(url, {
            credentials: 'same-origin', ...options,
            headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'Unable to complete the request.');
        return payload;
    }

    function refreshProjectRecords() {
        if (!currentProject) return Promise.resolve();
        if (refreshingProject) return refreshingProject;
        refreshingProject = loadProjectParties(currentProject.id).finally(() => { refreshingProject = null; });
        return refreshingProject;
    }

    function recordUrl(record) {
        if (record.type === 'Work' || record.type === 'Payment') {
            const section = record.type === 'Work' ? 'entries' : 'payments';
            return `${CONTRACTORS_API}/${record.contractor_id}/${section}${record.id ? `/${record.id}` : ''}`;
        }
        return `${API_URL}/${currentProject.id}/transactions${record.id ? `/${record.id}` : ''}`;
    }

    function closeRecordModal() {
        const modal = document.getElementById('projectRecordModal');
        modal.classList.remove('show');
        modal.setAttribute('aria-hidden', 'true');
        document.getElementById('projectRecordForm').reset();
        editingRecord = null;
    }

    function openRecordModal(type, record = null) {
        if (!currentProject) return;
        const shared = type === 'Work' || type === 'Payment';
        if (shared && !currentProjectParties.length) {
            window.alert('Assign a party to this project first.');
            return;
        }
        editingRecord = { ...(record || {}), type };
        const date = new Date();
        const today = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        const input = (name, label, value, inputType = 'text', extra = '') => `<div class="form-group">
            <label for="projectRecord-${name}">${label}</label><input id="projectRecord-${name}" name="${name}" type="${inputType}" value="${escapeHtml(value ?? '')}" ${extra}></div>`;
        const partyOptions = currentProjectParties.map((party) => `<option value="${Number(party.contractor_id)}">${escapeHtml(party.contractor_name)}</option>`).join('');
        let fields = `<div class="form-group"><label for="projectRecord-contractor_id">Party</label>
            <select id="projectRecord-contractor_id" name="contractor_id" ${shared ? 'required' : ''} ${record && shared ? 'disabled' : ''}>
                <option value="">${shared ? 'Select party' : 'No party'}</option>${partyOptions}</select></div>`;
        fields += input('entry_date', 'Date', record?.date || today, 'date', 'required');
        if (type === 'Work') {
            const userLocations = window.is2User?.role === 'Super Admin' ? LOCATION_OPTIONS : window.is2User?.locations || LOCATION_OPTIONS;
            const locations = [...new Set([...userLocations, record?.location || currentProject.location].filter(Boolean))];
            fields += `<div class="form-group"><label for="projectRecord-location">Location</label>
                <select id="projectRecord-location" name="location" required>${locations.map((location) => `<option value="${escapeHtml(location)}">${escapeHtml(location)}</option>`).join('')}</select></div>`;
            fields += WORK_CATEGORIES.filter((category) => category.key !== 'paint').map((category) =>
                input(category.key, `${category.label} Qty`, record?.[category.key] || 0, 'number', 'min="0" step="0.01" required')).join('');
        } else if (type === 'Payment') {
            fields += input('payment_amount', 'Amount', record?.payment_amount ?? '', 'number', 'min="0.01" step="0.01" required');
            fields += input('paid_by', 'Paid By', record?.paid_by || '');
            fields += `<div class="form-group"><label for="projectRecord-payment_mode">Mode</label><select id="projectRecord-payment_mode" name="payment_mode">
                ${['Online', 'Cash', 'Cheque', 'Bank Transfer'].map((mode) => `<option>${mode}</option>`).join('')}</select></div>`;
            fields += input('remarks', 'Remarks', record?.remarks || '');
        } else {
            fields += input('reference', type === 'Material' ? 'Bill Number' : 'Reference', record?.reference || '');
            fields += input('description', 'Description', record?.description || '', 'text', 'required maxlength="500"');
            fields += input('amount', 'Amount', record?.amount ?? '', 'number', 'min="0" step="0.01" required');
        }
        document.getElementById('projectRecordFields').innerHTML = fields;
        document.getElementById('projectRecord-contractor_id').value = record?.contractor_id || activeContractorId || '';
        if (type === 'Work') document.getElementById('projectRecord-location').value = record?.location || currentProject.location;
        if (type === 'Payment') document.getElementById('projectRecord-payment_mode').value = record?.payment_mode || 'Online';
        const title = type === 'Work' ? 'Work Entry' : type === 'Material' ? 'Material Bill' : type === 'Payment' ? 'Payment' : 'Expense';
        document.getElementById('projectRecordTitle').textContent = `${record ? 'Edit' : type === 'Payment' ? 'Record' : 'Add'} ${title}`;
        document.getElementById('projectRecordStatus').textContent = '';
        const modal = document.getElementById('projectRecordModal');
        modal.classList.add('show');
        modal.setAttribute('aria-hidden', 'false');
        document.getElementById('projectRecord-entry_date').focus();
    }

    async function saveRecord(event) {
        event.preventDefault();
        const form = event.currentTarget;
        if (!editingRecord || !form.reportValidity()) return;
        const record = { ...editingRecord };
        const data = Object.fromEntries(new FormData(form));
        record.contractor_id = record.type === 'Work' || record.type === 'Payment'
            ? record.contractor_id || Number(data.contractor_id) || null
            : Number(data.contractor_id) || null;
        const payload = { ...data, contractor_id: record.contractor_id, type: record.type };
        if (record.type === 'Work') {
            const quantities = WORK_CATEGORIES.filter((category) => category.key !== 'paint');
            quantities.forEach((category) => { payload[category.key] = Number(data[category.key]) || 0; });
            if (!quantities.some((category) => payload[category.key] > 0)) {
                document.getElementById('projectRecordStatus').textContent = 'Enter at least one work quantity.';
                return;
            }
        }
        if (record.type === 'Payment') payload.payment_date = data.entry_date;
        const button = document.getElementById('projectRecordSave');
        button.disabled = true;
        try {
            await projectRequest(recordUrl(record), { method: record.id ? 'PUT' : 'POST', body: JSON.stringify(payload) });
            closeRecordModal();
            await refreshProjectRecords();
            renderTable();
            if (record.type === 'Work' || record.type === 'Payment') {
                window.dispatchEvent(new CustomEvent('contractor-data-changed', { detail: { source: 'projects' } }));
            }
        } catch (error) {
            document.getElementById('projectRecordStatus').textContent = error.message;
        } finally {
            button.disabled = false;
        }
    }

    async function recordAction(event) {
        const button = event.target.closest('[data-project-action]');
        if (!button) return;
        const record = projectRows().find((row) => row.type === button.dataset.type && Number(row.id) === Number(button.dataset.id) &&
            (row.type !== 'Work' && row.type !== 'Payment' || Number(row.contractor_id) === Number(button.dataset.contractor)));
        if (!record) return;
        if (button.dataset.projectAction === 'edit') return openRecordModal(record.type, record);
        if (!window.confirm(`Delete this ${record.type.toLowerCase()} record?`)) return;
        button.disabled = true;
        try {
            await projectRequest(recordUrl(record), { method: 'DELETE' });
            await refreshProjectRecords();
            renderTable();
            if (record.type === 'Work' || record.type === 'Payment') {
                window.dispatchEvent(new CustomEvent('contractor-data-changed', { detail: { source: 'projects' } }));
            }
        } catch (error) { window.alert(error.message); }
        finally { button.disabled = false; }
    }

    // --- MAIN PROJECT MODAL LOGIC ---
    function openModal(project = null) {
        const modal = document.getElementById('projectModal');
        const form = document.getElementById('projectForm');
        form.reset();
        form.dataset.id = project ? project.id : '';
        document.getElementById('projectModalTitle').textContent = project ? 'Edit Project' : 'New Project';
        document.getElementById('saveProjectLabel').textContent = project ? 'Update Project' : 'Save Project';

        if (project) {
            Object.entries(project).forEach(([key, val]) => {
                if (form.elements[key]) form.elements[key].value = val == null ? '' : val;
            });
        }
        modal.classList.add('show');
        modal.setAttribute('aria-hidden', 'false');
    }

    function closeModal() {
        const modal = document.getElementById('projectModal');
        modal.classList.remove('show');
        modal.setAttribute('aria-hidden', 'true');
    }

    async function loadProjects() {
        try {
            const response = await fetch(API_URL, { credentials: 'same-origin' });
            if (response.status === 401) return window.location.reload();
            if (!response.ok) throw new Error('Failed to load data');
            projectsData = await response.json();
            renderTable();
        } catch (error) {
            document.getElementById('projectsTableBody').innerHTML = '<tr><td class="empty-state" colspan="9">Error loading projects.</td></tr>';
        }
    }

    async function loadContractors() {
        try {
            const response = await fetch(CONTRACTORS_API, { credentials: 'same-origin' });
            if (response.ok) {
                const data = await response.json();
                globalContractors = data.rows || data; 
            }
        } catch (error) { console.error(error); }
    }

    async function handleSave(event) {
        event.preventDefault();
        const form = event.currentTarget;
        const payload = Object.fromEntries(new FormData(form));
        const isEdit = form.dataset.id ? true : false;
        const url = isEdit ? `${API_URL}/${form.dataset.id}` : API_URL;

        try {
            const response = await fetch(url, {
                method: isEdit ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify(payload)
            });
            if (!response.ok) throw new Error('Failed to save');
            closeModal();
            await loadProjects();
        } catch (error) { window.alert(error.message); }
    }

    async function handleDelete(id) {
        if (!confirm('Are you sure you want to delete this project?')) return;
        try {
            const response = await fetch(`${API_URL}/${id}`, { method: 'DELETE', credentials: 'same-origin' });
            if (!response.ok) throw new Error('Failed to delete');
            await loadProjects();
        } catch (error) { window.alert(error.message); }
    }

    window.editProject = function(id) { 
        const project = projectsData.find(p => p.id === id);
        if (project) openModal(project);
    };
    window.deleteProject = function(id) { handleDelete(id); };

    // --- INITIALIZATION ---
    window.initProjectsPage = function() {
        const root = document.querySelector('.page-view[data-page="projects"]');
        if (!root || root.dataset.initialized === '1') return;
        root.dataset.initialized = '1';

        document.getElementById('projectAddWork').addEventListener('click', () => openRecordModal('Work'));
        document.getElementById('projectAddPayment').addEventListener('click', () => openRecordModal('Payment'));
        document.getElementById('projectAddMaterial').addEventListener('click', () => openRecordModal('Material'));
        document.getElementById('projectAddExpense').addEventListener('click', () => openRecordModal('Expense'));
        document.getElementById('projectRecordForm').addEventListener('submit', saveRecord);
        document.getElementById('projectRecordCancel').addEventListener('click', closeRecordModal);
        document.getElementById('projectRecordClose').addEventListener('click', closeRecordModal);
        document.getElementById('projectRecordModal').addEventListener('click', (event) => {
            if (event.target === event.currentTarget) closeRecordModal();
        });
        ['workTableBody', 'paymentsTableBody', 'transactionsTableBody'].forEach((id) => document.getElementById(id).addEventListener('click', recordAction));
        window.addEventListener('contractor-data-changed', (event) => {
            if (event.detail?.source !== 'projects' && currentProject) refreshProjectRecords();
        });
        window.addEventListener('is2-page-shown', (event) => {
            if (event.detail?.page === 'projects' && currentProject) refreshProjectRecords();
        });

        renderLocationFilter();
        loadContractors(); 

        document.getElementById('newProjectBtn').addEventListener('click', () => openModal());
        document.getElementById('applyProjectFiltersBtn').addEventListener('click', () => { currentPage = 1; renderTable(); });
        document.getElementById('projectSearch').addEventListener('input', () => { currentPage = 1; renderTable(); });
        document.getElementById('projectStatusFilter').addEventListener('change', () => { currentPage = 1; renderTable(); });
        document.getElementById('projectPaginationButtons').addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-page]');
            if (!btn || btn.disabled) return;
            currentPage = Number(btn.dataset.page);
            renderTable();
        });

        document.getElementById('projectForm').addEventListener('submit', handleSave);
        document.querySelectorAll('#projectModal .close-modal').forEach(btn => btn.addEventListener('click', closeModal));
        document.getElementById('projectModal').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) closeModal();
        });

        const locToggle = document.getElementById('projectLocationFilterToggle');
        const locMenu = document.getElementById('projectLocationFilterMenu');
        if (locToggle && locMenu) {
            locToggle.addEventListener('click', (e) => {
                e.stopPropagation();
                locMenu.classList.toggle('show');
            });
            locMenu.addEventListener('change', (e) => {
                const cb = e.target.closest('input[type="checkbox"]');
                if (!cb) return;
                const val = cb.dataset.location;
                if (val === '__all__') selectedLocations.clear();
                else {
                    if (cb.checked) selectedLocations.add(val);
                    else selectedLocations.delete(val);
                }
                renderLocationFilter();
                currentPage = 1;
                renderTable();
            });
            document.addEventListener('click', (e) => {
                if (!e.target.closest('#projectLocationFilterWrap')) locMenu.classList.remove('show');
            });
        }

        loadProjects();
    };
})();