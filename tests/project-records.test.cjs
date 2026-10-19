const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const sqlite3 = require('sqlite3');

const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const location = 'Arneel Industries Karodi';
const workKeys = ['fabrication', 'cement_sheet', 'electrical', 'tiles', 'plumbing', 'door_fitting', 'outer_colour', 'inner_colour'];

async function fixture() {
    const db = new sqlite3.Database(':memory:');
    const run = (sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, (error) => error ? reject(error) : resolve()));
    const get = (sql, params = []) => new Promise((resolve, reject) => db.get(sql, params, (error, row) => error ? reject(error) : resolve(row)));
    await run('CREATE TABLE projects (id INTEGER PRIMARY KEY, location TEXT)');
    await run(`CREATE TABLE contractors (id INTEGER PRIMARY KEY, contractor_name TEXT, total_amount REAL DEFAULT 0,
        total_payment REAL DEFAULT 0, balance_payable REAL DEFAULT 0, payment_status TEXT)`);
    await run('CREATE TABLE project_parties (id INTEGER PRIMARY KEY, project_id INTEGER, contractor_id INTEGER)');
    await run(`CREATE TABLE contractor_work_entries (id INTEGER PRIMARY KEY, contractor_id INTEGER, location TEXT, entry_date TEXT,
        ${workKeys.map((key) => `${key} REAL DEFAULT 0`).join(',')})`);
    await run(`CREATE TABLE contractor_rate_cards (id INTEGER PRIMARY KEY, contractor_id INTEGER, effective_date TEXT,
        ${workKeys.map((key) => `${key} REAL`).join(',')})`);
    await run(`CREATE TABLE contractor_payments (id INTEGER PRIMARY KEY, contractor_id INTEGER, payment_date TEXT,
        payment_amount REAL, payment_mode TEXT, paid_by TEXT, remarks TEXT)`);
    await run('INSERT INTO projects VALUES (1, ?), (2, ?)', [location, 'Kpr Projections']);
    await run("INSERT INTO contractors (id,contractor_name) VALUES (10,'Party A'),(20,'Party B')");
    await run('INSERT INTO project_parties VALUES (1,1,10)');
    const routes = new Map();
    const app = Object.fromEntries(['get', 'post', 'put', 'delete'].map((method) => [method, (url, ...handlers) => routes.set(`${method} ${url}`, handlers)]));
    const sandbox = {
        db, app, WORK_KEYS: workKeys, console, SUPPORTED_LOCATIONS: [location],
        n: (value) => Number(value) || 0,
        computeStatus: (amount, paid) => amount === paid ? 'MATCH' : 'PENDING',
        getProductLocation: (value) => value === location ? value : '',
        isValidDateString: (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value),
        actionForRequest: (req) => ({ GET: 'view', POST: 'create', PUT: 'edit', DELETE: 'delete' })[req.method],
        userCan: (req) => !req.denied,
        requireAuth: (req, res, next) => { req.auth ||= { user: { role: 'Super Admin' } }; next(); },
        authorizeLocations: (req, res, next) => { req.allowedLocations ||= [location]; next(); }
    };
    vm.createContext(sandbox);
    const priceStart = source.indexOf('function pricedContractorEntries');
    vm.runInContext(source.slice(priceStart, source.indexOf('   API: CONTRACTOR LIST', priceStart)).replace(/\/\*\s*=*\s*$/, ''), sandbox);
    const transactionStart = source.indexOf('db.run(`CREATE TABLE IF NOT EXISTS project_transactions');
    vm.runInContext(source.slice(transactionStart, source.indexOf("app.get('/api/projects/:projectId/parties'", transactionStart)), sandbox);
    await run('SELECT 1');
    const entryStart = source.indexOf("app.get('/api/contractor-payments/:id/entries'");
    const rateStart = source.indexOf("app.get('/api/contractor-rate-cards/:id/history'", entryStart);
    const sharedSource = source.slice(entryStart, rateStart);
    vm.runInContext(sharedSource.slice(0, sharedSource.lastIndexOf('/*')), sandbox);
    const listStart = source.indexOf("app.get('/api/projects',");
    vm.runInContext(source.slice(listStart, source.indexOf("app.post('/api/projects',", listStart)), sandbox);
    const statementStart = source.indexOf('function authorizeProjectStatement');
    vm.runInContext(source.slice(statementStart, source.indexOf('function getProductLocation', statementStart)), sandbox);
    const call = (method, url, params = {}, body = {}, extra = {}) => new Promise((resolve, reject) => {
        let status = 200;
        const req = { method: method.toUpperCase(), params, body, query: {}, allowedLocations: [location], auth: { user: { role: 'Super Admin' } }, ...extra };
        const res = { status(value) { status = value; return this; }, json(value) { resolve({ status, body: value }); } };
        const handlers = routes.get(`${method} ${url}`);
        let index = 0;
        const next = () => {
            try { Promise.resolve(handlers[index++](req, res, next)).catch(reject); }
            catch (error) { reject(error); }
        };
        next();
    });
    return { db, run, get, call, close: () => new Promise((resolve, reject) => db.close((error) => error ? reject(error) : resolve())) };
}

test('project Material and Expense CRUD is persisted, validated, and scoped', async () => {
    const state = await fixture();
    const route = '/api/projects/:projectId/transactions';
    const itemRoute = `${route}/:transactionId`;
    const material = { type: 'Material', contractor_id: 10, entry_date: '2026-10-19', reference: 'M1', description: 'Cement', amount: 300 };
    try {
        const first = await state.call('post', route, { projectId: 1 }, material);
        assert.equal(first.status, 201);
        const expense = await state.call('post', route, { projectId: 1 }, { ...material, contractor_id: null, type: 'Expense', description: 'Transport', amount: 75 });
        assert.equal(expense.status, 201);
        let result = await state.call('get', route, { projectId: 1 });
        assert.equal(result.body.length, 2);
        assert.ok(result.body.some((row) => row.type === 'Material' && row.contractor_name === 'Party A'));
        assert.equal((await state.call('put', itemRoute, { projectId: 1, transactionId: first.body.id }, { ...material, amount: 450 })).status, 200);
        assert.equal((await state.get('SELECT amount FROM project_transactions WHERE id=?', [first.body.id])).amount, 450);
        assert.equal((await state.call('post', route, { projectId: 1 }, { ...material, amount: -1 })).status, 400);
        assert.equal((await state.call('post', route, { projectId: 1 }, { ...material, entry_date: '2026-02-30' })).status, 400);
        assert.equal((await state.call('post', route, { projectId: 1 }, { ...material, contractor_id: 20 })).status, 400);
        assert.equal((await state.call('get', route, { projectId: 1 }, {}, { denied: true })).status, 403);
        assert.equal((await state.call('get', route, { projectId: 2 })).status, 404);
        assert.equal((await state.call('delete', itemRoute, { projectId: 1, transactionId: first.body.id })).status, 200);
        result = await state.call('get', route, { projectId: 1 });
        assert.equal(result.body.length, 1);
        assert.equal(result.body[0].type, 'Expense');
    } finally { await state.close(); }
});

test('project work/payment routes share contractor records and recalculate balances with dated rates', async () => {
    const state = await fixture();
    const entries = '/api/contractor-payments/:id/entries';
    const payments = '/api/contractor-payments/:id/payments';
    const work = { entry_date: '2026-10-19', location, fabrication: 2, door_fitting: 1 };
    const payment = { payment_date: '2026-10-19', payment_amount: 100, payment_mode: 'Cash', paid_by: 'Owner' };
    try {
        await state.run('INSERT INTO contractor_rate_cards (contractor_id,effective_date,fabrication,door_fitting) VALUES (10,?,?,?)', ['2026-10-01', 150, 300]);
        const entry = await state.call('post', entries, { id: 10 }, work);
        assert.equal(entry.status, 200);
        assert.equal((await state.get('SELECT total_amount FROM contractors WHERE id=10')).total_amount, 600);
        const paid = await state.call('post', payments, { id: 10 }, payment);
        assert.equal(paid.status, 200);
        assert.equal((await state.get('SELECT balance_payable FROM contractors WHERE id=10')).balance_payable, 500);
        const statement = await state.call('get', '/api/contractors/:id/statement', { id: 10 });
        assert.equal(statement.body.entries[0].amount, 600);
        assert.equal(statement.body.entries[0].work_amounts.fabrication, 300);
        assert.equal(statement.body.payments[0].payment_amount, 100);
        await state.call('post', '/api/projects/:projectId/transactions', { projectId: 1 },
            { type: 'Material', entry_date: '2026-10-19', description: 'Cement', amount: 300 });
        await state.call('post', '/api/projects/:projectId/transactions', { projectId: 1 },
            { type: 'Expense', entry_date: '2026-10-19', description: 'Freight', amount: 75 });
        const projects = await state.call('get', '/api/projects');
        assert.equal(projects.body[0].total_cost, 975);
        assert.equal(projects.body[0].paid, 100);
        assert.equal(projects.body[0].balance, 875);
        assert.equal((await state.call('put', `${entries}/:entryId`, { id: 10, entryId: entry.body.id }, { ...work, fabrication: 3 })).status, 200);
        assert.equal((await state.get('SELECT total_amount FROM contractors WHERE id=10')).total_amount, 750);
        assert.equal((await state.call('put', `${payments}/:paymentId`, { id: 10, paymentId: paid.body.id }, { ...payment, payment_amount: 200 })).status, 200);
        assert.equal((await state.get('SELECT balance_payable FROM contractors WHERE id=10')).balance_payable, 550);
        assert.equal((await state.call('post', entries, { id: 10 }, { ...work, fabrication: -1 })).status, 400);
        assert.equal((await state.call('post', payments, { id: 10 }, { ...payment, payment_amount: -1 })).status, 400);
        await state.call('delete', `${entries}/:entryId`, { id: 10, entryId: entry.body.id });
        await state.call('delete', `${payments}/:paymentId`, { id: 10, paymentId: paid.body.id });
        assert.equal((await state.get('SELECT total_amount, balance_payable FROM contractors WHERE id=10')).total_amount, 0);
        assert.equal((await state.get('SELECT total_amount, balance_payable FROM contractors WHERE id=10')).balance_payable, 0);
    } finally { await state.close(); }
});