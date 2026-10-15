(function () {
  'use strict';

  const API_URL = '/api/products';
  const LOCATION_OPTIONS = [
    'Arneel Industries Karodi',
    'Anil Industries Karodi',
    'Anil Industries Ghanegoan',
    'Anil Industries Yavatmal',
    'Kpr Projections',
  ];

  function initProductsPage() {
    const root = document.querySelector('.products-page[data-page="products"]');
    if (!root || root.dataset.initialized === '1') return;
    root.dataset.initialized = '1';

    const searchInput = root.querySelector('#productsSearch');
    const listBody = root.querySelector('#productsListBody');
    const detailBody = root.querySelector('#productDetailBody');
    const footer = root.querySelector('#productsFooter');
    const modal = root.querySelector('#productModal');
    const form = root.querySelector('#productForm');
    const locationCheckboxes = Array.from(root.querySelectorAll('#productsLocOptions input[type="checkbox"]'));
    const availableLocations = locationCheckboxes.map((checkbox) => checkbox.value);
    let products = [];
    let selectedProductId = null;
    let debounceTimer;
    let selectedLocations = new Set(availableLocations);
    let appliedLocations = new Set(availableLocations);

    const escapeHtml = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[character]);
    const formatCurrency = (value) => `₹ ${new Intl.NumberFormat('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(value) || 0)}`;
    const formatQuantity = (value) => new Intl.NumberFormat('en-IN', {
      maximumFractionDigits: 2,
    }).format(Number(value) || 0);

    function notify(message, isError = false) {
      let toast = document.querySelector('.products-toast');
      if (!toast) {
        toast = document.createElement('div');
        toast.className = 'products-toast';
        document.body.appendChild(toast);
      }
      toast.textContent = message;
      toast.classList.toggle('error', isError);
      toast.classList.add('visible');
      clearTimeout(toast.timer);
      toast.timer = setTimeout(() => toast.classList.remove('visible'), 2600);
    }

    async function request(url, options = {}) {
      const response = await fetch(url, {
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
        ...options,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'The request could not be completed.');
      return payload;
    }

    function renderRows() {
      if (!appliedLocations.size) {
        listBody.innerHTML = '<tr><td colspan="2" class="products-empty">Select a location.</td></tr>';
        detailBody.innerHTML = '<tr><td colspan="8" class="products-empty">Select a location and product to see details.</td></tr>';
        root.querySelector('#selectedProductHeading').textContent = 'Select a product';
        root.querySelector('#selectedProductSubheading').textContent = 'Choose a location and product to see its details.';
        root.querySelector('#selectedProductAvatar').textContent = 'P';
        footer.textContent = 'No location selected';
        return;
      }
      if (!products.length) {
        listBody.innerHTML = '<tr><td colspan="2" class="products-empty">No products found.</td></tr>';
        detailBody.innerHTML = '<tr><td colspan="8" class="products-empty">Add a product to get started.</td></tr>';
        root.querySelector('#selectedProductHeading').textContent = 'No products';
        root.querySelector('#selectedProductSubheading').textContent = 'No matching products';
        root.querySelector('#selectedProductAvatar').textContent = 'P';
        selectedProductId = null;
        footer.textContent = 'Showing 0 products';
        return;
      }

      if (!products.some((product) => Number(product.id) === Number(selectedProductId))) {
        selectedProductId = products[0].id;
      }
      listBody.innerHTML = products.map((product) => `
        <tr data-product-id="${Number(product.id)}" class="${Number(product.id) === Number(selectedProductId) ? 'selected' : ''}">
          <td class="product-name-cell">${escapeHtml(product.product_name)}</td>
          <td class="text-right">${formatQuantity(product.stock)}</td>
        </tr>`).join('');

      const selectedProduct = products.find((product) => Number(product.id) === Number(selectedProductId));
      root.querySelector('#selectedProductHeading').textContent = selectedProduct.product_name;
      root.querySelector('#selectedProductSubheading').textContent = `Stock: ${formatQuantity(selectedProduct.stock)} · ${selectedProduct.location}`;
      root.querySelector('#selectedProductAvatar').textContent = selectedProduct.product_name.trim().charAt(0).toUpperCase() || 'P';
      detailBody.innerHTML = `
        <tr data-product-id="${Number(selectedProduct.id)}">
          <td class="product-name-cell">${escapeHtml(selectedProduct.product_name)}</td>
          <td>${escapeHtml(selectedProduct.item_code || '-')}</td>
          <td>${escapeHtml(selectedProduct.category || '-')}</td>
          <td class="text-right">${formatCurrency(selectedProduct.sale_price)}</td>
          <td class="text-right">${formatCurrency(selectedProduct.wholesale_price)}</td>
          <td class="text-right">${formatCurrency(selectedProduct.purchase_price)}</td>
          <td class="text-right">${formatQuantity(selectedProduct.stock)}</td>
          <td>
            <div class="product-row-actions">
              <button type="button" class="products-row-btn edit" data-action="edit" title="Edit product" aria-label="Edit ${escapeHtml(selectedProduct.product_name)}"><i class="fa-solid fa-pen"></i></button>
              <button type="button" class="products-row-btn delete" data-action="delete" title="Delete product" aria-label="Delete ${escapeHtml(selectedProduct.product_name)}"><i class="fa-solid fa-trash"></i></button>
            </div>
          </td>
        </tr>`;
      footer.textContent = `Showing ${products.length} product${products.length === 1 ? '' : 's'}`;
    }

    async function loadProducts() {
      searchInput.disabled = !appliedLocations.size;
      if (!appliedLocations.size) {
        products = [];
        renderRows();
        return;
      }
      const params = new URLSearchParams();
      appliedLocations.forEach((location) => params.append('location', location));
      if (searchInput.value.trim()) params.set('search', searchInput.value.trim());
      listBody.innerHTML = '<tr><td colspan="2" class="products-empty">Loading products...</td></tr>';
      detailBody.innerHTML = '<tr><td colspan="8" class="products-empty">Loading product details...</td></tr>';
      try {
        const result = await request(`${API_URL}?${params.toString()}`);
        products = Array.isArray(result.rows) ? result.rows : [];
        renderRows();
      } catch (error) {
        products = [];
        listBody.innerHTML = `<tr><td colspan="2" class="products-empty products-error">${escapeHtml(error.message)}</td></tr>`;
        detailBody.innerHTML = '<tr><td colspan="8" class="products-empty">Unable to load product details.</td></tr>';
        footer.textContent = 'Unable to load products';
      }
    }

    function openModal(product = null) {
      form.reset();
      root.querySelector('#productId').value = product ? product.id : '';
      root.querySelector('#productModalTitle').textContent = product ? 'Edit Product' : 'Add Product';
      root.querySelector('#productName').value = product?.product_name || '';
      root.querySelector('#productCode').value = product?.item_code || '';
      root.querySelector('#productCategory').value = product?.category || '';
      root.querySelector('#productSalePrice').value = product?.sale_price ?? 0;
      root.querySelector('#productWholesalePrice').value = product?.wholesale_price ?? 0;
      root.querySelector('#productPurchasePrice').value = product?.purchase_price ?? 0;
      root.querySelector('#productStock').value = product?.stock ?? 0;
      root.querySelector('#productLocation').value = product?.location || (appliedLocations.size === 1 ? [...appliedLocations][0] : '');
      modal.style.display = 'flex';
      root.querySelector('#productName').focus();
    }

    function closeModal() {
      modal.style.display = 'none';
      form.reset();
      root.querySelector('#productId').value = '';
    }

    root.querySelector('#addProductBtn').addEventListener('click', () => openModal());
    root.querySelector('#closeProductModal').addEventListener('click', closeModal);
    root.querySelector('#cancelProductBtn').addEventListener('click', closeModal);
    modal.addEventListener('click', (event) => {
      if (event.target === modal) closeModal();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && modal.style.display !== 'none') closeModal();
    });

    const locationWrap = root.querySelector('#productsLocMultiSelect');
    const locationMenu = root.querySelector('#productsLocMenu');
    const locationToggle = root.querySelector('#productsLocToggle');
    const selectAllLocations = root.querySelector('#productsLocSelectAll');
    function updateLocationControl() {
      const count = selectedLocations.size;
      root.querySelector('#productsLocToggleLabel').textContent = availableLocations.length > 0 && count === availableLocations.length
        ? 'All Locations'
        : count === 1
          ? [...selectedLocations][0]
          : count
            ? `${count} Locations`
            : 'Select Location';
      selectAllLocations.checked = availableLocations.length > 0 && count === availableLocations.length;
      selectAllLocations.indeterminate = count > 0 && count < availableLocations.length;
    }

    function setLocationMenu(open) {
      locationMenu.hidden = !open;
      locationWrap.classList.toggle('open', open);
      locationToggle.setAttribute('aria-expanded', String(open));
    }

    locationToggle.addEventListener('click', (event) => {
      event.stopPropagation();
      setLocationMenu(locationMenu.hidden);
    });
    selectAllLocations.addEventListener('change', () => {
      selectedLocations = new Set(selectAllLocations.checked ? availableLocations : []);
      locationCheckboxes.forEach((checkbox) => { checkbox.checked = selectedLocations.has(checkbox.value); });
      updateLocationControl();
    });
    locationCheckboxes.forEach((checkbox) => checkbox.addEventListener('change', () => {
      if (checkbox.checked) selectedLocations.add(checkbox.value);
      else selectedLocations.delete(checkbox.value);
      updateLocationControl();
    }));
    document.addEventListener('click', (event) => {
      if (!locationWrap.contains(event.target)) setLocationMenu(false);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') setLocationMenu(false);
    });
    root.querySelector('#applyProductsLocation').addEventListener('click', async () => {
      if (!selectedLocations.size) {
        notify('Select at least one location', true);
        return;
      }
      appliedLocations = new Set(selectedLocations);
      setLocationMenu(false);
      await loadProducts();
    });
    root.querySelector('#resetProductsLocation').addEventListener('click', async () => {
      selectedLocations = new Set(availableLocations);
      locationCheckboxes.forEach((checkbox) => { checkbox.checked = true; });
      updateLocationControl();
      appliedLocations = new Set(availableLocations);
      searchInput.value = '';
      setLocationMenu(false);
      await loadProducts();
    });
    updateLocationControl();

    searchInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(loadProducts, 250);
    });

    listBody.addEventListener('click', (event) => {
      const row = event.target.closest('tr[data-product-id]');
      if (!row) return;
      selectedProductId = Number(row.dataset.productId);
      renderRows();
    });

    detailBody.addEventListener('click', async (event) => {
      const button = event.target.closest('button[data-action]');
      if (!button) return;
      const row = button.closest('tr[data-product-id]');
      const product = products.find((item) => Number(item.id) === Number(row?.dataset.productId));
      if (!product) return;
      if (button.dataset.action === 'edit') {
        openModal(product);
        return;
      }
      if (!window.confirm(`Delete product "${product.product_name}"?`)) return;
      try {
        await request(`${API_URL}/${product.id}`, { method: 'DELETE' });
        notify('Product deleted');
        await loadProducts();
      } catch (error) {
        notify(error.message, true);
      }
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const id = root.querySelector('#productId').value;
      const payload = {
        product_name: root.querySelector('#productName').value.trim(),
        item_code: root.querySelector('#productCode').value.trim(),
        category: root.querySelector('#productCategory').value.trim(),
        sale_price: Number(root.querySelector('#productSalePrice').value),
        wholesale_price: Number(root.querySelector('#productWholesalePrice').value),
        purchase_price: Number(root.querySelector('#productPurchasePrice').value),
        stock: Number(root.querySelector('#productStock').value),
        location: root.querySelector('#productLocation').value,
      };
      try {
        await request(id ? `${API_URL}/${id}` : API_URL, {
          method: id ? 'PUT' : 'POST',
          body: JSON.stringify(payload),
        });
        if (!appliedLocations.has(payload.location)) {
          selectedLocations = new Set([payload.location]);
          appliedLocations = new Set([payload.location]);
          locationCheckboxes.forEach((checkbox) => { checkbox.checked = selectedLocations.has(checkbox.value); });
          updateLocationControl();
        }
        searchInput.value = '';
        closeModal();
        await loadProducts();
        notify(id ? 'Product updated' : 'Product added');
      } catch (error) {
        notify(error.message, true);
      }
    });

    root.querySelector('#addProductBtn').disabled = !availableLocations.length;
    loadProducts();
  }

  window.initProductsPage = initProductsPage;
})();
