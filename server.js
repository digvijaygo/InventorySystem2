const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const archiver = require('archiver');
const multer = require('multer');
const fs = require('fs');

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(cors());
app.use(bodyParser.json({ limit: '5mb' }));
app.get('/', (req, res) => res.redirect('/login.html'));
app.use(express.static(path.join(__dirname, 'public')));

// Restore uploads go to a temp folder; the file is copied over the DB afterwards.
const restoreUploadDir = path.join(__dirname, 'restore-uploads');
if (!fs.existsSync(restoreUploadDir)) fs.mkdirSync(restoreUploadDir, { recursive: true });

const restoreUpload = multer({
  dest: restoreUploadDir,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB cap
  fileFilter: (_req, file, cb) => {
    if (!/\.sqlite$/i.test(file.originalname)) {
      return cb(new Error('Only .sqlite backup files are allowed.'));
    }
    cb(null, true);
  }
});




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

    /* ---------- STOCK TRANSFERS ---------- */
    db.run(`CREATE TABLE IF NOT EXISTS stock_transfers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transfer_date TEXT NOT NULL,
        category TEXT NOT NULL,
        size TEXT NOT NULL,
        from_location TEXT NOT NULL,
        to_location TEXT NOT NULL,
        quantity REAL NOT NULL,
        remarks TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_stock_transfers_date ON stock_transfers(transfer_date)`);

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

    /* ---------- ESTIMATES / QUOTATIONS ---------- */
db.run(`CREATE TABLE IF NOT EXISTS estimates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_date TEXT NOT NULL,
    invoice_number TEXT NOT NULL,
    bill_to TEXT,
    ship_to TEXT,
    item_name TEXT NOT NULL,
    quantity REAL NOT NULL DEFAULT 0,
    hsn_code TEXT,
    rate REAL NOT NULL DEFAULT 0,
    value_amount REAL NOT NULL DEFAULT 0,
    discount_percent REAL DEFAULT 0,
    discount_amount REAL DEFAULT 0,
    cgst_percent REAL DEFAULT 0,
    cgst_amount REAL DEFAULT 0,
    sgst_percent REAL DEFAULT 0,
    sgst_amount REAL DEFAULT 0,
    igst_percent REAL DEFAULT 0,
    igst_amount REAL DEFAULT 0,
    amount REAL NOT NULL DEFAULT 0,
    location TEXT,
    remarks TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_estimates_date ON estimates(invoice_date)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_estimates_location ON estimates(location)`);

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
    /* ---------- CA CONTACTS ---------- */
    db.run(`CREATE TABLE IF NOT EXISTS ca_contacts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        business_id INTEGER NOT NULL DEFAULT 1,
        ca_name TEXT NOT NULL,
        ca_email TEXT,
        ca_phone TEXT,
        ca_firm_reg TEXT,
        auto_share_reminder INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(business_id)
    )`);

    /* ---------- CA SHARE LOGS ---------- */
    db.run(`CREATE TABLE IF NOT EXISTS ca_share_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        business_id INTEGER NOT NULL DEFAULT 1,
        ca_contact_id INTEGER,
        share_type TEXT NOT NULL,                -- 'email' | 'whatsapp' | 'zip'
        date_start TEXT NOT NULL,
        date_end TEXT NOT NULL,
        document_types TEXT NOT NULL,            -- JSON-encoded array
        status TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'sent' | 'failed'
        error_message TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(ca_contact_id) REFERENCES ca_contacts(id) ON DELETE SET NULL
    )`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_ca_share_logs_created
            ON ca_share_logs(created_at DESC)`);
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
    const hasEntryFilters = Boolean(hasLocation || hasFrom || hasTo);
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
        WHERE ${hasEntryFilters ? 'EXISTS (SELECT 1 FROM entries_with_rates ewr WHERE ewr.contractor_id = combined.id)' : '1=1'}
        ${status && status !== 'ALL' ? 'AND payment_status = ?' : ''}
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
   API: ESTIMATES / QUOTATIONS
============================================================ */

// GET all estimates
app.get('/api/estimates', (req, res) => {
    db.all(
        `SELECT * FROM estimates ORDER BY invoice_date DESC, id DESC`,
        [],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows || []);
        }
    );
});

// GET one estimate
app.get('/api/estimates/:id', (req, res) => {
    db.get(`SELECT * FROM estimates WHERE id=?`, [req.params.id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Estimate not found' });
        res.json(row);
    });
});

// POST create estimate
app.post('/api/estimates', (req, res) => {
    const b = req.body || {};
    const required = ['invoice_date', 'invoice_number', 'bill_to', 'item_name', 'quantity', 'rate'];
    for (const field of required) {
        if (b[field] === undefined || b[field] === null || b[field] === '') {
            return res.status(400).json({ error: `Missing field: ${field}` });
        }
    }

    const qty = n(b.quantity);
    const rate = n(b.rate);
    const gross = qty * rate;
    const discountPct = n(b.discount_percent);
    const discountAmt = gross * discountPct / 100;
    const taxable = gross - discountAmt;

    const cgstPct = n(b.cgst_percent);
    const sgstPct = n(b.sgst_percent);
    const igstPct = n(b.igst_percent);
    const cgstAmt = taxable * cgstPct / 100;
    const sgstAmt = taxable * sgstPct / 100;
    const igstAmt = taxable * igstPct / 100;
    const amount = taxable + cgstAmt + sgstAmt + igstAmt;

    db.run(
        `INSERT INTO estimates
            (invoice_date, invoice_number, bill_to, ship_to,
             item_name, quantity, hsn_code, rate, value_amount,
             discount_percent, discount_amount,
             cgst_percent, cgst_amount, sgst_percent, sgst_amount,
             igst_percent, igst_amount, amount, location, remarks)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
            b.invoice_date, b.invoice_number, b.bill_to, b.ship_to || null,
            b.item_name, qty, b.hsn_code || null, rate, taxable,
            discountPct, discountAmt,
            cgstPct, cgstAmt, sgstPct, sgstAmt,
            igstPct, igstAmt, amount,
            b.location || null, b.remarks || null
        ],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.status(201).json({ id: this.lastID, amount });
        }
    );
});

// PUT update estimate
app.put('/api/estimates/:id', (req, res) => {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });

    const b = req.body || {};
    const qty = n(b.quantity);
    const rate = n(b.rate);
    const gross = qty * rate;
    const discountPct = n(b.discount_percent);
    const discountAmt = gross * discountPct / 100;
    const taxable = gross - discountAmt;

    const cgstPct = n(b.cgst_percent);
    const sgstPct = n(b.sgst_percent);
    const igstPct = n(b.igst_percent);
    const cgstAmt = taxable * cgstPct / 100;
    const sgstAmt = taxable * sgstPct / 100;
    const igstAmt = taxable * igstPct / 100;
    const amount = taxable + cgstAmt + sgstAmt + igstAmt;

    db.run(
        `UPDATE estimates SET
            invoice_date=?, invoice_number=?, bill_to=?, ship_to=?,
            item_name=?, quantity=?, hsn_code=?, rate=?, value_amount=?,
            discount_percent=?, discount_amount=?,
            cgst_percent=?, cgst_amount=?, sgst_percent=?, sgst_amount=?,
            igst_percent=?, igst_amount=?, amount=?, location=?, remarks=?
         WHERE id=?`,
        [
            b.invoice_date, b.invoice_number, b.bill_to, b.ship_to || null,
            b.item_name, qty, b.hsn_code || null, rate, taxable,
            discountPct, discountAmt,
            cgstPct, cgstAmt, sgstPct, sgstAmt,
            igstPct, igstAmt, amount,
            b.location || null, b.remarks || null,
            id
        ],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            if (!this.changes) return res.status(404).json({ error: 'Estimate not found' });
            res.json({ ok: true, id });
        }
    );
});

// DELETE estimate
app.delete('/api/estimates/:id', (req, res) => {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    db.run(`DELETE FROM estimates WHERE id=?`, [id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        if (!this.changes) return res.status(404).json({ error: 'Estimate not found' });
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
   API: STOCK TRANSFERS
   ============================================================ */
app.get('/api/stock-transfers', (req, res) => {
    const { date, category, from_location, to_location, search } = req.query;

    const where = [];
    const params = [];

    if (date) {
        if (!isValidDateString(date)) return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD.' });
        where.push('transfer_date = ?');
        params.push(date);
    }
    if (category && normalizeCategoryName(category)) {
        where.push('category = ?');
        params.push(normalizeCategoryName(category));
    }
    if (from_location && normalizeLocationName(from_location)) {
        where.push('from_location = ?');
        params.push(normalizeLocationName(from_location));
    }
    if (to_location && normalizeLocationName(to_location)) {
        where.push('to_location = ?');
        params.push(normalizeLocationName(to_location));
    }
    if (search && String(search).trim()) {
        const term = `%${String(search).trim()}%`;
        where.push('(category LIKE ? OR size LIKE ? OR from_location LIKE ? OR to_location LIKE ? OR remarks LIKE ?)');
        params.push(term, term, term, term, term);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    db.all(
        `SELECT id, transfer_date, category, size, from_location, to_location, quantity, remarks, created_at
         FROM stock_transfers ${whereSql}
         ORDER BY id DESC`,
        params,
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows || []);
        }
    );
});

app.post('/api/stock-transfers', (req, res) => {
    const b = req.body || {};
    const transferDate = String(b.transfer_date || '').trim();
    const category = normalizeCategoryName(b.category);
    const size = String(b.size || '').trim();
    const fromLocation = normalizeLocationName(b.from_location);
    const toLocation = normalizeLocationName(b.to_location);
    const quantity = Number(b.quantity);
    const remarks = b.remarks ? String(b.remarks).trim() : '';

    if (!isValidDateString(transferDate)) return res.status(400).json({ error: 'Invalid transfer_date format. Use YYYY-MM-DD.' });
    if (transferDate !== getTodayLocalISO()) return res.status(403).json({ error: 'Transfers can only be created for today.' });
    if (!category) return res.status(400).json({ error: 'Category is required.' });
    if (!size) return res.status(400).json({ error: 'Sub-Category is required.' });
    if (!isSupportedLocation(fromLocation)) return res.status(400).json({ error: 'Valid From Location is required.' });
    if (!isSupportedLocation(toLocation)) return res.status(400).json({ error: 'Valid To Location is required.' });
    if (fromLocation === toLocation) return res.status(400).json({ error: 'From and To locations must be different.' });
    if (!Number.isFinite(quantity) || quantity <= 0) return res.status(400).json({ error: 'Quantity must be a positive number.' });

    db.serialize(() => {
        db.run('BEGIN IMMEDIATE TRANSACTION');

        db.get(
            `SELECT id, stock_at_kpr FROM daily_stocks
             WHERE stock_date = ? AND location = ? AND category = ? AND size = ?`,
            [transferDate, fromLocation, category, size],
            (fromErr, fromRow) => {
                if (fromErr) { db.run('ROLLBACK'); return res.status(500).json({ error: fromErr.message }); }
                if (!fromRow) { db.run('ROLLBACK'); return res.status(400).json({ error: 'Source location has no stock recorded today for this category and sub-category.' }); }
                if (Number(fromRow.stock_at_kpr) < quantity) {
                    db.run('ROLLBACK');
                    return res.status(400).json({ error: `Source has only ${fromRow.stock_at_kpr} in stock; cannot transfer ${quantity}.` });
                }

                db.get(
                    `SELECT id, qty_for_1_cabin, qty_for_20_cabin, stock_at_kpr FROM daily_stocks
                     WHERE stock_date = ? AND location = ? AND category = ? AND size = ?`,
                    [transferDate, toLocation, category, size],
                    (toErr, toRow) => {
                        if (toErr) { db.run('ROLLBACK'); return res.status(500).json({ error: toErr.message }); }

                        const finalizeInsert = (destinationId) => {
                            db.run(
                                `UPDATE daily_stocks SET stock_at_kpr = stock_at_kpr - ? WHERE id = ?`,
                                [quantity, fromRow.id],
                                (u1Err) => {
                                    if (u1Err) { db.run('ROLLBACK'); return res.status(500).json({ error: u1Err.message }); }
                                    db.run(
                                        `UPDATE daily_stocks SET stock_at_kpr = stock_at_kpr + ? WHERE id = ?`,
                                        [quantity, destinationId],
                                        (u2Err) => {
                                            if (u2Err) { db.run('ROLLBACK'); return res.status(500).json({ error: u2Err.message }); }
                                            db.run(
                                                `INSERT INTO stock_transfers
                                                    (transfer_date, category, size, from_location, to_location, quantity, remarks)
                                                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                                                [transferDate, category, size, fromLocation, toLocation, quantity, remarks],
                                                function (insErr) {
                                                    if (insErr) { db.run('ROLLBACK'); return res.status(500).json({ error: insErr.message }); }
                                                    const transferId = this.lastID;
                                                    db.run('COMMIT', (commitErr) => {
                                                        if (commitErr) return res.status(500).json({ error: commitErr.message });
                                                        res.status(201).json({ id: transferId });
                                                    });
                                                }
                                            );
                                        }
                                    );
                                }
                            );
                        };

                        if (toRow) {
                            finalizeInsert(toRow.id);
                            return;
                        }

                        // Auto-create destination row with zero stock, then apply the transfer
                        db.run(
                            `INSERT INTO daily_stocks
                                (stock_date, location, category, size, qty_for_1_cabin, qty_for_20_cabin, stock_at_kpr)
                             VALUES (?, ?, ?, ?, 0, 0, 0)`,
                            [transferDate, toLocation, category, size],
                            function (createErr) {
                                if (createErr) { db.run('ROLLBACK'); return res.status(500).json({ error: createErr.message }); }
                                finalizeInsert(this.lastID);
                            }
                        );
                    }
                );
            }
        );
    });
});

app.put('/api/stock-transfers/:id', (req, res) => {
    const transferId = Number(req.params.id);
    if (!Number.isInteger(transferId) || transferId <= 0) return res.status(400).json({ error: 'Invalid transfer id.' });

    const b = req.body || {};
    const category = normalizeCategoryName(b.category);
    const size = String(b.size || '').trim();
    const fromLocation = normalizeLocationName(b.from_location);
    const toLocation = normalizeLocationName(b.to_location);
    const quantity = Number(b.quantity);
    const remarks = b.remarks ? String(b.remarks).trim() : '';

    if (!category) return res.status(400).json({ error: 'Category is required.' });
    if (!size) return res.status(400).json({ error: 'Sub-Category is required.' });
    if (!isSupportedLocation(fromLocation)) return res.status(400).json({ error: 'Valid From Location is required.' });
    if (!isSupportedLocation(toLocation)) return res.status(400).json({ error: 'Valid To Location is required.' });
    if (fromLocation === toLocation) return res.status(400).json({ error: 'From and To locations must be different.' });
    if (!Number.isFinite(quantity) || quantity <= 0) return res.status(400).json({ error: 'Quantity must be a positive number.' });

    db.serialize(() => {
        db.run('BEGIN IMMEDIATE TRANSACTION');

        db.get(`SELECT * FROM stock_transfers WHERE id = ?`, [transferId], (findErr, old) => {
            if (findErr) { db.run('ROLLBACK'); return res.status(500).json({ error: findErr.message }); }
            if (!old) { db.run('ROLLBACK'); return res.status(404).json({ error: 'Transfer not found.' }); }
            if (old.transfer_date !== getTodayLocalISO()) { db.run('ROLLBACK'); return res.status(403).json({ error: "Only today's transfers can be edited." }); }

            // Step 1: reverse old transfer
            db.get(
                `SELECT id, stock_at_kpr FROM daily_stocks
                 WHERE stock_date = ? AND location = ? AND category = ? AND size = ?`,
                [old.transfer_date, old.to_location, old.category, old.size],
                (destErr, destRow) => {
                    if (destErr) { db.run('ROLLBACK'); return res.status(500).json({ error: destErr.message }); }
                    if (!destRow || Number(destRow.stock_at_kpr) < Number(old.quantity)) {
                        db.run('ROLLBACK');
                        return res.status(400).json({ error: 'Cannot reverse original transfer: destination no longer has enough stock.' });
                    }
                    db.get(
                        `SELECT id, stock_at_kpr FROM daily_stocks
                         WHERE stock_date = ? AND location = ? AND category = ? AND size = ?`,
                        [old.transfer_date, old.from_location, old.category, old.size],
                        (srcErr, srcRow) => {
                            if (srcErr) { db.run('ROLLBACK'); return res.status(500).json({ error: srcErr.message }); }
                            if (!srcRow) { db.run('ROLLBACK'); return res.status(400).json({ error: 'Cannot reverse original transfer: source row is missing.' }); }

                            db.run(`UPDATE daily_stocks SET stock_at_kpr = stock_at_kpr - ? WHERE id = ?`,
                                [old.quantity, destRow.id], (u1Err) => {
                                    if (u1Err) { db.run('ROLLBACK'); return res.status(500).json({ error: u1Err.message }); }
                                    db.run(`UPDATE daily_stocks SET stock_at_kpr = stock_at_kpr + ? WHERE id = ?`,
                                        [old.quantity, srcRow.id], (u2Err) => {
                                            if (u2Err) { db.run('ROLLBACK'); return res.status(500).json({ error: u2Err.message }); }

                                            // Step 2: apply new values
                                            db.get(
                                                `SELECT id, stock_at_kpr FROM daily_stocks
                                                 WHERE stock_date = ? AND location = ? AND category = ? AND size = ?`,
                                                [old.transfer_date, fromLocation, category, size],
                                                (nSrcErr, nSrc) => {
                                                    if (nSrcErr) { db.run('ROLLBACK'); return res.status(500).json({ error: nSrcErr.message }); }
                                                    if (!nSrc) { db.run('ROLLBACK'); return res.status(400).json({ error: 'New source has no stock recorded today for this category and sub-category.' }); }
                                                    if (Number(nSrc.stock_at_kpr) < quantity) { db.run('ROLLBACK'); return res.status(400).json({ error: `New source has only ${nSrc.stock_at_kpr} in stock.` }); }

                                                    db.get(
                                                        `SELECT id FROM daily_stocks WHERE stock_date = ? AND location = ? AND category = ? AND size = ?`,
                                                        [old.transfer_date, toLocation, category, size],
                                                        (nDstErr, nDst) => {
                                                            if (nDstErr) { db.run('ROLLBACK'); return res.status(500).json({ error: nDstErr.message }); }

                                                            const applyNew = (destId) => {
                                                                db.run(`UPDATE daily_stocks SET stock_at_kpr = stock_at_kpr - ? WHERE id = ?`,
                                                                    [quantity, nSrc.id], (a1Err) => {
                                                                        if (a1Err) { db.run('ROLLBACK'); return res.status(500).json({ error: a1Err.message }); }
                                                                        db.run(`UPDATE daily_stocks SET stock_at_kpr = stock_at_kpr + ? WHERE id = ?`,
                                                                            [quantity, destId], (a2Err) => {
                                                                                if (a2Err) { db.run('ROLLBACK'); return res.status(500).json({ error: a2Err.message }); }
                                                                                db.run(
                                                                                    `UPDATE stock_transfers SET
                                                                                        category = ?, size = ?, from_location = ?, to_location = ?, quantity = ?, remarks = ?
                                                                                     WHERE id = ?`,
                                                                                    [category, size, fromLocation, toLocation, quantity, remarks, transferId],
                                                                                    (upErr) => {
                                                                                        if (upErr) { db.run('ROLLBACK'); return res.status(500).json({ error: upErr.message }); }
                                                                                        db.run('COMMIT', (cErr) => {
                                                                                            if (cErr) return res.status(500).json({ error: cErr.message });
                                                                                            res.json({ ok: true });
                                                                                        });
                                                                                    }
                                                                                );
                                                                            });
                                                                    });
                                                            };

                                                            if (nDst) return applyNew(nDst.id);

                                                            db.run(
                                                                `INSERT INTO daily_stocks (stock_date, location, category, size, qty_for_1_cabin, qty_for_20_cabin, stock_at_kpr)
                                                                 VALUES (?, ?, ?, ?, 0, 0, 0)`,
                                                                [old.transfer_date, toLocation, category, size],
                                                                function (cErr) {
                                                                    if (cErr) { db.run('ROLLBACK'); return res.status(500).json({ error: cErr.message }); }
                                                                    applyNew(this.lastID);
                                                                }
                                                            );
                                                        }
                                                    );
                                                }
                                            );
                                        });
                                });
                        }
                    );
                }
            );
        });
    });
});

app.delete('/api/stock-transfers/:id', (req, res) => {
    const transferId = Number(req.params.id);
    if (!Number.isInteger(transferId) || transferId <= 0) return res.status(400).json({ error: 'Invalid transfer id.' });

    db.serialize(() => {
        db.run('BEGIN IMMEDIATE TRANSACTION');

        db.get(`SELECT * FROM stock_transfers WHERE id = ?`, [transferId], (findErr, old) => {
            if (findErr) { db.run('ROLLBACK'); return res.status(500).json({ error: findErr.message }); }
            if (!old) { db.run('ROLLBACK'); return res.status(404).json({ error: 'Transfer not found.' }); }
            if (old.transfer_date !== getTodayLocalISO()) { db.run('ROLLBACK'); return res.status(403).json({ error: "Only today's transfers can be deleted." }); }

            db.get(
                `SELECT id, stock_at_kpr FROM daily_stocks
                 WHERE stock_date = ? AND location = ? AND category = ? AND size = ?`,
                [old.transfer_date, old.to_location, old.category, old.size],
                (destErr, destRow) => {
                    if (destErr) { db.run('ROLLBACK'); return res.status(500).json({ error: destErr.message }); }
                    if (!destRow || Number(destRow.stock_at_kpr) < Number(old.quantity)) {
                        db.run('ROLLBACK');
                        return res.status(400).json({ error: 'Cannot reverse transfer: destination has less stock than the transfer quantity.' });
                    }

                    db.get(
                        `SELECT id FROM daily_stocks
                         WHERE stock_date = ? AND location = ? AND category = ? AND size = ?`,
                        [old.transfer_date, old.from_location, old.category, old.size],
                        (srcErr, srcRow) => {
                            if (srcErr) { db.run('ROLLBACK'); return res.status(500).json({ error: srcErr.message }); }
                            if (!srcRow) { db.run('ROLLBACK'); return res.status(400).json({ error: 'Cannot reverse transfer: source row is missing.' }); }

                            db.run(`UPDATE daily_stocks SET stock_at_kpr = stock_at_kpr - ? WHERE id = ?`,
                                [old.quantity, destRow.id], (u1Err) => {
                                    if (u1Err) { db.run('ROLLBACK'); return res.status(500).json({ error: u1Err.message }); }
                                    db.run(`UPDATE daily_stocks SET stock_at_kpr = stock_at_kpr + ? WHERE id = ?`,
                                        [old.quantity, srcRow.id], (u2Err) => {
                                            if (u2Err) { db.run('ROLLBACK'); return res.status(500).json({ error: u2Err.message }); }
                                            db.run(`DELETE FROM stock_transfers WHERE id = ?`, [transferId], (dErr) => {
                                                if (dErr) { db.run('ROLLBACK'); return res.status(500).json({ error: dErr.message }); }
                                                db.run('COMMIT', (cErr) => {
                                                    if (cErr) return res.status(500).json({ error: cErr.message });
                                                    res.json({ ok: true });
                                                });
                                            });
                                        });
                                });
                        }
                    );
                }
            );
        });
    });
});

/* ============================================================
   API: SHARE WITH CA
============================================================ */

// Whitelisted document types the UI is allowed to send.
const CA_ALLOWED_DOC_TYPES = new Set([
    'GSTR1', 'GSTR2', 'INVOICES', 'RETURNS', 'LEDGER'
]);

// Build a CSV of the requested document types.
// Returns { csv, rows } where rows is the raw data (for JSON/ZIP use).
function buildCaDocumentData(docTypes, startDate, endDate, cb) {
    // We fetch each dataset lazily and merge into one object.
    const result = {
        start: startDate,
        end: endDate,
        types: docTypes,
        generatedAt: new Date().toISOString(),
        data: {}
    };

    const tasks = [];

    // ---- GSTR-1 style: Sales (transaction_type = 'Sale') ----
    if (docTypes.includes('GSTR1')) {
        tasks.push(new Promise((resolve, reject) => {
            db.all(
                `SELECT invoice_date, invoice_number, bill_to, item_name,
                        quantity, hsn_code, rate, value_amount,
                        cgst_percent, cgst_amount, sgst_percent, sgst_amount,
                        igst_percent, igst_amount, amount, location
                 FROM purchase_sales
                 WHERE transaction_type = 'Sale'
                   AND invoice_date >= ? AND invoice_date <= ?
                 ORDER BY invoice_date ASC, id ASC`,
                [startDate, endDate],
                (err, rows) => err ? reject(err) : (result.data.GSTR1 = rows || [], resolve())
            );
        }));
    }

    // ---- GSTR-2 style: Purchases (transaction_type = 'Purchase') ----
    if (docTypes.includes('GSTR2')) {
        tasks.push(new Promise((resolve, reject) => {
            db.all(
                `SELECT invoice_date, invoice_number, bill_to, item_name,
                        quantity, hsn_code, rate, value_amount,
                        cgst_percent, cgst_amount, sgst_percent, sgst_amount,
                        igst_percent, igst_amount, amount, location
                 FROM purchase_sales
                 WHERE transaction_type = 'Purchase'
                   AND invoice_date >= ? AND invoice_date <= ?
                 ORDER BY invoice_date ASC, id ASC`,
                [startDate, endDate],
                (err, rows) => err ? reject(err) : (result.data.GSTR2 = rows || [], resolve())
            );
        }));
    }

    // ---- Sales invoices (same as GSTR1 but distinct label for the UI) ----
    if (docTypes.includes('INVOICES')) {
        tasks.push(new Promise((resolve, reject) => {
            db.all(
                `SELECT invoice_date, invoice_number, bill_to, ship_to,
                        item_name, quantity, hsn_code, rate, value_amount,
                        cgst_amount, sgst_amount, igst_amount, amount,
                        delivery, dc_number, ewaybill, location
                 FROM purchase_sales
                 WHERE transaction_type = 'Sale'
                   AND invoice_date >= ? AND invoice_date <= ?
                 ORDER BY invoice_date ASC, id ASC`,
                [startDate, endDate],
                (err, rows) => err ? reject(err) : (result.data.INVOICES = rows || [], resolve())
            );
        }));
    }

    // ---- Credit / Debit notes: placeholders (your DB has no separate table yet) ----
    if (docTypes.includes('RETURNS')) {
        result.data.RETURNS = [];  // ready for when a returns table is added
    }

    // ---- Customer ledgers: aggregate Sale minus received per party ----
    if (docTypes.includes('LEDGER')) {
        tasks.push(new Promise((resolve, reject) => {
            db.all(
                `SELECT bill_to AS party,
                        COALESCE(SUM(CASE WHEN transaction_type = 'Sale' THEN amount ELSE 0 END), 0) AS total_sale,
                        COALESCE(SUM(CASE WHEN transaction_type = 'Purchase' THEN amount ELSE 0 END), 0) AS total_purchase
                 FROM purchase_sales
                 WHERE invoice_date >= ? AND invoice_date <= ?
                 GROUP BY bill_to
                 ORDER BY bill_to COLLATE NOCASE ASC`,
                [startDate, endDate],
                (err, rows) => err ? reject(err) : (result.data.LEDGER = rows || [], resolve())
            );
        }));
    }

    Promise.all(tasks)
        .then(() => cb(null, result))
        .catch((err) => cb(err));
}

// Convert the fetched CA data object into a flat CSV string (single file).
function buildCaCsv(caData) {
    const lines = [];
    const push = (s) => lines.push(s);

    push(`InventorySystem2 — CA Share Package`);
    push(`Period,${caData.start},${caData.end}`);
    push(`Generated At,${caData.generatedAt}`);
    push(`Document Types,${caData.types.join('|')}`);
    push('');

    Object.keys(caData.data).forEach((key) => {
        const rows = caData.data[key];
        push(`# ===== ${key} (${rows.length} rows) =====`);
        if (!rows.length) {
            push('(no rows)');
            push('');
            return;
        }
        const headers = Object.keys(rows[0]);
        push(headers.join(','));
        rows.forEach((row) => {
            push(headers.map((h) => {
                const v = row[h];
                if (v === null || v === undefined) return '';
                const s = String(v).replace(/"/g, '""');
                return /[",\n]/.test(s) ? `"${s}"` : s;
            }).join(','));
        });
        push('');
    });

    return lines.join('\n');
}

// Helper: read JSON body list of document types into a validated array.
function readCaDocTypes(raw) {
    if (!Array.isArray(raw)) return [];
    return raw
        .map((v) => String(v || '').trim().toUpperCase())
        .filter((v) => CA_ALLOWED_DOC_TYPES.has(v));
}

// Helper: insert a ca_share_logs row.
function logCaShare({ businessId = 1, caContactId = null, shareType, start, end, docTypes, status, errorMessage = null }, cb) {
    db.run(
        `INSERT INTO ca_share_logs
            (business_id, ca_contact_id, share_type, date_start, date_end,
             document_types, status, error_message)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [businessId, caContactId, shareType, start, end, JSON.stringify(docTypes), status, errorMessage],
        function (err) {
            if (cb) cb(err, this ? this.lastID : null);
        }
    );
}

/* ---------- GET /api/ca/config ---------- */
app.get('/api/ca/config', requireAuth, (req, res) => {
    db.get(
        `SELECT id, ca_name, ca_email, ca_phone, ca_firm_reg, auto_share_reminder, updated_at
         FROM ca_contacts WHERE business_id = 1`,
        [],
        (err, row) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!row) return res.json(null);

            res.json({
                id: row.id,
                caName: row.ca_name,
                caEmail: row.ca_email || '',
                caPhone: row.ca_phone || '',
                caFirm: row.ca_firm_reg || '',
                autoShareReminder: !!row.auto_share_reminder,
                updatedAt: row.updated_at
            });
        }
    );
});

/* ---------- POST /api/ca/config ---------- */
app.post('/api/ca/config', requireAuth, (req, res) => {
    const b = req.body || {};
    const caName = String(b.caName || '').trim();
    const caEmail = String(b.caEmail || '').trim();
    const caPhone = String(b.caPhone || '').trim();
    const caFirm = String(b.caFirm || '').trim();
    const autoShare = b.autoShareReminder ? 1 : 0;

    if (!caName) return res.status(400).json({ error: 'CA Name is required.' });
    if (caEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(caEmail)) {
        return res.status(400).json({ error: 'CA Email is not a valid email address.' });
    }

    db.get(`SELECT id FROM ca_contacts WHERE business_id = 1`, [], (findErr, existing) => {
        if (findErr) return res.status(500).json({ error: findErr.message });

        if (existing) {
            db.run(
                `UPDATE ca_contacts
                 SET ca_name = ?, ca_email = ?, ca_phone = ?, ca_firm_reg = ?,
                     auto_share_reminder = ?, updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?`,
                [caName, caEmail, caPhone, caFirm, autoShare, existing.id],
                function (upErr) {
                    if (upErr) return res.status(500).json({ error: upErr.message });
                    res.json({ ok: true, id: existing.id, action: 'updated' });
                }
            );
            return;
        }

        db.run(
            `INSERT INTO ca_contacts
                (business_id, ca_name, ca_email, ca_phone, ca_firm_reg, auto_share_reminder)
             VALUES (1, ?, ?, ?, ?, ?)`,
            [caName, caEmail, caPhone, caFirm, autoShare],
            function (insErr) {
                if (insErr) return res.status(500).json({ error: insErr.message });
                res.json({ ok: true, id: this.lastID, action: 'inserted' });
            }
        );
    });
});

/* ---------- POST /api/ca/share/email ---------- */
app.post('/api/ca/share/email', requireAuth, (req, res) => {
    const b = req.body || {};
    const start = String(b.start || '').trim();
    const end = String(b.end || '').trim();
    const docTypes = readCaDocTypes(b.docs);
    const caEmail = String(b.caEmail || '').trim();
    const caName = String(b.caName || '').trim();

    if (!isValidDateString(start) || !isValidDateString(end)) {
        return res.status(400).json({ error: 'Invalid date range.' });
    }
    if (start > end) return res.status(400).json({ error: 'Start date must be before end date.' });
    if (!docTypes.length) return res.status(400).json({ error: 'Select at least one document type.' });
    if (!caEmail) return res.status(400).json({ error: 'CA Email is required.' });

    buildCaDocumentData(docTypes, start, end, (err, caData) => {
        if (err) {
            logCaShare({ shareType: 'email', start, end, docTypes, status: 'failed', errorMessage: err.message });
            return res.status(500).json({ error: err.message });
        }

        const csv = buildCaCsv(caData);

        // --- Replace this block with your real email sender (nodemailer, SES, etc.) ---
        // For now, we log and return success so the UI flow is fully testable.
        console.log(`📧 [CA SHARE] Would email ${caEmail} (${caName || 'CA'}) — ${docTypes.length} docs, ${csv.length} bytes CSV`);

        logCaShare({
            shareType: 'email',
            start, end, docTypes,
            status: 'sent'
        }, (logErr) => {
            if (logErr) console.error('[ca_share_logs] email', logErr.message);
            res.json({
                ok: true,
                to: caEmail,
                documents: docTypes,
                sizeBytes: csv.length,
                message: 'Package prepared. Wire up your SMTP provider in the marked block to actually send.'
            });
        });
    });
});

/* ---------- POST /api/ca/share/whatsapp ---------- */
app.post('/api/ca/share/whatsapp', requireAuth, (req, res) => {
    const b = req.body || {};
    const start = String(b.start || '').trim();
    const end = String(b.end || '').trim();
    const docTypes = readCaDocTypes(b.docs);
    const caPhone = String(b.caPhone || '').replace(/\D/g, '');
    const caName = String(b.caName || '').trim();

    if (!isValidDateString(start) || !isValidDateString(end)) {
        return res.status(400).json({ error: 'Invalid date range.' });
    }
    if (start > end) return res.status(400).json({ error: 'Start date must be before end date.' });
    if (!docTypes.length) return res.status(400).json({ error: 'Select at least one document type.' });
    if (caPhone.length < 10) return res.status(400).json({ error: 'CA WhatsApp number is required (10 digits min).' });

    // wa.me deep link — user clicks and WhatsApp opens with a pre-filled message.
    // In a production setup you'd host the ZIP somewhere and include the link.
    const message = encodeURIComponent(
        `Hello ${caName || 'CA'}, please find the requested reports for ${start} to ${end}. ` +
        `Documents included: ${docTypes.join(', ')}. — Sent from InventorySystem2`
    );
    const phoneWithCountry = caPhone.length === 10 ? `91${caPhone}` : caPhone;
    const link = `https://wa.me/${phoneWithCountry}?text=${message}`;

    logCaShare({
        shareType: 'whatsapp',
        start, end, docTypes,
        status: 'sent'
    }, (logErr) => {
        if (logErr) console.error('[ca_share_logs] whatsapp', logErr.message);
        res.json({ ok: true, link, phone: phoneWithCountry, documents: docTypes });
    });
});

/* ---------- POST /api/ca/share/zip ---------- */
app.post('/api/ca/share/zip', requireAuth, (req, res) => {
    const b = req.body || {};
    const start = String(b.start || '').trim();
    const end = String(b.end || '').trim();
    const allowedReports = {
        SALE: {
            transactionType: 'Sale',
            filename: 'Sale_Report.csv',
            columns: ['invoice_date', 'invoice_number', 'bill_to', 'ship_to', 'item_name', 'quantity', 'hsn_code', 'rate', 'value_amount', 'amount', 'delivery', 'dc_number', 'ewaybill', 'location']
        },
        PURCHASE: {
            transactionType: 'Purchase',
            filename: 'Purchase_Report.csv',
            columns: ['invoice_date', 'invoice_number', 'bill_to', 'ship_to', 'item_name', 'quantity', 'hsn_code', 'rate', 'value_amount', 'amount', 'delivery', 'dc_number', 'ewaybill', 'location']
        },
        SALE_GST: {
            transactionType: 'Sale',
            filename: 'Sale_Report_with_GST.csv',
            columns: ['invoice_date', 'invoice_number', 'bill_to', 'ship_to', 'item_name', 'quantity', 'hsn_code', 'rate', 'value_amount', 'cgst_percent', 'cgst_amount', 'sgst_percent', 'sgst_amount', 'igst_percent', 'igst_amount', 'amount', 'location']
        },
        PURCHASE_GST: {
            transactionType: 'Purchase',
            filename: 'Purchase_Report_with_GST.csv',
            columns: ['invoice_date', 'invoice_number', 'bill_to', 'ship_to', 'item_name', 'quantity', 'hsn_code', 'rate', 'value_amount', 'cgst_percent', 'cgst_amount', 'sgst_percent', 'sgst_amount', 'igst_percent', 'igst_amount', 'amount', 'location']
        }
    };
    const docTypes = Array.isArray(b.docs)
        ? [...new Set(b.docs.map((value) => String(value || '').trim().toUpperCase()))]
            .filter((value) => Object.prototype.hasOwnProperty.call(allowedReports, value))
        : [];
    const locations = Array.isArray(b.locations)
        ? [...new Set(b.locations.map(normalizeLocationName).filter(isSupportedLocation))]
        : [];

    if (!isValidDateString(start) || !isValidDateString(end)) {
        return res.status(400).json({ error: 'Invalid date range.' });
    }
    if (start > end) return res.status(400).json({ error: 'Start date must be before end date.' });
    if (!docTypes.length) return res.status(400).json({ error: 'Select at least one report.' });
    if (!locations.length) return res.status(400).json({ error: 'Select at least one valid location.' });

    const selectedReports = docTypes.map((type) => allowedReports[type]);
    const transactionTypes = [...new Set(selectedReports.map((report) => report.transactionType))];
    const locationPlaceholders = locations.map(() => '?').join(', ');
    const reportColumns = [...new Set(selectedReports.flatMap((report) => report.columns))];
    const columnsSql = reportColumns.map((column) => `"${column}"`).join(', ');
    const queryTasks = transactionTypes.map((transactionType) => new Promise((resolve, reject) => {
        db.all(
            `SELECT ${columnsSql} FROM purchase_sales
             WHERE transaction_type = ? AND invoice_date >= ? AND invoice_date <= ?
                    AND LOWER(location) IN (${locationPlaceholders})
             ORDER BY invoice_date ASC, id ASC`,
                [transactionType, start, end, ...locations.map((location) => location.toLowerCase())],
            (err, rows) => err ? reject(err) : resolve([transactionType, rows || []])
        );
    }));

    Promise.all(queryTasks).then((resultSets) => {
        const rowsByType = Object.fromEntries(resultSets);
        const csvCell = (value) => {
            const text = value == null ? '' : String(value);
            return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
        };
        const archive = archiver('zip', { zlib: { level: 9 } });
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="CA_Reports_${start}_to_${end}.zip"`);
        archive.on('error', (err) => {
            console.error('[ca_share] ZIP creation failed', err);
            if (!res.headersSent) res.status(500).json({ error: 'Unable to create report ZIP.' });
            else res.destroy(err);
        });
        archive.pipe(res);

        selectedReports.forEach((report) => {
            const rows = rowsByType[report.transactionType] || [];
            const csv = [report.columns.join(','), ...rows.map((row) => report.columns.map((column) => csvCell(row[column])).join(','))].join('\r\n');
            archive.append(`\uFEFF${csv}`, { name: report.filename });
        });
        archive.finalize();

        res.on('finish', () => {
            logCaShare({ shareType: 'zip', start, end, docTypes, status: 'sent' }, (logErr) => {
                if (logErr) console.error('[ca_share_logs] zip', logErr.message);
            });
        });
    }).catch((err) => {
        console.error('[ca_share] report query failed', err);
        logCaShare({ shareType: 'zip', start, end, docTypes, status: 'failed', errorMessage: err.message });
        if (!res.headersSent) res.status(500).json({ error: 'Unable to load report data.' });
    });
});

/* ============================================================
   API: SETTINGS — BACKUP & RESTORE
============================================================ */

const DB_PATH          = path.join(__dirname, 'database.sqlite');
const AUTO_BACKUP_DIR  = path.join(__dirname, 'auto-backups');
const BACKUP_CONFIG    = path.join(__dirname, 'backup-config.json');

// Ensure the auto-backup folder exists
if (!fs.existsSync(AUTO_BACKUP_DIR)) fs.mkdirSync(AUTO_BACKUP_DIR, { recursive: true });

// In-memory scheduler handle
let autoBackupTimer = null;

/* ---------- Config helpers ---------- */
function readBackupConfig() {
  try {
    if (!fs.existsSync(BACKUP_CONFIG)) return null;
    const raw = fs.readFileSync(BACKUP_CONFIG, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch (_e) { return null; }
}
function writeBackupConfig(cfg) {
  try {
    fs.writeFileSync(BACKUP_CONFIG, JSON.stringify(cfg, null, 2), 'utf8');
  } catch (e) {
    console.error('[backup] writeBackupConfig failed:', e.message);
  }
}

/* ---------- Timestamp helper ---------- */
function backupStamp(d = new Date()) {
  const pad = (v) => String(v).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

/* ---------- Safe DB copy (SQLite) ---------- */
function copyDbTo(targetPath) {
  // fs.copyFileSync is safe for SQLite when no write transaction is in flight.
  // For extra safety we run a quick WAL checkpoint first.
  return new Promise((resolve, reject) => {
    try {
      db.run('PRAGMA wal_checkpoint(FULL);', (err) => {
        if (err) { /* non-fatal — continue */ }
        try {
          fs.copyFileSync(DB_PATH, targetPath);
          // Also copy the WAL/SHM files if they exist, so the copy is consistent.
          const wal = `${DB_PATH}-wal`;
          const shm = `${DB_PATH}-shm`;
          if (fs.existsSync(wal)) try { fs.copyFileSync(wal, `${targetPath}-wal`); } catch (_e) {}
          if (fs.existsSync(shm)) try { fs.copyFileSync(shm, `${targetPath}-shm`); } catch (_e) {}
          resolve();
        } catch (copyErr) {
          reject(copyErr);
        }
      });
    } catch (e) {
      reject(e);
    }
  });
}

/* ---------- Prune old auto backups ---------- */
function pruneAutoBackups(folder, keep) {
  try {
    if (!fs.existsSync(folder)) return;
    const files = fs.readdirSync(folder)
      .filter((f) => /^inventorysystem2_auto_.*\.sqlite$/i.test(f))
      .map((f) => ({ name: f, path: path.join(folder, f), mtime: fs.statSync(path.join(folder, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime); // newest first
    const excess = files.slice(keep);
    excess.forEach((f) => {
      try { fs.unlinkSync(f.path); } catch (_e) {}
      try { fs.unlinkSync(`${f.path}-wal`); } catch (_e) {}
      try { fs.unlinkSync(`${f.path}-shm`); } catch (_e) {}
    });
  } catch (e) {
    console.error('[backup] pruneAutoBackups failed:', e.message);
  }
}

/* ---------- Run auto backup ---------- */
async function runAutoBackup(reason = 'manual') {
  const cfg = readBackupConfig() || {};
  if (reason !== 'manual' && !cfg.enabled) return { skipped: true };

  const folder = (cfg.folder && String(cfg.folder).trim()) || AUTO_BACKUP_DIR;
  try {
    if (!fs.existsSync(folder)) {
      fs.mkdirSync(folder, { recursive: true });
    }
  } catch (e) {
    throw new Error(`Cannot create backup folder: ${e.message}`);
  }

  const filename = `inventorysystem2_auto_${backupStamp()}.sqlite`;
  const target = path.join(folder, filename);
  await copyDbTo(target);

  // Update lastSaved timestamp in config
  const nextCfg = { ...cfg, lastSaved: new Date().toISOString() };
  writeBackupConfig(nextCfg);

  // Enforce the keep limit
  const keep = Math.max(1, Math.min(100, Number(cfg.keep) || 7));
  pruneAutoBackups(folder, keep);

  return { ok: true, file: target, lastSaved: nextCfg.lastSaved };
}

/* ---------- Scheduler ---------- */
function scheduleAutoBackup() {
  if (autoBackupTimer) { clearTimeout(autoBackupTimer); autoBackupTimer = null; }

  const cfg = readBackupConfig();
  if (!cfg || !cfg.enabled) return;

  const freq = String(cfg.frequency || 'daily');
  const [hh, mm] = String(cfg.time || '23:00').split(':').map((v) => parseInt(v, 10) || 0);

  function nextDelayMs() {
    const now = new Date();
    if (freq === 'hourly') {
      const next = new Date(now);
      next.setMinutes(mm, 0, 0);
      if (next <= now) next.setHours(next.getHours() + 1);
      return next - now;
    }
    if (freq === 'every6hours' || freq === 'every12hours') {
      const stepHours = freq === 'every6hours' ? 6 : 12;
      // Run at the given minute, every stepHours starting at hour 0
      const next = new Date(now);
      next.setMinutes(mm, 0, 0);
      next.setHours(Math.ceil(now.getHours() / stepHours) * stepHours);
      if (next <= now) next.setHours(next.getHours() + stepHours);
      return next - now;
    }
    // Default: daily at hh:mm
    const next = new Date(now);
    next.setHours(hh, mm, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    return next - now;
  }

  const delay = Math.max(1000, nextDelayMs());
  autoBackupTimer = setTimeout(async () => {
    try {
      await runAutoBackup('scheduled');
      console.log('[backup] scheduled backup completed');
    } catch (e) {
      console.error('[backup] scheduled backup failed:', e.message);
    } finally {
      scheduleAutoBackup(); // re-arm
    }
  }, delay);

  console.log(`[backup] next auto backup in ${Math.round(delay / 1000)}s (${freq} @ ${cfg.time})`);
}

// Start the scheduler on boot (if config exists and is enabled)
setTimeout(() => { try { scheduleAutoBackup(); } catch (_e) {} }, 500);

/* ---------- GET /api/backup/download ---------- */
app.get('/api/backup/download', requireAuth, async (req, res) => {
  try {
    // Copy to a temp file so the download is consistent even if writes happen
    const tmp = path.join(__dirname, `tmp-backup-${Date.now()}.sqlite`);
    await copyDbTo(tmp);
    const filename = `inventorysystem2-backup-${backupStamp()}.sqlite`;

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const stream = fs.createReadStream(tmp);
    stream.on('error', (err) => {
      console.error('[backup] download stream error:', err.message);
      try { fs.unlinkSync(tmp); } catch (_e) {}
      if (!res.headersSent) res.status(500).end();
    });
    stream.on('close', () => {
      try { fs.unlinkSync(tmp); } catch (_e) {}
      try { fs.unlinkSync(`${tmp}-wal`); } catch (_e) {}
      try { fs.unlinkSync(`${tmp}-shm`); } catch (_e) {}
    });
    stream.pipe(res);
  } catch (err) {
    console.error('[backup] download failed:', err.message);
    res.status(500).json({ error: `Unable to prepare backup: ${err.message}` });
  }
});

/* ---------- GET /api/backup/auto-config ---------- */
app.get('/api/backup/auto-config', requireAuth, (req, res) => {
  const cfg = readBackupConfig() || {
    enabled: false,
    folder: '',
    frequency: 'daily',
    time: '23:00',
    keep: 7,
    lastSaved: null
  };
  res.json({
    enabled:   !!cfg.enabled,
    folder:    cfg.folder || '',
    frequency: cfg.frequency || 'daily',
    time:      cfg.time || '23:00',
    keep:      Number(cfg.keep) || 7,
    lastSaved: cfg.lastSaved || null
  });
});

/* ---------- POST /api/backup/auto-config ---------- */
app.post('/api/backup/auto-config', requireAuth, (req, res) => {
  const b = req.body || {};
  const prev = readBackupConfig() || {};
  const next = {
    ...prev,
    enabled:   !!b.enabled,
    folder:    String(b.folder || '').trim(),
    frequency: String(b.frequency || 'daily'),
    time:      String(b.time || '23:00'),
    keep:      Math.max(1, Math.min(100, Number(b.keep) || 7)),
    lastSaved: prev.lastSaved || null
  };
  writeBackupConfig(next);
  // Re-arm the scheduler with the new settings
  scheduleAutoBackup();
  res.json({ ok: true, config: next });
});

/* ---------- POST /api/backup/auto-now ---------- */
app.post('/api/backup/auto-now', requireAuth, async (req, res) => {
  try {
    const result = await runAutoBackup('manual');
    res.json({
      ok: true,
      file: result.file,
      lastSaved: result.lastSaved,
      message: 'Backup saved to folder.'
    });
  } catch (err) {
    console.error('[backup] manual failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ---------- POST /api/backup/restore ---------- */
app.post('/api/backup/restore', requireAuth, restoreUpload.single('backup'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No backup file uploaded.' });

  const uploadedPath = req.file.path;

  // Sanity-check the uploaded file is a valid SQLite database.
  // SQLite files start with the 16-byte magic string "SQLite format 3\0".
  try {
    const fd = fs.openSync(uploadedPath, 'r');
    const header = Buffer.alloc(16);
    fs.readSync(fd, header, 0, 16, 0);
    fs.closeSync(fd);
    const magic = header.toString('utf8');
    if (!magic.startsWith('SQLite format 3')) {
      try { fs.unlinkSync(uploadedPath); } catch (_e) {}
      return res.status(400).json({ error: 'Uploaded file is not a valid SQLite database.' });
    }
  } catch (e) {
    try { fs.unlinkSync(uploadedPath); } catch (_e) {}
    return res.status(400).json({ error: `Unable to inspect uploaded file: ${e.message}` });
  }

  // Take a safety snapshot of the current DB before overwriting.
  const safetyPath = path.join(__dirname, `pre-restore-safety-${backupStamp()}.sqlite`);
  try {
    await copyDbTo(safetyPath);
  } catch (e) {
    try { fs.unlinkSync(uploadedPath); } catch (_e) {}
    return res.status(500).json({ error: `Unable to create safety snapshot: ${e.message}` });
  }

  // Close current DB, replace, and reopen.
  db.close((closeErr) => {
    if (closeErr) {
      console.error('[backup] db.close failed:', closeErr.message);
    }

    try {
      // Replace main DB file
      fs.copyFileSync(uploadedPath, DB_PATH);
      // Remove stale WAL/SHM from the old DB so the new file is used cleanly
      try { fs.unlinkSync(`${DB_PATH}-wal`); } catch (_e) {}
      try { fs.unlinkSync(`${DB_PATH}-shm`); } catch (_e) {}

      // Clean up the uploaded temp file
      try { fs.unlinkSync(uploadedPath); } catch (_e) {}

      // Reopen the DB (the module-level `db` is const, so we re-point the global
      // by requiring a fresh instance — for simplicity we just reopen in place.)
      // Note: sqlite3 Database#open is available; we use it to reopen the same handle.
      db = new sqlite3.Database(DB_PATH, (openErr) => {
        if (openErr) {
          console.error('[backup] db reopen failed:', openErr.message);
          return res.status(500).json({ error: `Restore succeeded but DB reopen failed: ${openErr.message}. Restart the server.` });
        }
        console.log('[backup] DB restored and reopened.');
        res.json({
          ok: true,
          message: 'Restore complete. Reloading…',
          safetySnapshot: safetyPath
        });
      });
    } catch (err) {
      console.error('[backup] restore failed:', err.message);
      // Try to reopen the original DB so the app keeps working
      try {
        db = new sqlite3.Database(DB_PATH, () => {});
      } catch (_e) {}
      res.status(500).json({ error: `Restore failed: ${err.message}` });
    }
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

/* =========================================================
   Dashboard — Business Overview trend (current month)
   GET /api/dashboard-trend?location=...
   Returns: [{ date, sale, purchase }, ...]
   ========================================================= */
app.get('/api/dashboard-trend', (req, res) => {
    try {
        const location = req.query.location && String(req.query.location).trim()
            ? String(req.query.location).trim().toLowerCase()
            : '';

        const now = new Date();
        const y = now.getFullYear();
        const m = now.getMonth();
        const pad = (v) => String(v).padStart(2, '0');
        const startISO = `${y}-${pad(m + 1)}-01`;
        const tomorrow = new Date(y, m, now.getDate() + 1);
        const endISO = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}`;

        const where = [`invoice_date >= ?`, `invoice_date < ?`];
        const params = [startISO, endISO];
        if (location) {
            where.push('LOWER(location) = ?');
            params.push(location);
        }

        const sql = `
            SELECT
                invoice_date AS date,
                COALESCE(SUM(CASE WHEN transaction_type = 'Sale'     THEN amount ELSE 0 END), 0) AS sale,
                COALESCE(SUM(CASE WHEN transaction_type = 'Purchase' THEN amount ELSE 0 END), 0) AS purchase
            FROM purchase_sales
            WHERE ${where.join(' AND ')}
            GROUP BY invoice_date
            ORDER BY invoice_date ASC
        `;

        db.all(sql, params, (err, rows) => {
            if (err) {
                console.error('[dashboard-trend]', err);
                return res.status(500).json({ error: err.message });
            }
            res.json(rows || []);
        });
    } catch (err) {
        console.error('[dashboard-trend]', err);
        res.status(500).json({ error: 'Failed to load trend data' });
    }
});

/* =========================================================
   Dashboard — Top Selling Products (current month, Sale only)
   GET /api/top-selling?location=...
   Returns: [{ item_name, amount }, ...]
   ========================================================= */
app.get('/api/top-selling', (req, res) => {
    try {
        const location = req.query.location && String(req.query.location).trim()
            ? String(req.query.location).trim().toLowerCase()
            : '';

        const now = new Date();
        const y = now.getFullYear();
        const m = now.getMonth();
        const pad = (v) => String(v).padStart(2, '0');
        const startISO = `${y}-${pad(m + 1)}-01`;
        const nextMonth = new Date(y, m + 1, 1);
        const endISO = `${nextMonth.getFullYear()}-${pad(nextMonth.getMonth() + 1)}-01`;

        const where = [`transaction_type = 'Sale'`, `invoice_date >= ?`, `invoice_date < ?`];
        const params = [startISO, endISO];
        if (location) {
            where.push('LOWER(location) = ?');
            params.push(location);
        }

        const sql = `
            SELECT item_name, COALESCE(SUM(amount), 0) AS amount
            FROM purchase_sales
            WHERE ${where.join(' AND ')}
            GROUP BY item_name
            ORDER BY amount DESC
            LIMIT 5
        `;

        db.all(sql, params, (err, rows) => {
            if (err) {
                console.error('[top-selling]', err);
                return res.status(500).json({ error: err.message });
            }
            res.json(rows || []);
        });
    } catch (err) {
        console.error('[top-selling]', err);
        res.status(500).json({ error: 'Failed to load top selling data' });
    }
});

/* =========================================================
   Dashboard — Low Stock Alerts (today's data, < 15)
   GET /api/dashboard-low-stock?location=...
   Returns: [{ size, category, location, stock_at_kpr }, ...]
   ========================================================= */
app.get('/api/dashboard-low-stock', (req, res) => {
    try {
        const location = req.query.location && String(req.query.location).trim()
            ? String(req.query.location).trim()
            : '';
        const today = getTodayLocalISO();
        const THRESHOLD = 15;

        const where = [`stock_date = ?`, `stock_at_kpr < ?`];
        const params = [today, THRESHOLD];
        if (location) {
            where.push('LOWER(location) = ?');
            params.push(location.toLowerCase());
        }

        const sql = `
            SELECT id, size, category, location, stock_at_kpr
            FROM daily_stocks
            WHERE ${where.join(' AND ')}
            ORDER BY stock_at_kpr ASC, size COLLATE NOCASE ASC
            LIMIT 4
        `;

        db.all(sql, params, (err, rows) => {
            if (err) {
                console.error('[dashboard-low-stock]', err);
                return res.status(500).json({ error: err.message });
            }
            res.json(rows || []);
        });
    } catch (err) {
        console.error('[dashboard-low-stock]', err);
        res.status(500).json({ error: 'Failed to load low stock data' });
    }
});

/* =========================================================
   Dashboard — Monthly stats (current month)
   GET /api/dashboard-monthly-stats?location=...
   Returns: { total_sale, outstanding, total_purchase, balance_payable }
   ========================================================= */
app.get('/api/dashboard-monthly-stats', (req, res) => {
    try {
        const location = req.query.location && String(req.query.location).trim()
            ? String(req.query.location).trim().toLowerCase()
            : '';

        const now = new Date();
        const y = now.getFullYear();
        const m = now.getMonth();
        const pad = (v) => String(v).padStart(2, '0');
        const startISO = `${y}-${pad(m + 1)}-01`;
        const nextMonth = new Date(y, m + 1, 1);
        const endISO = `${nextMonth.getFullYear()}-${pad(nextMonth.getMonth() + 1)}-01`;

        // --- Sale / Purchase for current month ---
        const psWhere = [`invoice_date >= ?`, `invoice_date < ?`];
        const psParams = [startISO, endISO];
        if (location) {
            psWhere.push('LOWER(location) = ?');
            psParams.push(location);
        }

        const psSql = `
            SELECT
                COALESCE(SUM(CASE WHEN transaction_type = 'Sale'     THEN amount ELSE 0 END), 0) AS total_sale,
                COALESCE(SUM(CASE WHEN transaction_type = 'Purchase' THEN amount ELSE 0 END), 0) AS total_purchase
            FROM purchase_sales
            WHERE ${psWhere.join(' AND ')}
        `;

        db.get(psSql, psParams, (err, row) => {
            if (err) {
                console.error('[dashboard-monthly-stats]', err);
                return res.status(500).json({ error: err.message });
            }
            const totalSale = Number(row && row.total_sale) || 0;
            const totalPurchase = Number(row && row.total_purchase) || 0;

            // --- Contractor balance payable (all-time, filtered by location via work entries) ---
            const conWhere = ['1=1'];
            const conParams = [];
            if (location) {
                conWhere.push('LOWER(e.location) = ?');
                conParams.push(location);
            }

            // Total contractor work value (based on entries + rate cards)
            const balanceSql = `
                SELECT
                    COALESCE(SUM(
                        e.fabrication  * COALESCE((SELECT rc.fabrication FROM contractor_rate_cards rc
                            WHERE rc.contractor_id = e.contractor_id AND rc.effective_date <= e.entry_date
                            ORDER BY rc.effective_date DESC, rc.id DESC LIMIT 1),
                            (SELECT rc.fabrication FROM contractor_rate_cards rc
                            WHERE rc.contractor_id = e.contractor_id
                            ORDER BY rc.effective_date ASC, rc.id ASC LIMIT 1), 100)
                        + e.cement_sheet * COALESCE((SELECT rc.cement_sheet FROM contractor_rate_cards rc
                            WHERE rc.contractor_id = e.contractor_id AND rc.effective_date <= e.entry_date
                            ORDER BY rc.effective_date DESC, rc.id DESC LIMIT 1),
                            (SELECT rc.cement_sheet FROM contractor_rate_cards rc
                            WHERE rc.contractor_id = e.contractor_id
                            ORDER BY rc.effective_date ASC, rc.id ASC LIMIT 1), 150)
                        + e.electrical   * COALESCE((SELECT rc.electrical FROM contractor_rate_cards rc
                            WHERE rc.contractor_id = e.contractor_id AND rc.effective_date <= e.entry_date
                            ORDER BY rc.effective_date DESC, rc.id DESC LIMIT 1),
                            (SELECT rc.electrical FROM contractor_rate_cards rc
                            WHERE rc.contractor_id = e.contractor_id
                            ORDER BY rc.effective_date ASC, rc.id ASC LIMIT 1), 200)
                        + e.tiles        * COALESCE((SELECT rc.tiles FROM contractor_rate_cards rc
                            WHERE rc.contractor_id = e.contractor_id AND rc.effective_date <= e.entry_date
                            ORDER BY rc.effective_date DESC, rc.id DESC LIMIT 1),
                            (SELECT rc.tiles FROM contractor_rate_cards rc
                            WHERE rc.contractor_id = e.contractor_id
                            ORDER BY rc.effective_date ASC, rc.id ASC LIMIT 1), 120)
                        + e.plumbing     * COALESCE((SELECT rc.plumbing FROM contractor_rate_cards rc
                            WHERE rc.contractor_id = e.contractor_id AND rc.effective_date <= e.entry_date
                            ORDER BY rc.effective_date DESC, rc.id DESC LIMIT 1),
                            (SELECT rc.plumbing FROM contractor_rate_cards rc
                            WHERE rc.contractor_id = e.contractor_id
                            ORDER BY rc.effective_date ASC, rc.id ASC LIMIT 1), 130)
                        + e.door_fitting * COALESCE((SELECT rc.door_fitting FROM contractor_rate_cards rc
                            WHERE rc.contractor_id = e.contractor_id AND rc.effective_date <= e.entry_date
                            ORDER BY rc.effective_date DESC, rc.id DESC LIMIT 1),
                            (SELECT rc.door_fitting FROM contractor_rate_cards rc
                            WHERE rc.contractor_id = e.contractor_id
                            ORDER BY rc.effective_date ASC, rc.id ASC LIMIT 1), 250)
                        + e.outer_colour * COALESCE((SELECT rc.outer_colour FROM contractor_rate_cards rc
                            WHERE rc.contractor_id = e.contractor_id AND rc.effective_date <= e.entry_date
                            ORDER BY rc.effective_date DESC, rc.id DESC LIMIT 1),
                            (SELECT rc.outer_colour FROM contractor_rate_cards rc
                            WHERE rc.contractor_id = e.contractor_id
                            ORDER BY rc.effective_date ASC, rc.id ASC LIMIT 1), 80)
                        + e.inner_colour * COALESCE((SELECT rc.inner_colour FROM contractor_rate_cards rc
                            WHERE rc.contractor_id = e.contractor_id AND rc.effective_date <= e.entry_date
                            ORDER BY rc.effective_date DESC, rc.id DESC LIMIT 1),
                            (SELECT rc.inner_colour FROM contractor_rate_cards rc
                            WHERE rc.contractor_id = e.contractor_id
                            ORDER BY rc.effective_date ASC, rc.id ASC LIMIT 1), 90)
                    ), 0) AS work_value
                FROM contractor_work_entries e
                WHERE ${conWhere.join(' AND ')}
            `;

            db.get(balanceSql, conParams, (err2, workRow) => {
                if (err2) {
                    console.error('[dashboard-monthly-stats] balance', err2);
                    return res.status(500).json({ error: err2.message });
                }
                const workValue = Number(workRow && workRow.work_value) || 0;

                // Total paid to those contractors
                db.get(`SELECT COALESCE(SUM(payment_amount), 0) AS total_paid FROM contractor_payments`, [], (err3, payRow) => {
                    if (err3) {
                        console.error('[dashboard-monthly-stats] pay', err3);
                        return res.status(500).json({ error: err3.message });
                    }
                    const totalPaid = Number(payRow && payRow.total_paid) || 0;
                    const balancePayable = Math.max(workValue - totalPaid, 0);

                    // Outstanding = unpaid Sale amount for current month (simplified: all Sale is considered collected already, so outstanding = 0 unless you track payments separately)
                    // We use: Outstanding = 0 for now (no separate payment tracking on sale)
                    // If you later add sale payment tracking, replace this with real data.
                    const outstanding = 0;

                    res.json({
                        month: `${y}-${pad(m + 1)}`,
                        total_sale: totalSale,
                        outstanding: outstanding,
                        total_purchase: totalPurchase,
                        balance_payable: balancePayable
                    });
                });
            });
        });
    } catch (err) {
        console.error('[dashboard-monthly-stats]', err);
        res.status(500).json({ error: 'Failed to load monthly stats' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});