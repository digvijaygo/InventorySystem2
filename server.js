const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(cors());
app.use(bodyParser.json({ limit: '5mb' }));
app.get('/', (req, res) => res.redirect('/login.html'));
app.use(express.static(path.join(__dirname, 'public')));

const otpChallenges = new Map();
const sessions = new Map();
const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

const DEFAULT_LOCATION = 'Kpr Projections';
const SUPPORTED_LOCATIONS = [
    'Arneel Industries Karodi',
    'Anil Industries Karodi',
    'Anil Industries Ghanegoan',
    'Anil Industries Yavatmal',
    'Kpr Projections'
];
const DAILY_STOCK_CATEGORIES = [
    'MS PIPE and MS ANGLE',
    'PAINT (INNER)',
    'PAINT (OUTER)',
    'ELECTRICAL MATERIAL',
    'PLUMBING MATERIAL'
];

function getCookie(req, name) {
    const cookies = String(req.headers.cookie || '').split(';');
    for (const cookie of cookies) {
        const [key, ...value] = cookie.trim().split('=');
        if (key === name) return decodeURIComponent(value.join('='));
    }
    return '';
}

function getSession(req) {
    const token = getCookie(req, 'inventory_session');
    const session = token ? sessions.get(token) : null;
    if (!session || session.expiresAt <= Date.now()) {
        if (token) sessions.delete(token);
        return null;
    }
    return { token, ...session };
}

function requireAuth(req, res, next) {
    const session = getSession(req);
    if (!session) return res.status(401).json({ error: 'Authentication required' });
    req.auth = session;
    next();
}

function getTodayLocalISO() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}
function isValidDateString(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}
function normalizeCategoryName(value) {
    return String(value || '').trim().replace(/\s+/g, ' ');
}
function normalizeLocationName(value) {
    return String(value || '').trim().replace(/\s+/g, ' ');
}
function isSupportedLocation(value) {
    return SUPPORTED_LOCATIONS.includes(normalizeLocationName(value));
}

/* ============================================================
   DATABASE
============================================================ */
const db = new sqlite3.Database('./database.sqlite', (err) => {
    if (err) console.error(err.message);
    else console.log('Connected to SQLite database.');
});

db.serialize(() => {
    /* ---------- USERS ---------- */
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        full_name TEXT NOT NULL,
        mobile_number TEXT NOT NULL UNIQUE,
        role TEXT NOT NULL DEFAULT 'Employee',
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`);
    db.run(`INSERT OR IGNORE INTO users (full_name, mobile_number, role, is_active)
        VALUES ('System Administrator', '9999999999', 'Admin', 1)`);

    /* ---------- DAILY STOCK CATEGORIES ---------- */
    db.run(`CREATE TABLE IF NOT EXISTS daily_stock_categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);

    /* ---------- DAILY STOCK SUB-CATEGORIES ---------- */
    db.run(`CREATE TABLE IF NOT EXISTS daily_stock_subcategories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category_name TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(category_name, name)
    )`);

    /* ---------- DAILY STOCKS ---------- */
    db.run(`CREATE TABLE IF NOT EXISTS daily_stocks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        stock_date TEXT NOT NULL,
        location TEXT NOT NULL,
        category TEXT NOT NULL,
        size TEXT NOT NULL,
        qty_for_1_cabin REAL NOT NULL,
        qty_for_20_cabin REAL NOT NULL DEFAULT 0,
        stock_at_kpr REAL NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_stocks_unique
            ON daily_stocks(stock_date, location, category, size)`);

    /* ---------- Seed default daily stock categories ---------- */
    const categoryInsert = db.prepare('INSERT OR IGNORE INTO daily_stock_categories (name) VALUES (?)');
    DAILY_STOCK_CATEGORIES.forEach((categoryName) => categoryInsert.run(categoryName));
    categoryInsert.finalize();

    /* ---------- CONTRACTORS ---------- */
    db.run(`CREATE TABLE IF NOT EXISTS contractors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        contractor_name TEXT NOT NULL,
        contractor_date TEXT,
        fabrication REAL DEFAULT 0,
        cement_sheet REAL DEFAULT 0,
        electrical REAL DEFAULT 0,
        tiles REAL DEFAULT 0,
        plumbing REAL DEFAULT 0,
        door_fitting REAL DEFAULT 0,
        outer_colour REAL DEFAULT 0,
        inner_colour REAL DEFAULT 0,
        total_amount REAL DEFAULT 0,
        total_payment REAL DEFAULT 0,
        balance_payable REAL DEFAULT 0,
        payment_status TEXT DEFAULT 'PENDING',
        remark TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`);

    /* ---------- WORK ENTRIES ---------- */
    db.run(`CREATE TABLE IF NOT EXISTS contractor_work_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        contractor_id INTEGER NOT NULL,
        location TEXT,
        entry_date TEXT,
        fabrication REAL DEFAULT 0,
        cement_sheet REAL DEFAULT 0,
        electrical REAL DEFAULT 0,
        tiles REAL DEFAULT 0,
        plumbing REAL DEFAULT 0,
        door_fitting REAL DEFAULT 0,
        outer_colour REAL DEFAULT 0,
        inner_colour REAL DEFAULT 0,
        FOREIGN KEY(contractor_id) REFERENCES contractors(id) ON DELETE CASCADE
    )`);

    /* ---------- PAYMENTS ---------- */
    db.run(`CREATE TABLE IF NOT EXISTS contractor_payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        contractor_id INTEGER NOT NULL,
        payment_date TEXT,
        payment_amount REAL DEFAULT 0,
        payment_mode TEXT,
        paid_by TEXT,
        remarks TEXT,
        FOREIGN KEY(contractor_id) REFERENCES contractors(id) ON DELETE CASCADE
    )`);

    /* ---------- RATE CARDS ---------- */
    db.run(`CREATE TABLE IF NOT EXISTS contractor_rate_cards (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        contractor_id INTEGER NOT NULL,
        effective_date TEXT,
        fabrication REAL DEFAULT 0,
        cement_sheet REAL DEFAULT 0,
        electrical REAL DEFAULT 0,
        tiles REAL DEFAULT 0,
        plumbing REAL DEFAULT 0,
        door_fitting REAL DEFAULT 0,
        outer_colour REAL DEFAULT 0,
        inner_colour REAL DEFAULT 0,
        FOREIGN KEY(contractor_id) REFERENCES contractors(id) ON DELETE CASCADE
    )`);

    /* ---------- PURCHASE & SALES ---------- */
    db.run(`CREATE TABLE IF NOT EXISTS purchase_sales (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transaction_type TEXT NOT NULL,
        invoice_date TEXT NOT NULL,
        invoice_number TEXT NOT NULL,
        bill_to TEXT,
        ship_to TEXT,
        item_name TEXT NOT NULL,
        quantity REAL NOT NULL DEFAULT 0,
        hsn_code TEXT,
        rate REAL NOT NULL DEFAULT 0,
        value_amount REAL NOT NULL DEFAULT 0,
        cgst_percent REAL DEFAULT 0,
        cgst_amount REAL DEFAULT 0,
        sgst_percent REAL DEFAULT 0,
        sgst_amount REAL DEFAULT 0,
        igst_percent REAL DEFAULT 0,
        igst_amount REAL DEFAULT 0,
        amount REAL NOT NULL DEFAULT 0,
        delivery TEXT,
        dc_number TEXT,
        ewaybill TEXT,
        location TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`);
    // Add location column for existing DBs
    db.run(`ALTER TABLE purchase_sales ADD COLUMN location TEXT`, () => {});
    db.run(`CREATE INDEX IF NOT EXISTS idx_purchase_sales_location ON purchase_sales(location)`);

    /* ---------- ATTENDANCE ---------- */
    db.run(`CREATE TABLE IF NOT EXISTS attendance_employees (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        department TEXT,
        joining_date TEXT,
        paid REAL DEFAULT 0,
        location TEXT
    )`);
    // Add location column for existing DBs
    db.run(`ALTER TABLE attendance_employees ADD COLUMN location TEXT`, () => {});
    db.run(`CREATE INDEX IF NOT EXISTS idx_attendance_employees_location ON attendance_employees(location)`);

    db.run(`CREATE TABLE IF NOT EXISTS attendance_days (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_id TEXT NOT NULL,
        date TEXT NOT NULL,
        status TEXT,
        rate REAL,
        hours REAL,
        in_time TEXT,
        out_time TEXT,
        remarks TEXT,
        UNIQUE(employee_id, date),
        FOREIGN KEY(employee_id) REFERENCES attendance_employees(id) ON DELETE CASCADE
    )`);

    /* ---------- Seed demo contractors (only if empty) ---------- */
    db.get("SELECT COUNT(*) AS c FROM contractors", (err, row) => {
        if (err || !row || row.c > 0) return;

        const seed = [
            ['Vishnu Jadhav', '2026-08-01', 10, 20, 5, 0, 0, 0, 0, 0, 8220.00, 0, 8220.00, 'UNPAID', 'Demo entry'],
            ['Pilaji Bhima Rathod', '2026-08-02', 0, 0, 0, 40, 0, 0, 0, 0, 34410.00, 0, 34410.00, 'UNPAID', ''],
            ['Ultra Blocks', '2026-08-03', 15, 0, 0, 0, 30, 0, 0, 0, 48500.00, 0, 48500.00, 'UNPAID', ''],
            ['V-Cat Purchase', '2026-08-04', 0, 0, 0, 0, 0, 0, 0, 0, 500.00, 0, 500.00, 'UNPAID', ''],
            ['Vardhaman Corporation', '2026-08-05', 0, 0, 0, 0, 0, 0, 0, 0, 50000.00, 0, 50000.00, 'UNPAID', ''],
            ['Ultratech NT', '2026-08-06', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 'MATCH', '']
        ];

        const stmt = db.prepare(`INSERT INTO contractors
            (contractor_name, contractor_date, fabrication, cement_sheet, electrical, tiles,
             plumbing, door_fitting, outer_colour, inner_colour,
             total_amount, total_payment, balance_payable, payment_status, remark)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
        seed.forEach(r => stmt.run(r));
        stmt.finalize();

        db.run(`INSERT INTO contractor_work_entries
            (contractor_id, location, entry_date, fabrication, cement_sheet, electrical,
             tiles, plumbing, door_fitting, outer_colour, inner_colour)
            VALUES (1, 'Arneel industries karodi', '2026-08-15', 10, 20, 5, 0, 0, 0, 0, 0)`);

        db.run(`INSERT INTO contractor_rate_cards
            (contractor_id, effective_date, fabrication, cement_sheet, electrical,
             tiles, plumbing, door_fitting, outer_colour, inner_colour)
            VALUES (1, '2026-08-01', 100, 150, 200, 120, 130, 250, 80, 90)`);
    });
});

/* ============================================================
   HELPERS
============================================================ */
const WORK_KEYS = ['fabrication','cement_sheet','electrical','tiles','plumbing','door_fitting','outer_colour','inner_colour'];
const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };

function computeStatus(totalAmount, totalPayment) {
    const bal = totalAmount - totalPayment;
    if (Math.abs(bal) < 0.01) return 'MATCH';
    if (bal > 0) return 'PENDING';
    return 'OVERPAID';
}

function recalcContractor(contractorId, cb) {
    db.get(`SELECT total_amount FROM contractors WHERE id=?`, [contractorId], (e, c) => {
        if (e || !c) return cb && cb(e);
        db.get(`SELECT COALESCE(SUM(payment_amount),0) AS paid FROM contractor_payments WHERE contractor_id=?`,
            [contractorId], (e2, p) => {
                if (e2) return cb && cb(e2);
                const paid = n(p.paid);
                const bal = n(c.total_amount) - paid;
                db.run(`UPDATE contractors SET total_payment=?, balance_payable=?, payment_status=? WHERE id=?`,
                    [paid, bal, computeStatus(n(c.total_amount), paid), contractorId],
                    () => cb && cb(null));
            });
    });
}

/* ============================================================
   API: CONTRACTOR LIST / CRUD
============================================================ */
app.get('/api/contractor-payments', (req, res) => {
    const { fromDate, toDate, status, search, location } = req.query;

    const hasFrom     = fromDate && isValidDateString(fromDate);
    const hasTo       = toDate   && isValidDateString(toDate);
    const locationList = Array.isArray(location)
        ? location.map(l => String(l).trim()).filter(Boolean)
        : (location ? [String(location).trim()].filter(Boolean) : []);
    const hasLocation = locationList.length > 0;
    const trimmedSearch = (search && String(search).trim()) || '';

    const baseWhere = ['1=1'];
    const baseParams = [];
    if (trimmedSearch) {
        baseWhere.push('c.contractor_name LIKE ?');
        baseParams.push(`%${trimmedSearch}%`);
    }

    const entryWhere = ['1=1'];
    const entryParams = [];
    if (hasLocation) {
        const placeholders = locationList.map(() => '?').join(', ');
        entryWhere.push(`LOWER(e.location) IN (${placeholders})`);
        locationList.forEach(loc => entryParams.push(String(loc).toLowerCase()));
    }
    if (hasFrom) {
        entryWhere.push('e.entry_date >= ?');
        entryParams.push(fromDate);
    }
    if (hasTo) {
        entryWhere.push('e.entry_date <= ?');
        entryParams.push(toDate);
    }

    const payWhere = ['1=1'];
    const payParams = [];
    if (hasFrom) { payWhere.push('p.payment_date >= ?'); payParams.push(fromDate); }
    if (hasTo)   { payWhere.push('p.payment_date <= ?'); payParams.push(toDate); }

    const sql = `
        WITH
        base_contractors AS (
            SELECT c.id, c.contractor_name, c.contractor_date, c.remark
            FROM contractors c
            WHERE ${baseWhere.join(' AND ')}
        ),
        entries_with_rates AS (
            SELECT
                e.id,
                e.contractor_id,
                e.entry_date,
                e.fabrication, e.cement_sheet, e.electrical, e.tiles,
                e.plumbing, e.door_fitting, e.outer_colour, e.inner_colour,
                COALESCE(
                    (SELECT rc.fabrication FROM contractor_rate_cards rc
                     WHERE rc.contractor_id = e.contractor_id
                       AND rc.effective_date <= e.entry_date
                     ORDER BY rc.effective_date DESC, rc.id DESC LIMIT 1),
                    (SELECT rc.fabrication FROM contractor_rate_cards rc
                     WHERE rc.contractor_id = e.contractor_id
                     ORDER BY rc.effective_date ASC, rc.id ASC LIMIT 1),
                    100
                ) AS r_fabrication,
                COALESCE(
                    (SELECT rc.cement_sheet FROM contractor_rate_cards rc
                     WHERE rc.contractor_id = e.contractor_id
                       AND rc.effective_date <= e.entry_date
                     ORDER BY rc.effective_date DESC, rc.id DESC LIMIT 1),
                    (SELECT rc.cement_sheet FROM contractor_rate_cards rc
                     WHERE rc.contractor_id = e.contractor_id
                     ORDER BY rc.effective_date ASC, rc.id ASC LIMIT 1),
                    150
                ) AS r_cement_sheet,
                COALESCE(
                    (SELECT rc.electrical FROM contractor_rate_cards rc
                     WHERE rc.contractor_id = e.contractor_id
                       AND rc.effective_date <= e.entry_date
                     ORDER BY rc.effective_date DESC, rc.id DESC LIMIT 1),
                    (SELECT rc.electrical FROM contractor_rate_cards rc
                     WHERE rc.contractor_id = e.contractor_id
                     ORDER BY rc.effective_date ASC, rc.id ASC LIMIT 1),
                    200
                ) AS r_electrical,
                COALESCE(
                    (SELECT rc.tiles FROM contractor_rate_cards rc
                     WHERE rc.contractor_id = e.contractor_id
                       AND rc.effective_date <= e.entry_date
                     ORDER BY rc.effective_date DESC, rc.id DESC LIMIT 1),
                    (SELECT rc.tiles FROM contractor_rate_cards rc
                     WHERE rc.contractor_id = e.contractor_id
                     ORDER BY rc.effective_date ASC, rc.id ASC LIMIT 1),
                    120
                ) AS r_tiles,
                COALESCE(
                    (SELECT rc.plumbing FROM contractor_rate_cards rc
                     WHERE rc.contractor_id = e.contractor_id
                       AND rc.effective_date <= e.entry_date
                     ORDER BY rc.effective_date DESC, rc.id DESC LIMIT 1),
                    (SELECT rc.plumbing FROM contractor_rate_cards rc
                     WHERE rc.contractor_id = e.contractor_id
                     ORDER BY rc.effective_date ASC, rc.id ASC LIMIT 1),
                    130
                ) AS r_plumbing,
                COALESCE(
                    (SELECT rc.door_fitting FROM contractor_rate_cards rc
                     WHERE rc.contractor_id = e.contractor_id
                       AND rc.effective_date <= e.entry_date
                     ORDER BY rc.effective_date DESC, rc.id DESC LIMIT 1),
                    (SELECT rc.door_fitting FROM contractor_rate_cards rc
                     WHERE rc.contractor_id = e.contractor_id
                     ORDER BY rc.effective_date ASC, rc.id ASC LIMIT 1),
                    250
                ) AS r_door_fitting,
                COALESCE(
                    (SELECT rc.outer_colour FROM contractor_rate_cards rc
                     WHERE rc.contractor_id = e.contractor_id
                       AND rc.effective_date <= e.entry_date
                     ORDER BY rc.effective_date DESC, rc.id DESC LIMIT 1),
                    (SELECT rc.outer_colour FROM contractor_rate_cards rc
                     WHERE rc.contractor_id = e.contractor_id
                     ORDER BY rc.effective_date ASC, rc.id ASC LIMIT 1),
                    80
                ) AS r_outer_colour,
                COALESCE(
                    (SELECT rc.inner_colour FROM contractor_rate_cards rc
                     WHERE rc.contractor_id = e.contractor_id
                       AND rc.effective_date <= e.entry_date
                     ORDER BY rc.effective_date DESC, rc.id DESC LIMIT 1),
                    (SELECT rc.inner_colour FROM contractor_rate_cards rc
                     WHERE rc.contractor_id = e.contractor_id
                     ORDER BY rc.effective_date ASC, rc.id ASC LIMIT 1),
                    90
                ) AS r_inner_colour
            FROM contractor_work_entries e
            WHERE e.contractor_id IN (SELECT id FROM base_contractors)
              AND ${entryWhere.join(' AND ')}
        ),
        amount_totals AS (
            SELECT
                contractor_id,
                COALESCE(SUM(
                    fabrication  * r_fabrication +
                    cement_sheet * r_cement_sheet +
                    electrical   * r_electrical +
                    tiles        * r_tiles +
                    plumbing     * r_plumbing +
                    door_fitting * r_door_fitting +
                    outer_colour * r_outer_colour +
                    inner_colour * r_inner_colour
                ), 0) AS total_amount
            FROM entries_with_rates
            GROUP BY contractor_id
        ),
        payment_totals AS (
            SELECT
                p.contractor_id,
                COALESCE(SUM(p.payment_amount), 0) AS total_payment
            FROM contractor_payments p
            WHERE p.contractor_id IN (SELECT id FROM base_contractors)
              AND ${payWhere.join(' AND ')}
            GROUP BY p.contractor_id
        ),
        combined AS (
            SELECT
                bc.id,
                bc.contractor_name,
                bc.contractor_date,
                bc.remark,
                COALESCE(at.total_amount, 0)  AS total_amount,
                COALESCE(pt.total_payment, 0) AS total_payment,
                COALESCE(at.total_amount, 0) - COALESCE(pt.total_payment, 0) AS balance_payable
            FROM base_contractors bc
            LEFT JOIN amount_totals  at ON at.contractor_id = bc.id
            LEFT JOIN payment_totals pt ON pt.contractor_id = bc.id
        )
        SELECT
            id,
            contractor_name,
            contractor_date,
            remark,
            total_amount,
            total_payment,
            balance_payable,
            CASE
                WHEN balance_payable >  0.005 THEN CASE WHEN total_payment > 0 THEN 'PENDING' ELSE 'UNPAID' END
                WHEN balance_payable < -0.005 THEN 'OVERPAID'
                ELSE 'PAID'
            END AS payment_status
        FROM combined
        ${status && status !== 'ALL' ? 'WHERE payment_status = ?' : ''}
        ORDER BY contractor_name COLLATE NOCASE ASC
    `;

    const finalParams = [
        ...baseParams,
        ...entryParams,
        ...payParams,
    ];
    if (status && status !== 'ALL') finalParams.push(status);

    db.all(sql, finalParams, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ rows: rows || [] });
    });
});

app.get('/api/contractor-payment-contractors', (req, res) => {
    db.all(`SELECT id, contractor_name FROM contractors ORDER BY contractor_name`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

app.get('/api/contractor-payments/:id', (req, res) => {
    db.get(`SELECT * FROM contractors WHERE id=?`, [req.params.id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Not found' });
        res.json(row);
    });
});

app.post('/api/contractor-payments', (req, res) => {
    const b = req.body || {};
    const name = String(b.contractor_name || '').trim();
    if (!name) return res.status(400).json({ error: 'contractor_name required' });

    const cols = ['contractor_name','contractor_date', ...WORK_KEYS, 'total_amount', 'remark'];
    const vals = [
        name,
        b.contractor_date || null,
        ...WORK_KEYS.map(k => n(b[k])),
        n(b.total_amount),
        b.remark || ''
    ];
    const placeholders = cols.map(() => '?').join(',');

    db.run(`INSERT INTO contractors (${cols.join(',')}) VALUES (${placeholders})`, vals, function (err) {
        if (err) return res.status(500).json({ error: err.message });
        const newId = this.lastID;

        const entries = Array.isArray(b.entries) ? b.entries : [];
        const finish = () => {
            recalcContractor(newId, (e2) => {
                if (e2) return res.status(500).json({ error: e2.message });
                res.json({ id: newId });
            });
        };

        if (!entries.length) return finish();
        const stmt = db.prepare(`INSERT INTO contractor_work_entries
            (contractor_id, location, entry_date, fabrication, cement_sheet, electrical,
             tiles, plumbing, door_fitting, outer_colour, inner_colour)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
        entries.forEach(e => stmt.run([
            newId, e.location || '', e.entry_date || null,
            ...WORK_KEYS.map(k => n(e[k]))
        ]));
        stmt.finalize(finish);
    });
});

app.put('/api/contractor-payments/:id', (req, res) => {
    const id = req.params.id;
    const b = req.body || {};
    const name = String(b.contractor_name || '').trim();
    if (!name) return res.status(400).json({ error: 'contractor_name required' });

    const sets = ['contractor_name=?','contractor_date=?', ...WORK_KEYS.map(k => `${k}=?`), 'total_amount=?','remark=?'];
    const vals = [
        name, b.contractor_date || null,
        ...WORK_KEYS.map(k => n(b[k])),
        n(b.total_amount), b.remark || '',
        id
    ];
    db.run(`UPDATE contractors SET ${sets.join(',')} WHERE id=?`, vals, function (err) {
        if (err) return res.status(500).json({ error: err.message });

        const entries = Array.isArray(b.entries) ? b.entries : null;
        const finish = () => recalcContractor(id, (e2) => {
            if (e2) return res.status(500).json({ error: e2.message });
            res.json({ ok: true });
        });

        if (entries === null) return finish();
        db.run(`DELETE FROM contractor_work_entries WHERE contractor_id=?`, [id], (eDel) => {
            if (eDel) return res.status(500).json({ error: eDel.message });
            if (!entries.length) return finish();
            const stmt = db.prepare(`INSERT INTO contractor_work_entries
                (contractor_id, location, entry_date, fabrication, cement_sheet, electrical,
                 tiles, plumbing, door_fitting, outer_colour, inner_colour)
                VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
            entries.forEach(e => stmt.run([
                id, e.location || '', e.entry_date || null,
                ...WORK_KEYS.map(k => n(e[k]))
            ]));
            stmt.finalize(finish);
        });
    });
});

app.delete('/api/contractor-payments/:id', (req, res) => {
    const id = req.params.id;
    db.run(`DELETE FROM contractor_work_entries WHERE contractor_id=?`, [id], () => {
        db.run(`DELETE FROM contractor_payments WHERE contractor_id=?`, [id], () => {
            db.run(`DELETE FROM contractor_rate_cards WHERE contractor_id=?`, [id], () => {
                db.run(`DELETE FROM contractors WHERE id=?`, [id], function (err) {
                    if (err) return res.status(500).json({ error: err.message });
                    res.json({ ok: true });
                });
            });
        });
    });
});

/* ============================================================
   API: WORK ENTRIES
============================================================ */
app.get('/api/contractor-payments/:id/entries', (req, res) => {
    db.all(`SELECT * FROM contractor_work_entries WHERE contractor_id=? ORDER BY entry_date DESC, id DESC`,
        [req.params.id], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows || []);
        });
});

app.post('/api/contractor-payments/:id/entries', (req, res) => {
    const b = req.body || {};
    const cid = req.params.id;
    db.run(`INSERT INTO contractor_work_entries
        (contractor_id, location, entry_date, fabrication, cement_sheet, electrical,
         tiles, plumbing, door_fitting, outer_colour, inner_colour)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [cid, b.location || '', b.entry_date || null, ...WORK_KEYS.map(k => n(b[k]))],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID });
        });
});

app.put('/api/contractor-payments/:id/entries/:entryId', (req, res) => {
    const b = req.body || {};
    db.run(`UPDATE contractor_work_entries SET
        location=?, entry_date=?,
        fabrication=?, cement_sheet=?, electrical=?, tiles=?,
        plumbing=?, door_fitting=?, outer_colour=?, inner_colour=?
        WHERE id=? AND contractor_id=?`,
        [b.location || '', b.entry_date || null, ...WORK_KEYS.map(k => n(b[k])),
         req.params.entryId, req.params.id],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ok: true });
        });
});

app.delete('/api/contractor-payments/:id/entries/:entryId', (req, res) => {
    db.run(`DELETE FROM contractor_work_entries WHERE id=? AND contractor_id=?`,
        [req.params.entryId, req.params.id], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ok: true });
        });
});

/* ============================================================
   API: PAYMENTS
============================================================ */
app.get('/api/contractor-payments/:id/transactions', (req, res) => {
    db.all(`SELECT * FROM contractor_payments WHERE contractor_id=? ORDER BY payment_date DESC, id DESC`,
        [req.params.id], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            const dayWise = (rows || []).map(r => ({
                id: r.id,
                payment_date: r.payment_date,
                paid_by: r.paid_by,
                payment_mode: r.payment_mode,
                remarks: r.remarks,
                total_amount: r.payment_amount
            }));
            res.json({ dayWise });
        });
});

app.post('/api/contractor-payments/:id/payments', (req, res) => {
    const b = req.body || {};
    const cid = req.params.id;
    db.run(`INSERT INTO contractor_payments
        (contractor_id, payment_date, payment_amount, payment_mode, paid_by, remarks)
        VALUES (?,?,?,?,?,?)`,
        [cid, b.payment_date || null, n(b.payment_amount), b.payment_mode || '', b.paid_by || '', b.remarks || ''],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            recalcContractor(cid, (e2) => {
                if (e2) return res.status(500).json({ error: e2.message });
                res.json({ id: this.lastID });
            });
        });
});

app.put('/api/contractor-payments/:id/payments/:paymentId', (req, res) => {
    const b = req.body || {};
    const cid = req.params.id;
    db.run(`UPDATE contractor_payments SET
        payment_date=?, payment_amount=?, payment_mode=?, paid_by=?, remarks=?
        WHERE id=? AND contractor_id=?`,
        [b.payment_date || null, n(b.payment_amount), b.payment_mode || '', b.paid_by || '', b.remarks || '',
         req.params.paymentId, cid],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            if (!this.changes) return res.status(404).json({ error: 'Payment not found' });
            recalcContractor(cid, (e2) => {
                if (e2) return res.status(500).json({ error: e2.message });
                res.json({ ok: true });
            });
        });
});

app.delete('/api/contractor-payments/:id/payments/:paymentId', (req, res) => {
    const cid = req.params.id;
    db.run(`DELETE FROM contractor_payments WHERE id=? AND contractor_id=?`,
        [req.params.paymentId, cid], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            if (!this.changes) return res.status(404).json({ error: 'Payment not found' });
            recalcContractor(cid, (e2) => {
                if (e2) return res.status(500).json({ error: e2.message });
                res.json({ ok: true });
            });
        });
});

/* ============================================================
   API: RATE CARDS
============================================================ */
app.get('/api/contractor-rate-cards/:id/history', (req, res) => {
    db.all(`SELECT * FROM contractor_rate_cards WHERE contractor_id=? ORDER BY effective_date DESC, id DESC`,
        [req.params.id], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json((rows || []).map(r => ({
                id: r.id,
                effective_date: r.effective_date,
                rates: {
                    fabrication: r.fabrication, cement_sheet: r.cement_sheet,
                    electrical: r.electrical, tiles: r.tiles,
                    plumbing: r.plumbing, door_fitting: r.door_fitting,
                    outer_colour: r.outer_colour, inner_colour: r.inner_colour
                }
            })));
        });
});

app.get('/api/contractor-rate-cards/:id', (req, res) => {
    db.get(`SELECT * FROM contractor_rate_cards WHERE contractor_id=? ORDER BY effective_date DESC, id DESC LIMIT 1`,
        [req.params.id], (err, r) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!r) return res.json(null);
            res.json({
                id: r.id,
                effective_date: r.effective_date,
                rates: {
                    fabrication: r.fabrication, cement_sheet: r.cement_sheet,
                    electrical: r.electrical, tiles: r.tiles,
                    plumbing: r.plumbing, door_fitting: r.door_fitting,
                    outer_colour: r.outer_colour, inner_colour: r.inner_colour
                }
            });
        });
});

app.post('/api/contractor-rate-cards', (req, res) => {
    const b = req.body || {};
    const cid = Number(b.contractor_id);
    if (!cid) return res.status(400).json({ error: 'contractor_id required' });
    const rates = b.rates || {};
    db.run(`INSERT INTO contractor_rate_cards
        (contractor_id, effective_date, fabrication, cement_sheet, electrical,
         tiles, plumbing, door_fitting, outer_colour, inner_colour)
        VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [cid, b.effective_date || null, ...WORK_KEYS.map(k => n(rates[k]))],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID });
        });
});

/* ============================================================
   API: PURCHASE & SALES
============================================================ */
app.get('/api/purchase-sales', (req, res) => {
    db.all(`SELECT * FROM purchase_sales ORDER BY invoice_date DESC, id DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

app.post('/api/purchase-sales', (req, res) => {
    const b = req.body || {};
    const required = ['transaction_type', 'invoice_date', 'invoice_number', 'bill_to', 'item_name', 'quantity', 'rate'];
    for (const field of required) {
        if (b[field] === undefined || b[field] === null || b[field] === '') {
            return res.status(400).json({ error: `Missing field: ${field}` });
        }
    }

    const qty = n(b.quantity);
    const rate = n(b.rate);
    const valueAmount = qty * rate;

    const cgstPct = n(b.cgst_percent);
    const sgstPct = n(b.sgst_percent);
    const igstPct = n(b.igst_percent);

    const cgstAmount = valueAmount * cgstPct / 100;
    const sgstAmount = valueAmount * sgstPct / 100;
    const igstAmount = valueAmount * igstPct / 100;
    const amount = valueAmount + cgstAmount + sgstAmount + igstAmount;

    const sql = `INSERT INTO purchase_sales
        (transaction_type, invoice_date, invoice_number, bill_to, ship_to,
         item_name, quantity, hsn_code, rate, value_amount,
         cgst_percent, cgst_amount, sgst_percent, sgst_amount,
         igst_percent, igst_amount, amount, delivery, dc_number, ewaybill, location)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;

    const params = [
        b.transaction_type, b.invoice_date, b.invoice_number,
        b.bill_to, b.ship_to || null,
        b.item_name, qty, b.hsn_code || null, rate, valueAmount,
        cgstPct, cgstAmount, sgstPct, sgstAmount,
        igstPct, igstAmount, amount,
        b.delivery || null, b.dc_number || null, b.ewaybill || null,
        b.location || null
    ];

    db.run(sql, params, function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.status(201).json({ id: this.lastID, value_amount: valueAmount, amount });
    });
});

app.put('/api/purchase-sales/:id', (req, res) => {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });

    const b = req.body || {};
    const qty = n(b.quantity);
    const rate = n(b.rate);
    const valueAmount = qty * rate;

    const cgstPct = n(b.cgst_percent);
    const sgstPct = n(b.sgst_percent);
    const igstPct = n(b.igst_percent);

    const cgstAmount = valueAmount * cgstPct / 100;
    const sgstAmount = valueAmount * sgstPct / 100;
    const igstAmount = valueAmount * igstPct / 100;
    const amount = valueAmount + cgstAmount + sgstAmount + igstAmount;

    const sql = `UPDATE purchase_sales SET
        transaction_type=?, invoice_date=?, invoice_number=?,
        bill_to=?, ship_to=?, item_name=?, quantity=?,
        hsn_code=?, rate=?, value_amount=?,
        cgst_percent=?, cgst_amount=?, sgst_percent=?, sgst_amount=?,
        igst_percent=?, igst_amount=?, amount=?,
        delivery=?, dc_number=?, ewaybill=?, location=?
        WHERE id=?`;

    const params = [
        b.transaction_type, b.invoice_date, b.invoice_number,
        b.bill_to, b.ship_to || null,
        b.item_name, qty, b.hsn_code || null, rate, valueAmount,
        cgstPct, cgstAmount, sgstPct, sgstAmount,
        igstPct, igstAmount, amount,
        b.delivery || null, b.dc_number || null, b.ewaybill || null,
        b.location || null,
        id
    ];

    db.run(sql, params, function (err) {
        if (err) return res.status(500).json({ error: err.message });
        if (!this.changes) return res.status(404).json({ error: 'Transaction not found' });
        res.json({ ok: true, id });
    });
});

app.delete('/api/purchase-sales/:id', (req, res) => {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    db.run(`DELETE FROM purchase_sales WHERE id=?`, [id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        if (!this.changes) return res.status(404).json({ error: 'Transaction not found' });
        res.json({ ok: true });
    });
});

/* ============================================================
   API: SALE REPORTS (used by reports.js Sale tab)
============================================================ */
app.get('/api/sale-reports', (req, res) => {
    const { fromDate, toDate, status, category, search, location } = req.query;

    const where = [`transaction_type = 'Sale'`];
    const params = [];

    if (fromDate && isValidDateString(fromDate)) { where.push('invoice_date >= ?'); params.push(fromDate); }
    if (toDate   && isValidDateString(toDate))   { where.push('invoice_date <= ?'); params.push(toDate); }

    if (search && String(search).trim()) {
        where.push('(bill_to LIKE ? OR item_name LIKE ? OR invoice_number LIKE ?)');
        const term = `%${String(search).trim()}%`;
        params.push(term, term, term);
    }

    if (category && category !== 'ALL') {
        where.push('item_name LIKE ?');
        params.push(`%${category}%`);
    }

    if (location && String(location).trim()) {
        where.push('LOWER(location) = ?');
        params.push(String(location).trim().toLowerCase());
    }

    const sql = `SELECT * FROM purchase_sales WHERE ${where.join(' AND ')} ORDER BY invoice_date DESC, id DESC`;

    db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });

        // Aggregate per row for the reports UI
        const out = (rows || []).map(r => ({
            id: r.id,
            invoice_date: r.invoice_date,
            invoice_number: r.invoice_number,
            bill_to: r.bill_to,
            item_name: r.item_name,
            quantity: n(r.quantity),
            amount: n(r.amount),
            total_value: n(r.amount),
            received: n(r.amount),   // simplified — full payment assumed if status=PAID
            cement: /cement/i.test(r.item_name || '') ? n(r.quantity) : 0,
            steel:  /steel/i.test(r.item_name  || '') ? n(r.quantity) : 0,
            paint:  /paint/i.test(r.item_name  || '') ? n(r.quantity) : 0,
            tiles:  /tile/i.test(r.item_name   || '') ? n(r.quantity) : 0,
        }));

        res.json({ rows: out });
    });
});

/* ============================================================
   API: PURCHASE REPORTS (used by reports.js Purchase tab)
============================================================ */
app.get('/api/purchase-reports', (req, res) => {
    const { fromDate, toDate, status, category, search, location } = req.query;

    const where = [`transaction_type = 'Purchase'`];
    const params = [];

    if (fromDate && isValidDateString(fromDate)) { where.push('invoice_date >= ?'); params.push(fromDate); }
    if (toDate   && isValidDateString(toDate))   { where.push('invoice_date <= ?'); params.push(toDate); }

    if (search && String(search).trim()) {
        where.push('(bill_to LIKE ? OR item_name LIKE ? OR invoice_number LIKE ?)');
        const term = `%${String(search).trim()}%`;
        params.push(term, term, term);
    }

    if (category && category !== 'ALL') {
        where.push('item_name LIKE ?');
        params.push(`%${category}%`);
    }

    if (location && String(location).trim()) {
        where.push('LOWER(location) = ?');
        params.push(String(location).trim().toLowerCase());
    }

    const sql = `SELECT * FROM purchase_sales WHERE ${where.join(' AND ')} ORDER BY invoice_date DESC, id DESC`;

    db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });

        const out = (rows || []).map(r => ({
            id: r.id,
            invoice_date: r.invoice_date,
            invoice_number: r.invoice_number,
            bill_to: r.bill_to,
            item_name: r.item_name,
            quantity: n(r.quantity),
            amount: n(r.amount),
            total_value: n(r.amount),
            paid: n(r.amount),
            supplier_a: 0, supplier_b: 0, supplier_c: 0, supplier_d: 0
        }));

        res.json({ rows: out });
    });
});

/* ============================================================
   API: ATTENDANCE EMPLOYEES
============================================================ */
app.get('/api/attendance-employees', (req, res) => {
    db.all(`SELECT * FROM attendance_employees ORDER BY id`, [], (err, empRows) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!empRows || !empRows.length) return res.json([]);

        db.all(`SELECT * FROM attendance_days ORDER BY employee_id, date`, [], (err2, dayRows) => {
            if (err2) return res.status(500).json({ error: err2.message });

            const byEmp = {};
            (dayRows || []).forEach(d => {
                if (!byEmp[d.employee_id]) byEmp[d.employee_id] = [];
                byEmp[d.employee_id].push({
                    date: d.date,
                    status: d.status || '',
                    rate: d.rate === null || d.rate === undefined ? '' : d.rate,
                    hours: d.hours === null || d.hours === undefined ? '' : d.hours,
                    inTime: d.in_time || '',
                    outTime: d.out_time || '',
                    remarks: d.remarks || ''
                });
            });

            res.json(empRows.map(e => ({
                id: e.id,
                name: e.name,
                department: e.department || '',
                location: e.location || '',
                joiningDate: e.joining_date || '',
                paid: Number(e.paid) || 0,
                daily: byEmp[e.id] || []
            })));
        });
    });
});

app.post('/api/attendance-employees/bulk', (req, res) => {
    const employees = Array.isArray(req.body && req.body.employees) ? req.body.employees : [];
    if (!employees.length) return res.json({ ok: true });

    db.serialize(() => {
        db.run('BEGIN TRANSACTION');

        db.run('DELETE FROM attendance_days');
        db.run('DELETE FROM attendance_employees');

        const empStmt = db.prepare(`INSERT INTO attendance_employees
            (id, name, department, joining_date, paid, location) VALUES (?,?,?,?,?,?)`);
        const dayStmt = db.prepare(`INSERT OR REPLACE INTO attendance_days
            (employee_id, date, status, rate, hours, in_time, out_time, remarks)
            VALUES (?,?,?,?,?,?,?,?)`);

        employees.forEach(e => {
            empStmt.run([
                String(e.id || ''),
                String(e.name || ''),
                String(e.department || ''),
                e.joiningDate || null,
                Number(e.paid) || 0,
                e.location || null
            ]);
            const daily = Array.isArray(e.daily) ? e.daily : [];
            daily.forEach(d => {
                if (!d || !d.date) return;
                dayStmt.run([
                    String(e.id || ''),
                    d.date,
                    d.status || '',
                    d.rate === '' || d.rate === undefined ? null : Number(d.rate),
                    d.hours === '' || d.hours === undefined ? null : Number(d.hours),
                    d.inTime || '',
                    d.outTime || '',
                    d.remarks || ''
                ]);
            });
        });

        empStmt.finalize();
        dayStmt.finalize(() => {
            db.run('COMMIT', (err) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ ok: true });
            });
        });
    });
});

/* ============================================================
   API: AUTHENTICATION / USERS
============================================================ */
app.post('/api/auth/request-otp', (req, res) => {
    const mobileNumber = String(req.body && req.body.mobile_number || '').replace(/\D/g, '').slice(0, 10);
    if (!/^\d{10}$/.test(mobileNumber)) return res.status(400).json({ error: 'Enter a valid 10-digit mobile number.' });
    db.get(`SELECT id, full_name, mobile_number, role FROM users WHERE mobile_number=? AND is_active=1`,
        [mobileNumber], (err, user) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!user) return res.status(404).json({ error: 'No active user is registered with this mobile number.' });
            const otp = String(crypto.randomInt(100000, 1000000));
            otpChallenges.set(mobileNumber, { otp, user, expiresAt: Date.now() + 5 * 60 * 1000 });
            res.json({ ok: true, otp });
        });
});

app.post('/api/auth/verify-otp', (req, res) => {
    const mobileNumber = String(req.body && req.body.mobile_number || '').replace(/\D/g, '').slice(0, 10);
    const otpCode = String(req.body && req.body.otp_code || '').trim();
    const challenge = otpChallenges.get(mobileNumber);
    if (!challenge || challenge.expiresAt <= Date.now() || challenge.otp !== otpCode) {
        return res.status(401).json({ error: 'Invalid or expired OTP.' });
    }
    otpChallenges.delete(mobileNumber);
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, { user: challenge.user, expiresAt: Date.now() + SESSION_MAX_AGE_SECONDS * 1000 });
    res.setHeader('Set-Cookie', `inventory_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}`);
    res.json({ ok: true, user: challenge.user });
});

app.get('/api/auth/session', (req, res) => {
    const session = getSession(req);
    if (!session) return res.status(401).json({ error: 'No active session' });
    res.json({ user: session.user });
});

app.post('/api/auth/logout', (req, res) => {
    const session = getSession(req);
    if (session) sessions.delete(session.token);
    res.setHeader('Set-Cookie', 'inventory_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
    res.json({ ok: true });
});

app.get('/api/users', requireAuth, (req, res) => {
    db.all(`SELECT id, full_name, mobile_number, role, is_active, created_at FROM users ORDER BY id`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

app.post('/api/users', requireAuth, (req, res) => {
    const b = req.body || {};
    const name = String(b.full_name || '').trim();
    const mobile = String(b.mobile_number || '').replace(/\D/g, '').slice(0, 10);
    if (!name || !/^\d{10}$/.test(mobile)) return res.status(400).json({ error: 'Valid name and mobile number are required.' });
    db.run(`INSERT INTO users (full_name, mobile_number, role, is_active) VALUES (?,?,?,?)`,
        [name, mobile, b.role === 'Admin' ? 'Admin' : 'Employee', Number(b.is_active) === 0 ? 0 : 1],
        function (err) {
            if (err) return res.status(err.code === 'SQLITE_CONSTRAINT' ? 409 : 500).json({ error: err.code === 'SQLITE_CONSTRAINT' ? 'Mobile number is already registered.' : err.message });
            res.status(201).json({ id: this.lastID });
        });
});

app.put('/api/users/:id', requireAuth, (req, res) => {
    const b = req.body || {};
    const name = String(b.full_name || '').trim();
    const mobile = String(b.mobile_number || '').replace(/\D/g, '').slice(0, 10);
    if (!name || !/^\d{10}$/.test(mobile)) return res.status(400).json({ error: 'Valid name and mobile number are required.' });
    db.run(`UPDATE users SET full_name=?, mobile_number=?, role=?, is_active=? WHERE id=?`,
        [name, mobile, b.role === 'Admin' ? 'Admin' : 'Employee', Number(b.is_active) === 0 ? 0 : 1, req.params.id],
        function (err) {
            if (err) return res.status(err.code === 'SQLITE_CONSTRAINT' ? 409 : 500).json({ error: err.code === 'SQLITE_CONSTRAINT' ? 'Mobile number is already registered.' : err.message });
            if (!this.changes) return res.status(404).json({ error: 'User not found' });
            res.json({ ok: true });
        });
});

app.delete('/api/users/:id', requireAuth, (req, res) => {
    if (Number(req.params.id) === Number(req.auth.user.id)) return res.status(400).json({ error: 'You cannot delete your current account.' });
    db.run(`DELETE FROM users WHERE id=?`, [req.params.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        if (!this.changes) return res.status(404).json({ error: 'User not found' });
        res.json({ ok: true });
    });
});

/* ============================================================
   API: DAILY STOCK CATEGORIES
============================================================ */
app.get('/api/daily-stock-categories', (req, res) => {
    db.all(`SELECT id, name FROM daily_stock_categories ORDER BY name COLLATE NOCASE ASC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

app.post('/api/daily-stock-categories', (req, res) => {
    const normalizedName = normalizeCategoryName(req.body && req.body.name);
    if (!normalizedName) return res.status(400).json({ error: 'Category name is required.' });

    db.get(
        `SELECT id, name FROM daily_stock_categories WHERE LOWER(name) = LOWER(?)`,
        [normalizedName],
        (findErr, existingRow) => {
            if (findErr) return res.status(500).json({ error: findErr.message });
            if (existingRow) return res.status(409).json({ error: 'Category already exists.' });

            db.run('INSERT INTO daily_stock_categories (name) VALUES (?)', [normalizedName], function(insertErr) {
                if (insertErr) return res.status(500).json({ error: insertErr.message });
                res.json({ id: this.lastID, name: normalizedName });
            });
        }
    );
});

/* ============================================================
   API: DAILY STOCK SUB-CATEGORIES
============================================================ */
app.get('/api/daily-stock-subcategories', (req, res) => {
    const category = normalizeCategoryName(req.query.category);
    if (!category) return res.status(400).json({ error: 'Category is required.' });

    db.all(
        `SELECT name FROM daily_stock_subcategories WHERE category_name = ?
         UNION
         SELECT DISTINCT TRIM(size) AS name FROM daily_stocks WHERE category = ? AND TRIM(COALESCE(size, '')) != ''
         ORDER BY name COLLATE NOCASE ASC`,
        [category, category],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json((rows || []).map((row) => ({ category_name: category, name: row.name })));
        }
    );
});

app.post('/api/daily-stock-subcategories', (req, res) => {
    const category = normalizeCategoryName(req.body && req.body.category);
    const name = normalizeCategoryName(req.body && req.body.name);
    if (!category || !name) return res.status(400).json({ error: 'Category and Sub-Category are required.' });

    db.run('INSERT INTO daily_stock_subcategories (category_name, name) VALUES (?, ?)', [category, name], function(err) {
        if (err) {
            if (err.message.includes('UNIQUE constraint failed')) return res.status(409).json({ error: 'Sub-Category already exists for this Category.' });
            return res.status(500).json({ error: err.message });
        }
        res.json({ id: this.lastID, category_name: category, name });
    });
});

/* ============================================================
   API: DAILY STOCKS
============================================================ */
app.get('/api/daily-stocks', (req, res) => {
    const { date, category, location } = req.query;
    const normalizedCategory = normalizeCategoryName(category);
    const normalizedLocation = normalizeLocationName(location);

    if (!normalizedLocation) return res.status(400).json({ error: 'Location is required.' });
    if (!isSupportedLocation(normalizedLocation)) return res.status(400).json({ error: 'Invalid location selected.' });

    const whereClauses = [];
    const params = [];

    if (date) {
        if (!isValidDateString(date)) return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD.' });
        whereClauses.push('stock_date = ?');
        params.push(date);
    }
    if (normalizedCategory) {
        whereClauses.push('category = ?');
        params.push(normalizedCategory);
    }
    whereClauses.push('location = ?');
    params.push(normalizedLocation);

    const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

    db.all(
        `SELECT id, stock_date, location, category, size, qty_for_1_cabin, qty_for_20_cabin, stock_at_kpr, created_at
         FROM daily_stocks ${whereSql} ORDER BY id ASC`,
        params,
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows || []);
        }
    );
});

app.post('/api/daily-stocks', (req, res) => {
    const { stock_date, location, category, size, qty_for_1_cabin, qty_for_20_cabin, cabin_count, stock_at_kpr } = req.body;
    const normalizedCategory = normalizeCategoryName(category);
    const normalizedLocation = normalizeLocationName(location);

    if (!isValidDateString(stock_date)) return res.status(400).json({ error: 'Invalid stock_date format. Use YYYY-MM-DD.' });
    if (stock_date > getTodayLocalISO()) return res.status(400).json({ error: 'Future date is not allowed.' });
    if (stock_date !== getTodayLocalISO()) return res.status(403).json({ error: 'Past date is read-only. You can add records only for today.' });
    if (!normalizedCategory) return res.status(400).json({ error: 'Category is required.' });
    if (!isSupportedLocation(normalizedLocation)) return res.status(400).json({ error: 'Valid location is required.' });
    if (!size || String(size).trim() === '') return res.status(400).json({ error: 'Size is required.' });

    const qtyOne = Number(qty_for_1_cabin);
    const cabinCount = Number(cabin_count);
    const qtyTwentyInput = Number(qty_for_20_cabin);
    const stockAtKpr = Number(stock_at_kpr);

    if (!Number.isFinite(qtyOne) || qtyOne < 0) return res.status(400).json({ error: 'QTY FOR 1 CABIN must be a valid non-negative number.' });

    let qtyTwenty = qtyTwentyInput;
    if (Number.isFinite(cabinCount) && cabinCount > 0) qtyTwenty = qtyOne * Math.floor(cabinCount);
    if (!Number.isFinite(qtyTwenty) || qtyTwenty < 0) qtyTwenty = qtyOne * 20;
    if (!Number.isFinite(stockAtKpr)) return res.status(400).json({ error: 'STOCK AT KPR must be a valid number.' });

    const normalizedSize = String(size).trim();

    db.get(
        `SELECT id, name FROM daily_stock_categories WHERE LOWER(name) = LOWER(?)`,
        [normalizedCategory],
        (categoryErr, categoryRow) => {
            if (categoryErr) return res.status(500).json({ error: categoryErr.message });
            if (!categoryRow) return res.status(400).json({ error: 'Invalid category selected.' });

            db.get(
                `SELECT id FROM daily_stocks WHERE stock_date = ? AND location = ? AND category = ? AND size = ?`,
                [stock_date, normalizedLocation, categoryRow.name, normalizedSize],
                (findErr, existingRow) => {
                    if (findErr) return res.status(500).json({ error: findErr.message });

                    if (existingRow) {
                        db.run(
                            `UPDATE daily_stocks SET qty_for_1_cabin = ?, qty_for_20_cabin = ?, stock_at_kpr = ? WHERE id = ?`,
                            [qtyOne, qtyTwenty, stockAtKpr, existingRow.id],
                            function(updateErr) {
                                if (updateErr) return res.status(500).json({ error: updateErr.message });
                                res.json({ id: existingRow.id, stock_date, location: normalizedLocation, category: categoryRow.name, size: normalizedSize, qty_for_1_cabin: qtyOne, qty_for_20_cabin: qtyTwenty, stock_at_kpr: stockAtKpr, action: 'updated' });
                            }
                        );
                        return;
                    }

                    db.run(
                        `INSERT INTO daily_stocks (stock_date, location, category, size, qty_for_1_cabin, qty_for_20_cabin, stock_at_kpr) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                        [stock_date, normalizedLocation, categoryRow.name, normalizedSize, qtyOne, qtyTwenty, stockAtKpr],
                        function(insertErr) {
                            if (insertErr) return res.status(500).json({ error: insertErr.message });
                            res.json({ id: this.lastID, stock_date, location: normalizedLocation, category: categoryRow.name, size: normalizedSize, qty_for_1_cabin: qtyOne, qty_for_20_cabin: qtyTwenty, stock_at_kpr: stockAtKpr, action: 'inserted' });
                        }
                    );
                }
            );
        }
    );
});

app.put('/api/daily-stocks/:id', (req, res) => {
    const { id } = req.params;
    const { size, qty_for_1_cabin, stock_at_kpr, cabin_count } = req.body;
    const rowId = Number(id);
    if (!Number.isInteger(rowId) || rowId <= 0) return res.status(400).json({ error: 'Invalid row id.' });

    const normalizedSize = String(size || '').trim();
    const qtyOne = Number(qty_for_1_cabin);
    const stockAtKpr = Number(stock_at_kpr);
    const cabinCount = Number(cabin_count);

    if (!normalizedSize) return res.status(400).json({ error: 'Size is required.' });
    if (!Number.isFinite(qtyOne) || qtyOne < 0) return res.status(400).json({ error: 'QTY FOR 1 CABIN must be a valid non-negative number.' });
    if (!Number.isFinite(stockAtKpr)) return res.status(400).json({ error: 'STOCK AT KPR must be a valid number.' });

    const resolvedCabinCount = Number.isFinite(cabinCount) && cabinCount > 0 ? Math.floor(cabinCount) : 20;
    const qtyForCount = qtyOne * resolvedCabinCount;

    db.get('SELECT id, stock_date, category FROM daily_stocks WHERE id = ?', [rowId], (findErr, existingRow) => {
        if (findErr) return res.status(500).json({ error: findErr.message });
        if (!existingRow) return res.status(404).json({ error: 'Row not found.' });
        if (existingRow.stock_date !== getTodayLocalISO()) return res.status(403).json({ error: 'Past date is read-only. You can edit rows only for today.' });

        db.run(
            `UPDATE daily_stocks SET size = ?, qty_for_1_cabin = ?, qty_for_20_cabin = ?, stock_at_kpr = ? WHERE id = ?`,
            [normalizedSize, qtyOne, qtyForCount, stockAtKpr, rowId],
            function(updateErr) {
                if (updateErr) {
                    if (updateErr.message.includes('UNIQUE constraint failed')) return res.status(409).json({ error: 'A row already exists with this description for today and selected category.' });
                    return res.status(500).json({ error: updateErr.message });
                }
                res.json({ id: rowId, stock_date: existingRow.stock_date, category: existingRow.category, size: normalizedSize, qty_for_1_cabin: qtyOne, qty_for_20_cabin: qtyForCount, stock_at_kpr: stockAtKpr, action: 'updated' });
            }
        );
    });
});

app.delete('/api/daily-stocks/:id', (req, res) => {
    const { id } = req.params;
    const rowId = Number(id);
    if (!Number.isInteger(rowId) || rowId <= 0) return res.status(400).json({ error: 'Invalid row id.' });

    db.get('SELECT id, stock_date FROM daily_stocks WHERE id = ?', [rowId], (findErr, existingRow) => {
        if (findErr) return res.status(500).json({ error: findErr.message });
        if (!existingRow) return res.status(404).json({ error: 'Row not found.' });
        if (existingRow.stock_date !== getTodayLocalISO()) return res.status(403).json({ error: 'Past date is read-only. You can delete rows only for today.' });

        db.run('DELETE FROM daily_stocks WHERE id = ?', [rowId], function(deleteErr) {
            if (deleteErr) return res.status(500).json({ error: deleteErr.message });
            res.json({ message: 'Deleted successfully', changes: this.changes });
        });
    });
});

/* ============================================================
   FALLBACK — SPA
============================================================ */
app.get('/*splat', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/* ============================================================
   API: DASHBOARD SUMMARY (used by dashboard.js)
   ============================================================ */
app.get('/api/dashboard-summary', (req, res) => {
    const { location } = req.query;
    const loc = location && String(location).trim() ? String(location).trim() : '';
    const locLower = loc.toLowerCase();

    // ---- Helper: run a scalar query ----
    function scalar(sql, params, cb) {
        db.get(sql, params, (err, row) => {
            if (err) return cb(err);
            cb(null, row ? Object.values(row)[0] : 0);
        });
    }

    // ---- 1) Sale totals (per location) ----
    const saleWhere = [`transaction_type = 'Sale'`];
    const saleParams = [];
    if (loc) { saleWhere.push('LOWER(location) = ?'); saleParams.push(locLower); }

    // ---- 2) Purchase totals (per location) ----
    const purWhere = [`transaction_type = 'Purchase'`];
    const purParams = [];
    if (loc) { purWhere.push('LOWER(location) = ?'); purParams.push(locLower); }

    // ---- 3) Attendance totals (per location) ----
    const attWhere = [`1=1`];
    const attParams = [];
    if (loc) { attWhere.push('LOWER(location) = ?'); attParams.push(locLower); }

    // ---- 4) Contractor totals (per location) ----
    const conWhere = [`1=1`];
    const conParams = [];
    if (loc) { conWhere.push('LOWER(e.location) = ?'); conParams.push(locLower); }

    // Sale total
    scalar(`SELECT COALESCE(SUM(amount), 0) FROM purchase_sales WHERE ${saleWhere.join(' AND ')}`,
        saleParams, (e1, saleTotal) => {
        if (e1) return res.status(500).json({ error: e1.message });

        // Purchase total
        scalar(`SELECT COALESCE(SUM(amount), 0) FROM purchase_sales WHERE ${purWhere.join(' AND ')}`,
            purParams, (e2, purchaseTotal) => {
            if (e2) return res.status(500).json({ error: e2.message });

            // Contractor balance (work value - paid)
            db.get(
                `SELECT
                    COALESCE(SUM(e.fabrication + e.cement_sheet + e.electrical + e.tiles +
                                 e.plumbing + e.door_fitting + e.outer_colour + e.inner_colour), 0) AS work_qty
                 FROM contractor_work_entries e
                 WHERE ${conWhere.join(' AND ')}`,
                conParams,
                (e3, workRow) => {
                    if (e3) return res.status(500).json({ error: e3.message });

                    // Attendance paid + due — read from employees table + days table
                    db.all(
                        `SELECT id, paid, location FROM attendance_employees WHERE ${attWhere.join(' AND ')}`,
                        attParams,
                        (e4, empRows) => {
                            if (e4) return res.status(500).json({ error: e4.message });

                            const empIds = (empRows || []).map(r => r.id);
                            const paidTotal = (empRows || []).reduce((s, r) => s + Number(r.paid || 0), 0);

                            const finish = (attendancePayable) => {
                                const toCollect = Number(saleTotal || 0);
                                const toPay = Number(purchaseTotal || 0);
                                const cash = Number(saleTotal || 0) - Number(purchaseTotal || 0);

                                // Recent transactions across sale/purchase for the location
                                const recentWhere = [`transaction_type IN ('Sale','Purchase')`];
                                const recentParams = [];
                                if (loc) { recentWhere.push('LOWER(location) = ?'); recentParams.push(locLower); }

                                db.all(
                                    `SELECT transaction_type, invoice_number, bill_to, invoice_date, amount
                                     FROM purchase_sales
                                     WHERE ${recentWhere.join(' AND ')}
                                     ORDER BY invoice_date DESC, id DESC
                                     LIMIT 8`,
                                    recentParams,
                                    (e5, recentRows) => {
                                        if (e5) return res.status(500).json({ error: e5.message });

                                        const recent = (recentRows || []).map(r => ({
                                            type: r.transaction_type,
                                            number: r.invoice_number,
                                            party: r.bill_to || '',
                                            date: r.invoice_date,
                                            amount: Number(r.amount || 0),
                                            status: r.transaction_type === 'Sale' ? 'Paid' : 'Unpaid'
                                        }));

                                        res.json({
                                            location: loc || 'All Locations',
                                            sale_total: toCollect,
                                            purchase_total: toPay,
                                            expense_total: 0,
                                            to_collect: toCollect,
                                            to_pay: toPay,
                                            cash_in_hand: cash,
                                            stock_value: 0,
                                            attendance_payable: Number(attendancePayable || 0),
                                            attendance_paid: paidTotal,
                                            recent
                                        });
                                    }
                                );
                            };

                            if (!empIds.length) return finish(0);

                            // Get total payable from attendance_days for those employees
                            const placeholders = empIds.map(() => '?').join(',');
                            db.get(
                                `SELECT COALESCE(SUM(rate * hours), 0) AS total
                                 FROM attendance_days
                                 WHERE employee_id IN (${placeholders})
                                   AND status = 'P'`,
                                empIds,
                                (e6, attTotals) => {
                                    if (e6) return res.status(500).json({ error: e6.message });
                                    finish(attTotals ? attTotals.total : 0);
                                }
                            );
                        }
                    );
                }
            );
        });
    });
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});