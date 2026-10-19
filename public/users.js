(function () {
    'use strict';

    const LOCATIONS = [
        'Arneel Industries Karodi', 'Anil Industries Karodi',
        'Anil Industries Ghanegoan', 'Anil Industries Yavatmal', 'Kpr Projections'
    ];
    const MODULES = [
        ['dashboard', 'Dashboard', 'fa-house'],
        ['sale', 'Sale', 'fa-cart-shopping'],
        ['estimate', 'Estimate / Quotation', 'fa-file-invoice'],
        ['purchase', 'Purchase & Expense', 'fa-cart-plus'],
        ['products', 'Products', 'fa-box'],
        ['contractors', 'Contractors', 'fa-users'],
        ['attendance', 'Attendance & Payment', 'fa-calendar-check'],
        ['daily-stocks', 'Daily Stocks', 'fa-boxes-stacked'],
        ['stock-transfer', 'Stock Transfer', 'fa-right-left'],
        ['inventory-report', 'Inventory Report', 'fa-chart-column'],
        ['projects', 'Projects', 'fa-folder-open'],
        ['reports', 'Reports', 'fa-file-lines'],
        ['sharewithCA', 'Share with CA', 'fa-share-nodes'],
        ['settings', 'Settings', 'fa-sliders']
    ];
    const ACTIONS = ['view', 'create', 'edit', 'delete'];

    window.initUsersPage = function initUsersPage() {
        const API_URL = '/api/users';
        const tableBody = document.getElementById('usersTableBody');
        const statusText = document.getElementById('usersStatusText');
        const modal = document.getElementById('userModal');
        const form = document.getElementById('userForm');
        const addUserButton = document.getElementById('addUserBtn');
        let users = [];

        Promise.resolve(window.authReady).then((session) => {
            addUserButton.hidden = session?.user?.role !== 'Super Admin';
        });

        const fields = {
            id: document.getElementById('userId'),
            name: document.getElementById('userFullName'),
            mobile: document.getElementById('userMobileNumber'),
            role: document.getElementById('userRole'),
            active: document.getElementById('userIsActive'),
            password: document.getElementById('userPassword')
        };

        document.getElementById('userPermissionsBody').innerHTML = MODULES.map(([key, label, icon]) => `
            <tr data-module="${key}">
                <td><span class="user-module-icon"><i class="fa-solid ${icon}"></i></span>${label}</td>
                ${ACTIONS.map((action) => `<td><input type="checkbox" data-action="${action}" aria-label="${action} ${label}"></td>`).join('')}
                <td><input type="checkbox" data-action="all" aria-label="All permissions for ${label}"></td>
            </tr>`).join('');
        document.getElementById('userLocationsGrid').innerHTML = `
            <label class="user-location-option"><input type="checkbox" data-location="__all__"><span>All Locations</span></label>
            ${LOCATIONS.map((location) => `<label class="user-location-option"><input type="checkbox" data-location="${escapeHtml(location)}"><span>${escapeHtml(location)}</span></label>`).join('')}`;

        function escapeHtml(value) {
            return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
                .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        }
        function setStatus(message, isError = false) {
            statusText.textContent = message || '';
            statusText.classList.toggle('error', isError);
        }

        function closeModal() {
            modal.style.display = 'none';
            form.reset();
            fields.id.value = '';
        }

        function openModal(user = null) {
            document.getElementById('userModalTitle').textContent = user ? 'Edit User' : 'Add New User';
            document.getElementById('userModalSubtitle').textContent = user ? 'Update user details, role and status' : 'Create a user account with role and status';
            document.getElementById('saveUserBtn').textContent = user ? 'Update User' : 'Save User';
            fields.id.value = user ? user.id : '';
            fields.name.value = user?.full_name || '';
            fields.mobile.value = user?.mobile_number || '';
            fields.role.value = user?.role || 'Employee';
            fields.active.value = String(user && Number(user.is_active) === 0 ? 0 : 1);
            fields.password.value = '';
            fields.password.placeholder = user
                ? 'Leave blank to keep current password'
                : 'Leave blank to use mobile number as password';
            document.querySelectorAll('#userPermissionsBody tr').forEach((row) => {
                const rights = user?.permissions?.[row.dataset.module] || {};
                row.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
                    checkbox.checked = checkbox.dataset.action === 'all'
                        ? Boolean(rights.all)
                        : Boolean(rights[checkbox.dataset.action]);
                });
            });
            const locations = user?.locations || [];
            document.querySelectorAll('#userLocationsGrid input[type="checkbox"]').forEach((checkbox) => {
                checkbox.checked = checkbox.dataset.location === '__all__'
                    ? locations.length === LOCATIONS.length
                    : locations.includes(checkbox.dataset.location);
            });
            document.getElementById('userRateCardAccess').checked = Boolean(user?.rate_card_access);
            const isSuperAdmin = user?.role === 'Super Admin';
            if (isSuperAdmin) document.getElementById('userModalSubtitle').textContent = 'Update name, mobile number and password';
            document.getElementById('userAccessSection').hidden = isSuperAdmin;
            document.getElementById('userLocationsSection').hidden = isSuperAdmin;
            document.querySelector('.user-rate-card').hidden = isSuperAdmin;
            fields.role.closest('.form-group').hidden = isSuperAdmin;
            fields.active.closest('.form-group').hidden = isSuperAdmin;
            fields.role.disabled = isSuperAdmin;
            fields.active.disabled = isSuperAdmin;
            modal.style.display = 'flex';
        }

        function renderUsers() {
            document.getElementById('usersCount').textContent = `${users.length} user${users.length === 1 ? '' : 's'}`;
            tableBody.innerHTML = users.length ? users.map((user) => {
                const active = Number(user.is_active) === 1;
                return `<tr>
                    <td>${user.id}</td><td><strong>${escapeHtml(user.full_name)}</strong></td>
                    <td>${escapeHtml(user.mobile_number)}</td><td>${escapeHtml(user.role)}</td>
                    <td>${user.role === 'Super Admin' ? 'All Locations' : `${(user.locations || []).length} assigned`}</td>
                    <td>${user.role === 'Super Admin' || user.rate_card_access ? 'Yes' : 'No'}</td>
                    <td><span class="users-badge ${user.role === 'Super Admin' ? 'super-admin' : active ? 'active' : 'inactive'}">${user.role === 'Super Admin' ? 'Super Admin' : active ? 'Active' : 'Inactive'}</span></td>
                    <td><div class="users-actions">
                        <button type="button" class="users-edit-btn" data-edit-id="${user.id}">Edit</button>
                        <button type="button" class="users-delete-btn" data-delete-id="${user.id}" ${user.role === 'Super Admin' ? 'disabled' : ''}>Delete</button>
                    </div></td>
                </tr>`;
            }).join('') : '<tr><td colspan="8" class="users-empty">No users found.</td></tr>';
        }

        function collectPermissions() {
            const permissions = {};
            document.querySelectorAll('#userPermissionsBody tr').forEach((row) => {
                const rights = {};
                row.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
                    rights[checkbox.dataset.action] = checkbox.checked;
                });
                permissions[row.dataset.module] = rights;
            });
            return permissions;
        }

        function collectLocations() {
            const checkboxes = Array.from(document.querySelectorAll('#userLocationsGrid input[data-location]'));
            if (checkboxes.find((checkbox) => checkbox.dataset.location === '__all__')?.checked) return LOCATIONS;
            return checkboxes.filter((checkbox) => checkbox.checked && checkbox.dataset.location !== '__all__')
                .map((checkbox) => checkbox.dataset.location);
        }

        async function fetchUsers() {
            setStatus('Loading users...');
            try {
                const response = await fetch(API_URL, { credentials: 'include' });
                const payload = await response.json().catch(() => ({}));
                if (!response.ok) throw new Error(payload.error || 'Failed to load users.');
                users = Array.isArray(payload) ? payload : [];
                renderUsers();
                setStatus('');
            } catch (error) { setStatus(error.message || 'Failed to load users.', true); }
        }

        async function saveUser(event) {
            event.preventDefault();
            const id = Number(fields.id.value || 0);
            const mobile = String(fields.mobile.value || '').replace(/\D/g, '').slice(0, 10);
            if (!/^\d{10}$/.test(mobile)) { setStatus('Enter a valid 10-digit mobile number.', true); return; }

            const isSuperAdmin = users.find((user) => Number(user.id) === id)?.role === 'Super Admin';
            const payload = {
                full_name: fields.name.value.trim(),
                mobile_number: mobile,
                ...(!isSuperAdmin ? {
                role: fields.role.value,
                is_active: Number(fields.active.value),
                permissions: collectPermissions(),
                locations: collectLocations(),
                rate_card_access: document.getElementById('userRateCardAccess').checked
                } : {})
            };
            const typedPassword = String(fields.password.value || '');
            if (typedPassword) {
                if (typedPassword.length < 6) { setStatus('Password must be at least 6 characters.', true); return; }
                payload.password = typedPassword;
            }

            const response = await fetch(id ? `${API_URL}/${id}` : API_URL, {
                method: id ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' }, credentials: 'include',
                body: JSON.stringify(payload)
            }).catch(error => { setStatus(error.message, true); return null; });
            if (!response || !response.ok) {
                const body = response ? await response.json().catch(() => ({})) : {};
                setStatus(body.error || 'Failed to save user.', true);
                return;
            }
            closeModal();
            await fetchUsers();
        }

        async function deleteUser(id) {
            if (!window.confirm('Are you sure you want to delete this user?')) return;
            const response = await fetch(`${API_URL}/${id}`, { method: 'DELETE', credentials: 'include' })
                .catch(error => { setStatus(error.message, true); return null; });
            if (!response || !response.ok) {
                const body = response ? await response.json().catch(() => ({})) : {};
                setStatus(body.error || 'Failed to delete user.', true);
                return;
            }
            await fetchUsers();
        }

        addUserButton.addEventListener('click', () => {
            if (!addUserButton.hidden) openModal();
        });
        document.getElementById('cancelUserBtn').addEventListener('click', closeModal);
        document.getElementById('closeUserModal').addEventListener('click', closeModal);
        modal.addEventListener('click', (event) => { if (event.target === modal) closeModal(); });
        form.addEventListener('submit', saveUser);
        tableBody.addEventListener('click', (event) => {
            const editButton = event.target.closest('[data-edit-id]');
            const deleteButton = event.target.closest('[data-delete-id]');
            if (editButton) {
                const user = users.find((entry) => entry.id === Number(editButton.dataset.editId));
                if (user) openModal(user);
            } else if (deleteButton) {
                deleteUser(Number(deleteButton.dataset.deleteId));
            }
        });

        document.getElementById('userPermissionsBody').addEventListener('change', (event) => {
            const checkbox = event.target;
            if (!checkbox.matches('input[type="checkbox"]')) return;
            const row = checkbox.closest('tr');
            if (checkbox.dataset.action === 'all') {
                row.querySelectorAll('input[data-action]:not([data-action="all"])').forEach((item) => { item.checked = checkbox.checked; });
            } else {
                const actionChecks = Array.from(row.querySelectorAll('input[data-action]:not([data-action="all"])'));
                row.querySelector('input[data-action="all"]').checked = actionChecks.every((item) => item.checked);
            }
        });
        document.getElementById('userLocationsGrid').addEventListener('change', (event) => {
            const checkbox = event.target;
            if (!checkbox.matches('input[data-location]')) return;
            const individual = Array.from(document.querySelectorAll('#userLocationsGrid input[data-location]:not([data-location="__all__"])'));
            const all = document.querySelector('#userLocationsGrid input[data-location="__all__"]');
            if (checkbox.dataset.location === '__all__') individual.forEach((item) => { item.checked = checkbox.checked; });
            else all.checked = individual.every((item) => item.checked);
        });

        fetchUsers();
    };
}());