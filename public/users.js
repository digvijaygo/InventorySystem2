(function () {
    'use strict';

    window.initUsersPage = function initUsersPage() {
        const API_URL = '/api/users';
        const tableBody = document.getElementById('usersTableBody');
        const statusText = document.getElementById('usersStatusText');
        const modal = document.getElementById('userModal');
        const form = document.getElementById('userForm');
        let users = [];

        const fields = {
            id: document.getElementById('userId'),
            name: document.getElementById('userFullName'),
            mobile: document.getElementById('userMobileNumber'),
            role: document.getElementById('userRole'),
            active: document.getElementById('userIsActive')
        };

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
            modal.style.display = 'flex';
        }

        function renderUsers() {
            document.getElementById('usersCount').textContent = `${users.length} user${users.length === 1 ? '' : 's'}`;
            tableBody.innerHTML = users.length ? users.map((user) => {
                const active = Number(user.is_active) === 1;
                return `<tr>
                    <td>${user.id}</td><td><strong>${escapeHtml(user.full_name)}</strong></td>
                    <td>${escapeHtml(user.mobile_number)}</td><td>${escapeHtml(user.role)}</td>
                    <td><span class="users-badge ${active ? 'active' : 'inactive'}">${active ? 'Active' : 'Inactive'}</span></td>
                    <td><div class="users-actions">
                        <button type="button" class="users-edit-btn" data-edit-id="${user.id}">Edit</button>
                        <button type="button" class="users-delete-btn" data-delete-id="${user.id}">Delete</button>
                    </div></td>
                </tr>`;
            }).join('') : '<tr><td colspan="6" class="users-empty">No users found.</td></tr>';
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
            const response = await fetch(id ? `${API_URL}/${id}` : API_URL, {
                method: id ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' }, credentials: 'include',
                body: JSON.stringify({
                    full_name: fields.name.value.trim(), mobile_number: mobile,
                    role: fields.role.value, is_active: Number(fields.active.value)
                })
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

        document.getElementById('addUserBtn').addEventListener('click', () => openModal());
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

        fetchUsers();
    };
}());
