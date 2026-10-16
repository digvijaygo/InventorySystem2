const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const defaults = ['add-sale', 'add-purchase', 'add-contractor', 'add-product', 'stock-transfer', 'add-payment'];

test('dashboard defaults and catalog contain only supported shortcuts', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'dashboard.js'), 'utf8');
    const sandbox = { window: {}, localStorage: { getItem: () => null } };
    vm.createContext(sandbox);
    vm.runInContext(source.slice(source.indexOf('  const STORAGE_KEY'), source.indexOf('  function saveActive')), sandbox);
    assert.deepEqual(Array.from(sandbox.window.IS2_QA_DEFAULTS), defaults);
    assert.equal(sandbox.window.IS2_QA_STORAGE_KEY, 'is2.qa.config.v2');
    const catalog = sandbox.window.IS2_QA_CATALOG;
    for (const id of defaults) assert.ok(catalog.some((item) => item.id === id));
    for (const id of ['payment-in', 'payment-out', 'expense', 'sale-order', 'purchase-order', 'stock-adj', 'new-sale', 'new-purchase']) {
        assert.equal(catalog.some((item) => item.id === id), false);
    }
    assert.equal(catalog.find((item) => item.id === 'stock-transfer').label, 'New Transfer');
});

test('all default actions open their project pages and add/new controls', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
    const destinations = [];
    const clicks = [];
    let permitted = true;
    const sandbox = {
        window: { is2CanAccess: () => permitted },
        showPage: (page) => destinations.push(page),
        document: { getElementById: (id) => ({ disabled: false, hidden: false, click: () => clicks.push(id) }) }
    };
    vm.createContext(sandbox);
    vm.runInContext(source.slice(source.indexOf('    const QA_ROUTES'), source.indexOf('    function loadScript')), sandbox);
    defaults.forEach((id) => sandbox.window.is2RunQuickAction(id));
    assert.deepEqual(destinations, ['sale', 'purchase', 'contractors', 'products', 'stock-transfer', 'contractors']);
    assert.deepEqual(clicks, ['newSaleBtn', 'newPurchaseBtn', 'addContractorBtn', 'addProductBtn', 'stOpenAddBtn', 'addPaymentBtn']);
    permitted = false;
    assert.equal(sandbox.window.is2CanQuickAction('add-product'), false);
    sandbox.window.is2RunQuickAction('add-product');
    assert.equal(clicks.length, 6);
    assert.equal(sandbox.window.is2CanQuickAction('sale-order'), false);
});