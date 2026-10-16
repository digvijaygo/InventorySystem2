const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

function fixture(role = 'Employee', registered = true) {
    const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    const routes = new Map();
    const sessions = new Map([['current', { user: { id: 1 } }], ['other', { user: { id: 2 } }]]);
    const updates = [];
    const sandbox = {
        crypto, Buffer, URLSearchParams, AbortSignal, sessions,
        hashPassword: (password) => `hashed:${password}`,
        defaultPasswordFor: (mobile) => mobile,
        db: {
            get(sql, params, callback) { callback(null, registered ? { id: 1, role } : undefined); },
            run(sql, params, callback) { updates.push(params); callback.call({ changes: 1 }, null); }
        },
        app: { post(route, handler) { routes.set(route, handler); } }
    };
    vm.createContext(sandbox);
    const start = source.indexOf('const passwordResetLimits =');
    vm.runInContext(source.slice(start, source.indexOf("app.post('/api/auth/login'", start)), sandbox);
    const call = (route, body, ip = '127.0.0.1') => new Promise((resolve, reject) => {
        let status = 200;
        const response = { status(value) { status = value; return this; }, json(value) { resolve({ status, body: value }); } };
        Promise.resolve(routes.get(`/api/auth/${route}`)({ body, ip }, response)).catch(reject);
    });
    return { call, updates, sessions, sandbox };
}

for (const role of ['Super Admin', 'Admin', 'Employee']) {
    test(`mobile-only reset works for ${role} and revokes its sessions`, async () => {
        const state = fixture(role);
        const sent = await state.call('reset-password', { mobile_number: '9000000001' });
        assert.equal(sent.status, 200);
        assert.equal(sent.body.otp, undefined);
        assert.equal(state.updates[0][0], 'hashed:9000000001');
        assert.equal(state.sessions.has('current'), false);
        assert.equal(state.sessions.has('other'), true);
        assert.equal(state.updates.length, 1);
    });
}

test('unknown or inactive numbers do not change any account', async () => {
    const state = fixture('Employee', false);
    assert.equal((await state.call('reset-password', { mobile_number: '9000000001' })).status, 200);
    assert.equal(state.updates.length, 0);
    assert.equal(state.sessions.has('current'), true);
});

test('invalid mobile numbers cannot reset a password', async () => {
    const state = fixture();
    for (const mobile of ['', '123', '12345678901', 'abcdefghij']) {
        assert.equal((await state.call('reset-password', { mobile_number: mobile })).status, 400);
    }
    assert.equal(state.updates.length, 0);
});

test('reset requests are rate limited per mobile', async () => {
    const state = fixture();
    for (let count = 0; count < 3; count += 1) {
        assert.equal((await state.call('reset-password', { mobile_number: '9000000001' })).status, 200);
    }
    assert.equal((await state.call('reset-password', { mobile_number: '9000000001' })).status, 429);
});