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
    const locationInput = root.querySelector('#productLocation');
    const locationDropdown = root.querySelector('#productLocationDropdown');
    const locationChoices = root.querySelector('#productLocationChoices');
    const locationCheckboxes = Array.from(root.querySelectorAll('#productsLocOptions input[type="checkbox"]'));
    const availableLocations = locationCheckboxes.map((checkbox) => checkbox.value);
    let products = [];
    let selectedProductId = null;
    let debounceTimer;
    let loadVersion = 0;
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
    const productKey = (product) => JSON.stringify([
      product.product_name.trim().toLowerCase(),
      String(product.item_code || '').trim().toLowerCase(),
    ]);

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
        detailBody.innerHTML = '<tr><td colspan="9" class="products-empty">Select a location and product to see details.</td></tr>';
        root.querySelector('#selectedProductHeading').textContent = 'Select a product';
        root.querySelector('#selectedProductSubheading').textContent = 'Choose a location and product to see its details.';
        root.querySelector('#selectedProductAvatar').textContent = 'P';
        footer.textContent = 'No location selected';
        return;
      }
      if (!products.length) {
        listBody.innerHTML = '<tr><td colspan="2" class="products-empty">No products found.</td></tr>';
        detailBody.innerHTML = '<tr><td colspan="9" class="products-empty">No matching products.</td></tr>';
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
      const selectedProduct = products.find((product) => Number(product.id) === Number(selectedProductId));
      const groupedProducts = new Map();
      products.forEach((product) => {
        const key = productKey(product);
        if (!groupedProducts.has(key)) groupedProducts.set(key, []);
        groupedProducts.get(key).push(product);
      });
      listBody.innerHTML = Array.from(groupedProducts.values()).map((entries) => {
        const product = entries[0];
        const totalStock = entries.reduce((total, entry) => total + Number(entry.stock || 0), 0);
        return `
        <tr data-product-id="${Number(product.id)}" class="${productKey(product) === productKey(selectedProduct) ? 'selected' : ''}">
          <td class="product-name-cell">${escapeHtml(product.product_name)}</td>
          <td class="text-right">${formatQuantity(totalStock)}</td>
        </tr>`;
      }).join('');

      const locationRows = groupedProducts.get(productKey(selectedProduct));
      const totalStock = locationRows.reduce((total, entry) => total + Number(entry.stock || 0), 0);
      root.querySelector('#selectedProductHeading').textContent = selectedProduct.product_name;
      root.querySelector('#selectedProductSubheading').textContent = `Stock: ${formatQuantity(totalStock)} | ${new Set(locationRows.map((entry) => entry.location)).size} locations`;
      root.querySelector('#selectedProductAvatar').textContent = selectedProduct.product_name.trim().charAt(0).toUpperCase() || 'P';
      detailBody.innerHTML = locationRows.map((selectedProduct) => `
        <tr data-product-id="${Number(selectedProduct.id)}">
          <td class="product-name-cell">${escapeHtml(selectedProduct.product_name)}</td>
          <td>${escapeHtml(selectedProduct.item_code || '-')}</td>
          <td>${escapeHtml(selectedProduct.category || '-')}</td>
          <td class="text-right">${formatCurrency(selectedProduct.sale_price)}</td>
          <td class="text-right">${formatCurrency(selectedProduct.wholesale_price)}</td>
          <td class="text-right">${formatCurrency(selectedProduct.purchase_price)}</td>
          <td class="text-right">${formatQuantity(selectedProduct.stock)}</td>
          <td>${escapeHtml(selectedProduct.location)}</td>
          <td>
            <div class="product-row-actions">
              <button type="button" class="products-row-btn edit" data-action="edit" title="Edit product" aria-label="Edit ${escapeHtml(selectedProduct.product_name)}"><i class="fa-solid fa-pen"></i></button>
              <button type="button" class="products-row-btn delete" data-action="delete" title="Delete product" aria-label="Delete ${escapeHtml(selectedProduct.product_name)}"><i class="fa-solid fa-trash"></i></button>
            </div>
          </td>
        </tr>`).join('');
      footer.textContent = `Showing ${groupedProducts.size} product${groupedProducts.size === 1 ? '' : 's'}`;
    }

    async function loadProducts() {
      const version = ++loadVersion;
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
      detailBody.innerHTML = '<tr><td colspan="9" class="products-empty">Loading product details...</td></tr>';
      try {
        const result = await request(`${API_URL}?${params.toString()}`);
        if (version !== loadVersion) return;
        products = Array.isArray(result.rows) ? result.rows : [];
        renderRows();
      } catch (error) {
        if (version !== loadVersion) return;
        products = [];
        listBody.innerHTML = `<tr><td colspan="2" class="products-empty products-error">${escapeHtml(error.message)}</td></tr>`;
        detailBody.innerHTML = '<tr><td colspan="9" class="products-empty">Unable to load product details.</td></tr>';
        footer.textContent = 'Unable to load products';
      }
    }

    function syncFormLocations() {
      const selected = Array.from(locationInput.selectedOptions).map((option) => option.value);
      root.querySelector('#productLocationSummary').textContent = selected.length === 1
        ? selected[0]
        : selected.length ? `${selected.length} locations selected` : 'Select locations';
      // Keep the "Select All" checkbox in sync
      const selectAllInput = locationChoices.querySelector('.product-location-select-all input');
      if (selectAllInput) {
        const allChoices = Array.from(locationChoices.querySelectorAll('input[name="productLocationChoice"]'));
        const checkedCount = allChoices.filter((input) => input.checked).length;
        selectAllInput.checked = allChoices.length > 0 && checkedCount === allChoices.length;
        selectAllInput.indeterminate = checkedCount > 0 && checkedCount < allChoices.length;
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
      locationInput.multiple = !product;
      Array.from(locationInput.options).forEach((option) => {
        option.selected = product ? option.value === product.location : appliedLocations.has(option.value);
      });
      const choiceType = product ? 'radio' : 'checkbox';
      const choicesHtml = Array.from(locationInput.options).map((option) => `
        <label class="product-location-choice"><input type="${choiceType}" name="productLocationChoice" value="${escapeHtml(option.value)}" ${option.selected ? 'checked' : ''}><span>${escapeHtml(option.textContent)}</span></label>
      `).join('');
      // Add "Select All" row only in multi-select (Add) mode
      const selectAllHtml = product ? '' : `
        <label class="product-location-choice product-location-select-all">
          <input type="checkbox" name="productLocationSelectAll" ${appliedLocations.size === locationInput.options.length ? 'checked' : ''}>
          <span>Select All Locations</span>
        </label>`;
      locationChoices.innerHTML = selectAllHtml + choicesHtml;
      locationDropdown.open = false;
      syncFormLocations();
      modal.style.display = 'flex';
      root.querySelector('#productName').focus();
    }

    function closeModal() {
      modal.style.display = 'none';
      locationDropdown.open = false;
      form.reset();
      root.querySelector('#productId').value = '';
    }

    root.querySelector('#addProductBtn').addEventListener('click', () => openModal());
    root.querySelector('#closeProductModal').addEventListener('click', closeModal);
    root.querySelector('#cancelProductBtn').addEventListener('click', closeModal);
    locationChoices.addEventListener('change', (event) => {
      // Handle "Select All Locations"
      if (event.target.name === 'productLocationSelectAll') {
        const checked = event.target.checked;
        locationChoices.querySelectorAll('input[name="productLocationChoice"]').forEach((input) => {
          input.checked = checked;
        });
      } else if (event.target.name === 'productLocationChoice') {
        // If a single location is unchecked, also uncheck "Select All"
        if (!event.target.checked) {
          const selectAll = locationChoices.querySelector('.product-location-select-all input');
          if (selectAll) selectAll.checked = false;
        }
      }
      const selected = new Set(Array.from(locationChoices.querySelectorAll('input[name="productLocationChoice"]:checked')).map((input) => input.value));
      Array.from(locationInput.options).forEach((option) => { option.selected = selected.has(option.value); });
      syncFormLocations();
      if (!locationInput.multiple) locationDropdown.open = false;
    });
    document.addEventListener('click', (event) => {
      if (!locationDropdown.contains(event.target)) locationDropdown.open = false;
    });
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
      if (!window.confirm(`Delete product "${product.product_name}" at ${product.location}?`)) return;
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
      if (!locationInput.selectedOptions.length) {
        locationDropdown.open = true;
        locationDropdown.querySelector('summary').focus();
        notify('Select at least one location', true);
        return;
      }
      const id = root.querySelector('#productId').value;
      const payload = {
        product_name: root.querySelector('#productName').value.trim(),
        item_code: root.querySelector('#productCode').value.trim(),
        category: root.querySelector('#productCategory').value.trim(),
        sale_price: Number(root.querySelector('#productSalePrice').value),
        wholesale_price: Number(root.querySelector('#productWholesalePrice').value),
        purchase_price: Number(root.querySelector('#productPurchasePrice').value),
        stock: Number(root.querySelector('#productStock').value),
        locations: Array.from(root.querySelector('#productLocation').selectedOptions).map((option) => option.value),
      };
      if (id) payload.location = payload.locations[0];
      try {
        await request(id ? `${API_URL}/${id}` : API_URL, {
          method: id ? 'PUT' : 'POST',
          body: JSON.stringify(payload),
        });
        if (!payload.locations.some((location) => appliedLocations.has(location))) {
          selectedLocations = new Set(payload.locations);
          appliedLocations = new Set(payload.locations);
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