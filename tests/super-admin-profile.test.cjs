const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const sqlite3 = require('sqlite3');

test('Super Admin edits affect only profile fields and survive startup', async () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    const database = new sqlite3.Database(':memory:');
    const run = (sql, params = []) => new Promise((resolve, reject) => database.run(sql, params, (error) => error ? reject(error) : resolve()));
    const get = (sql) => new Promise((resolve, reject) => database.get(sql, (error, row) => error ? reject(error) : resolve(row)));
    let handler;
    const sandbox = {
        crypto, Buffer, db: database,
        requireSuperAdmin() {},
        sanitizeUserAccess() { return {}; },
        saveUserAccess() { assert.fail('Super Admin access must not be modified'); },
        app: { put(route, middleware, callback) { handler = callback; } }
    };
    vm.createContext(sandbox);
    vm.runInContext(source.slice(source.indexOf('const PBKDF2_ITERATIONS'), source.indexOf('function defaultPasswordFor')), sandbox);
    const start = source.indexOf("app.put('/api/users/:id'");
    vm.runInContext(source.slice(start, source.indexOf("app.delete('/api/users/:id'", start)), sandbox);
    const update = (body) => new Promise((resolve, reject) => {
        let status = 200;
        const response = { status(value) { status = value; return this; }, json(value) { resolve({ status, body: value }); } };
        try { handler({ params: { id: 1 }, body }, response); } catch (error) { reject(error); }
    });
    try {
        await run(`CREATE TABLE users (id INTEGER PRIMARY KEY, full_name TEXT, mobile_number TEXT UNIQUE,
            role TEXT, is_active INTEGER, password_hash TEXT)`);
        await run(`CREATE UNIQUE INDEX idx_users_single_super_admin ON users(role) WHERE role = 'Super Admin'`);
        await run(`INSERT INTO users VALUES (1, 'Original', '9999999999', 'Super Admin', 1, ?)`, [sandbox.hashPassword('original-test-password')]);
        const result = await update({
            full_name: 'Updated', mobile_number: '9000000001', password: 'new-test-password',
            role: 'Employee', is_active: 0, permissions: {}, locations: [], rate_card_access: false
        });
        assert.equal(result.status, 200);
        let user = await get('SELECT * FROM users WHERE id=1');
        assert.equal(user.full_name, 'Updated');
        assert.equal(user.mobile_number, '9000000001');
        assert.equal(user.role, 'Super Admin');
        assert.equal(user.is_active, 1);
        assert.ok(sandbox.verifyPassword('new-test-password', user.password_hash));
        const storedHash = user.password_hash;
        await update({ full_name: 'Updated Again', mobile_number: '9000000001' });
        user = await get('SELECT * FROM users WHERE id=1');
        assert.equal(user.password_hash, storedHash);
        assert.equal((await update({ full_name: 'Invalid', mobile_number: '9000000001', password: 'short' })).status, 400);
        const seedStart = source.indexOf('    db.run(`INSERT OR IGNORE INTO users');
        const seedEnd = source.indexOf('    // ---- Password-based auth', seedStart);
        vm.runInContext(source.slice(seedStart, seedEnd), sandbox);
        const count = await get("SELECT COUNT(*) AS total FROM users WHERE role='Super Admin'");
        assert.equal(count.total, 1);
        assert.equal((await get('SELECT COUNT(*) AS total FROM users')).total, 1);
        assert.equal((await get('SELECT * FROM users WHERE id=1')).mobile_number, '9000000001');
    } finally {
        await new Promise((resolve, reject) => database.close((error) => error ? reject(error) : resolve()));
    }
});