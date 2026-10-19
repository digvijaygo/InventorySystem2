const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('project parties, statements, and overview work categories stay synchronized', async () => {
    const nodes = new Map();
    const node = (id) => {
        if (!nodes.has(id)) nodes.set(id, {
            innerHTML: '', textContent: '', value: '', style: {}, dataset: {},
            classList: { add() {}, remove() {} }, addEventListener() {}
        });
        return nodes.get(id);
    };
    let parties = [
        { id: 1, contractor_id: 10, contractor_name: 'Party A' },
        { id: 2, contractor_id: 20, contractor_name: 'Party B' }
    ];
    const statements = {
        10: { contractor: { contractor_name: 'Party A' }, entries: [{ id: 1, fabrication: 2, door_fitting: 1 }], payments: [{ id: 2, payment_amount: 200 }] },
        20: { contractor: { contractor_name: 'Party B' }, entries: [{ fabrication: 3, tiles: 4 }], payments: [] }
    };
    const transactions = [
        { id: 1, type: 'Material', amount: 300, entry_date: '2026-10-19', reference: 'BILL-1', description: 'Cement', contractor_name: 'Party A' },
        { id: 2, type: 'Expense', amount: 70, entry_date: '2026-10-19', reference: 'EXP-2', description: 'Freight' }
    ];
    const sandbox = {
        window: {}, console,
        document: {
            getElementById: node,
            querySelectorAll: () => [],
            querySelector: () => node('tab')
        },
        async fetch(url) {
            return { ok: true, async json() {
                if (url.endsWith('/parties')) return parties;
                if (url.endsWith('/transactions')) return transactions;
                return statements[url.split('/')[3]];
            } };
        }
    };
    const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'projects.js'), 'utf8');
    const end = source.indexOf('    // --- MAIN PROJECT MODAL LOGIC ---');
    vm.createContext(sandbox);
    vm.runInContext(source.slice(0, end) + `
        currentProject = { id: 1, budget: 2000 };
        window.refreshParties = () => loadProjectParties(1);
    })();`, sandbox);

    await sandbox.window.refreshParties();
    assert.match(node('statementPartySelect').innerHTML, /Party A/);
    assert.match(node('statementPartySelect').innerHTML, /Party B/);
    assert.equal(node('statementPartySelect').value, '10');
    assert.match(node('stmtWorkRows').innerHTML, /450\.00/);
    assert.match(node('dtCategoryRows').innerHTML, /Door Fitting/);
    assert.match(node('dtCategoryRows').innerHTML, /500\.00/);
    assert.match(node('dtCategoryRows').innerHTML, /480\.00/);
    assert.match(node('dtCostWork').textContent, /1,230\.00/);
    assert.doesNotMatch(node('stmtWorkRows').innerHTML, /NaN/);
    assert.match(node('workTableBody').innerHTML, /Material/);
    assert.match(node('workTableBody').innerHTML, /BILL-1/);
    assert.match(node('workTableBody').innerHTML, /data-project-action="edit"/);
    assert.match(node('paymentsTableBody').innerHTML, /Party A/);
    assert.match(node('paymentsGrandTotal').textContent, /200\.00/);
    assert.match(node('transactionsTableBody').innerHTML, /Expense/);
    assert.match(node('transactionsTableBody').innerHTML, /data-project-action="delete"/);
    assert.match(node('dtCostMaterial').textContent, /300\.00/);
    assert.match(node('dtCostExpenses').textContent, /70\.00/);
    assert.match(node('dtTotalCost').textContent, /1,600\.00/);
    assert.match(node('dtTotalPaid').textContent, /200\.00/);
    assert.match(node('dtOutstanding').textContent, /1,400\.00/);
    assert.match(node('dtBudgetRemaining').textContent, /400\.00/);

    await sandbox.window.loadStatement('20');
    assert.equal(node('statementPartySelect').value, '20');
    assert.match(node('stmtWorkRows').innerHTML, /780\.00/);
    assert.match(node('workTableBody').innerHTML, /Party B/);
    assert.match(node('dtCostWork').textContent, /1,230\.00/);

    parties = [parties[1]];
    await sandbox.window.refreshParties();
    assert.doesNotMatch(node('statementPartySelect').innerHTML, /Party A/);
    assert.equal(node('statementPartySelect').value, '20');
    assert.match(node('dtCostWork').textContent, /780\.00/);

    parties = [];
    await sandbox.window.refreshParties();
    assert.equal(node('statementPartySelect').value, '');
    assert.equal(node('stmtSummary').style.display, 'none');
    assert.equal(node('stmtWorkRows').innerHTML, '');
    assert.match(node('dtCategoryRows').innerHTML, /No work entries/);
    assert.match(node('dtCostWork').textContent, /0\.00/);
});