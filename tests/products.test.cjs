const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const sqlite3 = require('sqlite3');

const locations = ['Arneel Industries Karodi', 'Anil Industries Karodi', 'Kpr Projections'];

test('product location filtering and multi-location stock records', async (context) => {
    const database = new sqlite3.Database(':memory:');
    const run = (sql, params = []) => new Promise((resolve, reject) => {
        database.run(sql, params, (error) => error ? reject(error) : resolve());
    });
    await run(`CREATE TABLE products (
        id INTEGER PRIMARY KEY, product_name TEXT, item_code TEXT, category TEXT,
        sale_price REAL, wholesale_price REAL, purchase_price REAL, stock REAL, location TEXT
    )`);
    const routes = new Map();
    const app = Object.fromEntries(['get', 'post', 'put', 'delete'].map((method) => [
        method, (route, handler) => routes.set(`${method} ${route}`, handler)
    ]));
    const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    const start = source.indexOf('function getProductLocation(value)');
    const end = source.indexOf("app.get('/api/purchase-sales'", start);
    assert.ok(start >= 0 && end > start);
    vm.runInNewContext(source.slice(start, end), {
        app, db: database, SUPPORTED_LOCATIONS: locations,
        normalizeLocationName: (value) => String(value || '').trim().replace(/\s+/g, ' ')
    });

    const call = (method, route, request) => new Promise((resolve, reject) => {
        let status = 200;
        const response = {
            status(code) { status = code; return this; },
            json(body) { resolve({ status, body }); }
        };
        try {
            routes.get(`${method} ${route}`)({ query: {}, body: {}, params: {}, ...request }, response);
        } catch (error) { reject(error); }
    });

    try {
        await context.test('one add creates stock at each selected location', async () => {
            const result = await call('post', '/api/products', {
                body: {
                    product_name: 'Cabin', item_code: 'C1', category: 'Buildings',
                    sale_price: 100, wholesale_price: 90, purchase_price: 80,
                    stock: 12, locations: locations.slice(0, 2)
                }
            });
            assert.equal(result.status, 201);
            const list = await call('get', '/api/products', { allowedLocations: locations });
            assert.equal(list.body.rows.length, 2);
            assert.deepEqual(list.body.rows.map((row) => row.stock), [12, 12]);
        });
        await context.test('Super Admin selection does not return all allowed locations', async () => {
            const result = await call('get', '/api/products', {
                allowedLocations: locations, query: { location: locations[1] }
            });
            assert.equal(result.body.rows.length, 1);
            assert.equal(result.body.rows[0].location, locations[1]);
        });
        await context.test('multiple selected locations and case-insensitive names work', async () => {
            const result = await call('get', '/api/products', {
                allowedLocations: locations,
                query: { location: locations.slice(0, 2).map((location) => location.toLowerCase()) }
            });
            assert.equal(result.body.rows.length, 2);
        });
        await context.test('unassigned locations cannot leak through the filter', async () => {
            const result = await call('get', '/api/products', {
                allowedLocations: [locations[0]], query: { location: locations[1] }
            });
            assert.equal(result.body.rows.length, 0);
        });
        await context.test('editing a location leaves the other location stock intact', async () => {
            const before = await call('get', '/api/products', { allowedLocations: locations });
            const record = before.body.rows[0];
            const update = await call('put', '/api/products/:id', {
                allowedLocations: locations, params: { id: record.id }, body: { ...record, stock: 7 }
            });
            assert.equal(update.status, 200);
            const after = await call('get', '/api/products', { allowedLocations: locations });
            assert.deepEqual(after.body.rows.map((row) => row.stock), [7, 12]);
        });
        await context.test('invalid locations insert no records', async () => {
            const result = await call('post', '/api/products', {
                body: { product_name: 'Invalid', locations: [locations[0], 'Unknown'] }
            });
            assert.equal(result.status, 400);
            const after = await call('get', '/api/products', { allowedLocations: locations });
            assert.equal(after.body.rows.length, 2);
        });
    } finally {
        await new Promise((resolve, reject) => database.close((error) => error ? reject(error) : resolve()));
    }
});