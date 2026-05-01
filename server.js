const express = require('express');
require('dotenv').config();
const http = require('http');
const { Server } = require('socket.io');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const path = require('path');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const fs = require('fs');
const https = require('https');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'shop-app-secret';
const BASE_URL = process.env.APP_URL || `http://localhost:${PORT}`;

const CRYSTALPAY_AUTH_LOGIN = process.env.CRYSTALPAY_AUTH_LOGIN || '';
const CRYSTALPAY_AUTH_SECRET = process.env.CRYSTALPAY_AUTH_SECRET || '';
const CRYSTALPAY_SALT = process.env.CRYSTALPAY_SALT || '';
const CRYSTALPAY_CURRENCY = process.env.CRYSTALPAY_CURRENCY || 'RUB';
const CRYSTALPAY_LIFETIME_MINUTES = process.env.CRYSTALPAY_LIFETIME_MINUTES
  ? Number(process.env.CRYSTALPAY_LIFETIME_MINUTES)
  : 1440;
const publicDir = path.join(__dirname, 'public');
const galleryDir = path.join(publicDir, 'gallery');
const pageRouteEntries = [
  { cleanPath: '/', fileName: 'index.html', legacyPaths: ['/index.html'] },
  { cleanPath: '/shop', fileName: 'index.html', legacyPaths: [] },
  { cleanPath: '/services', fileName: 'services.html', legacyPaths: ['/services.html'] },
  { cleanPath: '/demo', fileName: 'demo.html', legacyPaths: ['/demo.html'] },
  { cleanPath: '/offer', fileName: 'offer.html', legacyPaths: ['/offer.html'] },
  { cleanPath: '/privacy', fileName: 'privacy.html', legacyPaths: ['/privacy.html'] },
  { cleanPath: '/login', fileName: 'login.html', legacyPaths: ['/login.html'] },
  { cleanPath: '/register', fileName: 'register.html', legacyPaths: ['/register.html'] },
  { cleanPath: '/reset-password', fileName: 'reset-password.html', legacyPaths: ['/reset-password.html'] },
  { cleanPath: '/client', fileName: 'client.html', legacyPaths: ['/client.html'] },
  { cleanPath: '/admin', fileName: 'admin.html', legacyPaths: ['/admin.html'] },
];

const FEED_PAGES = [
  {
    path: '/',
    sourceFile: path.join(publicDir, 'index.html'),
    title: 'Good Boost — Прокачка аккаунтов «Мире танков»',
    description: 'Good Boost — профессиональный буст аккаунтов «Мире танков»: статистика, фарм серебра, ЛБЗ, отметки и наградная техника.',
    changefreq: 'daily',
    priority: '1.0',
    includeInRss: true,
    includeInTurbo: true,
  },
  {
    path: '/services',
    sourceFile: path.join(publicDir, 'services.html'),
    title: 'Описание услуг — Good Boost',
    description: 'Подробное описание услуг Good Boost: подставные бои, ЛБЗ, отметки, поднятие статистики и индивидуальные заказы.',
    changefreq: 'weekly',
    priority: '0.9',
    includeInRss: true,
    includeInTurbo: true,
  },
  {
    path: '/demo',
    sourceFile: path.join(publicDir, 'demo.html'),
    title: 'Демонстрация работ — Good Boost',
    description: 'Галерея фотографий и скриншотов Good Boost: примеры буста аккаунтов, игровых результатов и выполненных заказов.',
    changefreq: 'weekly',
    priority: '0.8',
    includeInRss: true,
    includeInTurbo: true,
  },
  {
    path: '/login',
    sourceFile: path.join(publicDir, 'login.html'),
    title: 'Вход — Good Boost',
    description: 'Вход в личный кабинет Good Boost.',
    changefreq: 'monthly',
    priority: '0.5',
    includeInRss: false,
    includeInTurbo: false,
  },
  {
    path: '/register',
    sourceFile: path.join(publicDir, 'register.html'),
    title: 'Регистрация — Good Boost',
    description: 'Регистрация нового аккаунта в сервисе Good Boost.',
    changefreq: 'monthly',
    priority: '0.5',
    includeInRss: false,
    includeInTurbo: false,
  },
  {
    path: '/privacy-policy',
    sourceFile: path.join(__dirname, 'assets', 'private.pdf'),
    title: 'Политика конфиденциальности — Good Boost',
    description: 'Политика конфиденциальности сервиса Good Boost.',
    changefreq: 'yearly',
    priority: '0.4',
    includeInRss: false,
    includeInTurbo: false,
  },
];

function isCrystalPayConfigured() {
  return Boolean(CRYSTALPAY_AUTH_LOGIN && CRYSTALPAY_AUTH_SECRET && CRYSTALPAY_SALT);
}

function sha1(input) {
  return crypto.createHash('sha1').update(String(input), 'utf8').digest('hex');
}

function safeEqual(a, b) {
  try {
    const aa = Buffer.from(String(a));
    const bb = Buffer.from(String(b));
    if (aa.length !== bb.length) return false;
    return crypto.timingSafeEqual(aa, bb);
  } catch {
    return false;
  }
}

function normalizeBaseUrl(url) {
  return String(url || '').replace(/\/+$/, '');
}

function escapeXml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function formatW3CDate(date) {
  return new Date(date).toISOString();
}

function formatRfc822Date(date) {
  return new Date(date).toUTCString();
}

function resolveFeedPages() {
  return FEED_PAGES.map((page) => {
    let lastModified = new Date();

    try {
      if (page.sourceFile && fs.existsSync(page.sourceFile)) {
        lastModified = fs.statSync(page.sourceFile).mtime;
      }
    } catch {
      lastModified = new Date();
    }

    return {
      ...page,
      lastModified,
      url: `${normalizeBaseUrl(BASE_URL)}${page.path === '/' ? '' : page.path}` || normalizeBaseUrl(BASE_URL),
    };
  });
}

function buildSitemapXml(pages) {
  const items = pages.map((page) => `  <url>\n    <loc>${escapeXml(page.url)}</loc>\n    <lastmod>${formatW3CDate(page.lastModified)}</lastmod>\n    <changefreq>${page.changefreq}</changefreq>\n    <priority>${page.priority}</priority>\n  </url>`).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items}\n</urlset>\n`;
}

function buildRssXml(pages) {
  const items = pages
    .filter((page) => page.includeInRss)
    .map((page) => `  <item>\n    <title>${escapeXml(page.title)}</title>\n    <link>${escapeXml(page.url)}</link>\n    <guid>${escapeXml(page.url)}</guid>\n    <description>${escapeXml(page.description)}</description>\n    <pubDate>${formatRfc822Date(page.lastModified)}</pubDate>\n  </item>`)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0">\n<channel>\n  <title>Good Boost</title>\n  <link>${escapeXml(normalizeBaseUrl(BASE_URL))}</link>\n  <description>Новости и основные страницы сервиса Good Boost.</description>\n  <language>ru-RU</language>\n  <lastBuildDate>${formatRfc822Date(new Date())}</lastBuildDate>\n${items}\n</channel>\n</rss>\n`;
}

function buildTurboContent(page) {
  return `<![CDATA[<header><h1>${escapeXml(page.title)}</h1></header><p>${escapeXml(page.description)}</p><p><a href="${escapeXml(page.url)}">Открыть страницу на сайте</a></p>]]>`;
}

function buildYandexTurboXml(pages) {
  const items = pages
    .filter((page) => page.includeInTurbo)
    .map((page) => `  <item turbo="true">\n    <title>${escapeXml(page.title)}</title>\n    <link>${escapeXml(page.url)}</link>\n    <pubDate>${formatRfc822Date(page.lastModified)}</pubDate>\n    <turbo:content>${buildTurboContent(page)}</turbo:content>\n  </item>`)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss xmlns:yandex="http://news.yandex.ru" xmlns:media="http://search.yahoo.com/mrss/" xmlns:turbo="http://turbo.yandex.ru" version="2.0">\n<channel>\n  <title>Good Boost Turbo</title>\n  <link>${escapeXml(normalizeBaseUrl(BASE_URL))}</link>\n  <description>Yandex Turbo feed for Good Boost.</description>\n${items}\n</channel>\n</rss>\n`;
}

function generateStartupFeeds() {
  const pages = resolveFeedPages();
  const files = [
    { fileName: 'sitemap.xml', content: buildSitemapXml(pages) },
    { fileName: 'rss.xml', content: buildRssXml(pages) },
    { fileName: 'yandex-turbo.xml', content: buildYandexTurboXml(pages) },
  ];

  files.forEach(({ fileName, content }) => {
    fs.writeFileSync(path.join(publicDir, fileName), content, 'utf8');
  });

  console.log('Generated startup feeds:', files.map((file) => file.fileName).join(', '));
}

function isPaidPaymentState(state) {
  const normalized = String(state || '').trim().toLowerCase();
  return normalized === 'payed'
    || normalized === 'paid'
    || normalized === 'success'
    || normalized === 'succeeded';
}

function paymentStatusFromState(state) {
  return isPaidPaymentState(state) ? 'paid' : 'unpaid';
}

function postJson(urlStr, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const payload = JSON.stringify(body ?? {});

    const req = https.request({
      method: 'POST',
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const json = data ? JSON.parse(data) : {};
          resolve({ statusCode: res.statusCode || 0, json });
        } catch (e) {
          reject(new Error('Invalid JSON response from upstream'));
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use((req, res, next) => {
  const routeEntry = pageRouteEntries.find((entry) => entry.legacyPaths.includes(req.path));
  if (!routeEntry) return next();

  const search = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  return res.redirect(301, `${routeEntry.cleanPath}${search}`);
});
app.use(express.static(publicDir, {
  setHeaders: (res, filePath) => {
    if (path.extname(filePath).toLowerCase() === '.html') {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('Surrogate-Control', 'no-store');
    }
  },
}));
app.use('/assets', express.static(path.join(__dirname, 'assets')));

app.get(['/favicon.ico', '/apple-touch-icon.png'], (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
  res.sendFile(path.join(publicDir, 'favicon.png'));
});

app.get('/api/gallery', (req, res) => {
  try {
    if (!fs.existsSync(galleryDir)) {
      return res.json({ images: [] });
    }

    const images = fs.readdirSync(galleryDir)
      .filter((fileName) => /\.(png|jpe?g|webp|gif|avif)$/i.test(fileName))
      .map((fileName) => {
        const absolutePath = path.join(galleryDir, fileName);
        const stats = fs.statSync(absolutePath);
        const title = path.parse(fileName).name
          .replace(/[-_]+/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        return {
          fileName,
          title: title || 'Демонстрация работы',
          url: `/gallery/${encodeURIComponent(fileName)}`,
          modifiedAt: stats.mtime.toISOString(),
        };
      })
      .sort((left, right) => new Date(right.modifiedAt) - new Date(left.modifiedAt));

    return res.json({ images });
  } catch (error) {
    console.error('Failed to read gallery images', error);
    return res.status(500).json({ error: 'Не удалось загрузить галерею' });
  }
});

app.get('/privacy-policy', (req, res) => {
  res.setHeader('Content-Disposition', 'inline; filename="private.pdf"');
  res.sendFile(path.join(__dirname, 'assets', 'private.pdf'));
});

pageRouteEntries.forEach((entry) => {
  app.get(entry.cleanPath, (req, res) => {
    if (entry.fileName === 'index.html') {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('Surrogate-Control', 'no-store');
    }
    res.sendFile(path.join(publicDir, entry.fileName));
  });
});

const dbFile = path.join(__dirname, 'database.db');
const isNewDb = !fs.existsSync(dbFile);
const db = new Database(dbFile);
db.pragma('journal_mode = WAL');
if (isNewDb) console.log('Created new DB:', dbFile);
else console.log('Using existing DB:', dbFile);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL,
    email           TEXT NOT NULL UNIQUE,
    phone           TEXT DEFAULT '',
    password        TEXT NOT NULL,
    role            TEXT DEFAULT 'user',
    email_verified  INTEGER DEFAULT 0,
    verify_token    TEXT DEFAULT NULL,
    reset_token     TEXT DEFAULT NULL,
    reset_expires   DATETIME DEFAULT NULL,
    created         DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS orders (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL,
    service     TEXT NOT NULL,
    details     TEXT DEFAULT '',
    total       REAL DEFAULT 0,
    status      TEXT DEFAULT 'new',
    created     DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id   INTEGER,
    name      TEXT NOT NULL,
    email     TEXT NOT NULL,
    message   TEXT NOT NULL,
    created   DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS chats (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    email     TEXT NOT NULL UNIQUE,
    user_id   INTEGER DEFAULT NULL,
    status    TEXT DEFAULT 'open',
    created   DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS chat_messages (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id   INTEGER NOT NULL,
    sender    TEXT NOT NULL,
    text      TEXT NOT NULL,
    created   DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (chat_id) REFERENCES chats(id)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

try {
  const info = db.prepare("PRAGMA table_info(orders);").all();
  const hasCol = (name) => info.some(c => c.name === name);
  if (!hasCol('payment_status')) {
    db.prepare("ALTER TABLE orders ADD COLUMN payment_status TEXT DEFAULT 'unpaid'").run();
    console.log('Migrated orders: added payment_status column');
  }
  if (!hasCol('payment_invoice_id')) {
    db.prepare("ALTER TABLE orders ADD COLUMN payment_invoice_id TEXT DEFAULT NULL").run();
    console.log('Migrated orders: added payment_invoice_id column');
  }
  if (!hasCol('payment_url')) {
    db.prepare("ALTER TABLE orders ADD COLUMN payment_url TEXT DEFAULT NULL").run();
    console.log('Migrated orders: added payment_url column');
  }
  if (!hasCol('payment_state')) {
    db.prepare("ALTER TABLE orders ADD COLUMN payment_state TEXT DEFAULT NULL").run();
    console.log('Migrated orders: added payment_state column');
  }
  if (!hasCol('payment_updated')) {
    db.prepare("ALTER TABLE orders ADD COLUMN payment_updated DATETIME DEFAULT NULL").run();
    console.log('Migrated orders: added payment_updated column');
  }
} catch (e) {
  console.error('Orders migration check failed:', e.message);
}

try {
  const info = db.prepare("PRAGMA table_info(users);").all();
  const hasCol = (name) => info.some(c => c.name === name);
  if (!hasCol('reset_token')) {
    db.prepare("ALTER TABLE users ADD COLUMN reset_token TEXT DEFAULT NULL").run();
    console.log('Migrated users: added reset_token column');
  }
  if (!hasCol('reset_expires')) {
    db.prepare("ALTER TABLE users ADD COLUMN reset_expires DATETIME DEFAULT NULL").run();
    console.log('Migrated users: added reset_expires column');
  }
} catch (e) {
  console.error('Users migration check failed:', e.message);
}

const defaultPricing = {
  version: 1,
  rig: {
    tiers: [
      { label: 'XI — Подставной бой', pricePerBattle: 300, minBattles: 5 },
      { label: 'X — Подставной бой', pricePerBattle: 200, minBattles: 5 },
      { label: 'IX — Подставной бой', pricePerBattle: 200, minBattles: 5 },
      { label: 'VIII — Подставной бой', pricePerBattle: 200, minBattles: 5 },
      { label: 'VII — Подставной бой', pricePerBattle: 300, minBattles: 5 },
      { label: 'VI — Подставной бой', pricePerBattle: 300, minBattles: 5 },
    ],
  },
  mark: {
    segmentPerPercent: { s1: 31, s2: 90, s3: 250 },
    fullCycleBase: 4500,
    modifiers: { medium: 700, hard: 1200 },
  },
  wn8: {
    tiers: { '5000': 2000, '7000': 2500, '8500': 3000, '10000': 4000, '12000': 5000 },
    multipliers: { rush: 1.2, specific: 1.15 },
  },
  lbz: {
    basePrices: { '1': 1407, '2': 1800, '3': 2300 },
  },
};

function normalizePricingInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
  const out = { ...input };
  // Legacy alias: "obz" -> "lbz"
  if (out.obz && !out.lbz) out.lbz = out.obz;
  if (out.obz) delete out.obz;
  return out;
}

function readSettingJson(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (!row) return null;
  try { return JSON.parse(row.value); } catch { return null; }
}

function writeSettingJson(key, value) {
  db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, JSON.stringify(value));
}

function deepMerge(base, patch) {
  if (patch === null || patch === undefined) return base;
  if (Array.isArray(base) && Array.isArray(patch)) {
    return patch.map((v, i) => deepMerge(base[i], v));
  }
  if (typeof base === 'object' && base && typeof patch === 'object' && patch && !Array.isArray(patch)) {
    const out = { ...base };
    for (const k of Object.keys(patch)) {
      out[k] = deepMerge(base[k], patch[k]);
    }
    return out;
  }
  return patch;
}

function sanitizePricing(input) {
  const normalized = normalizePricingInput(input);
  const merged = deepMerge(defaultPricing, normalized);

  try {
    merged.rig.tiers = Array.isArray(merged.rig?.tiers) ? merged.rig.tiers : defaultPricing.rig.tiers;
    merged.rig.tiers = merged.rig.tiers.map((t, idx) => {
      const def = defaultPricing.rig.tiers[idx] || {};
      const pricePerBattle = Number(t?.pricePerBattle ?? def.pricePerBattle ?? 0);
      const minBattles = Math.max(1, Number(t?.minBattles ?? def.minBattles ?? 1));
      return {
        label: String(t?.label ?? def.label ?? ''),
        pricePerBattle: Number.isFinite(pricePerBattle) ? pricePerBattle : (def.pricePerBattle || 0),
        minBattles: Number.isFinite(minBattles) ? minBattles : (def.minBattles || 1),
      };
    });

    const legacySeg = normalized?.mark?.segmentBase || merged.mark?.segmentBase || {};
    const segPP = normalized?.mark?.segmentPerPercent || merged.mark?.segmentPerPercent || {};

    const derivedPP = {
      s1: Number(legacySeg.s1) / 65,
      s2: Number(legacySeg.s2) / 20,
      s3: Number(legacySeg.s3) / 10,
    };

    const s1 = Number(segPP.s1 ?? (Number.isFinite(derivedPP.s1) ? derivedPP.s1 : defaultPricing.mark.segmentPerPercent.s1));
    const s2 = Number(segPP.s2 ?? (Number.isFinite(derivedPP.s2) ? derivedPP.s2 : defaultPricing.mark.segmentPerPercent.s2));
    const s3 = Number(segPP.s3 ?? (Number.isFinite(derivedPP.s3) ? derivedPP.s3 : defaultPricing.mark.segmentPerPercent.s3));

    merged.mark.segmentPerPercent = {
      s1: Number.isFinite(s1) && s1 >= 0 ? s1 : defaultPricing.mark.segmentPerPercent.s1,
      s2: Number.isFinite(s2) && s2 >= 0 ? s2 : defaultPricing.mark.segmentPerPercent.s2,
      s3: Number.isFinite(s3) && s3 >= 0 ? s3 : defaultPricing.mark.segmentPerPercent.s3,
    };

    const fullCycleBaseRaw = (normalized?.mark?.fullCycleBase ?? merged.mark?.fullCycleBase) ?? legacySeg.full;
    const fullCycleBase = Number(fullCycleBaseRaw ?? defaultPricing.mark.fullCycleBase);
    merged.mark.fullCycleBase = Number.isFinite(fullCycleBase) && fullCycleBase >= 0
      ? fullCycleBase
      : defaultPricing.mark.fullCycleBase;

    if (merged.mark.segmentBase) {
      merged.mark.segmentBase = {
        s1: Number(legacySeg.s1 ?? 0),
        s2: Number(legacySeg.s2 ?? 0),
        s3: Number(legacySeg.s3 ?? 0),
        full: Number(legacySeg.full ?? 0),
      };
    }
    const mods = merged.mark?.modifiers || {};
    merged.mark.modifiers = {
      medium: Number(mods.medium ?? defaultPricing.mark.modifiers.medium),
      hard: Number(mods.hard ?? defaultPricing.mark.modifiers.hard),
    };

    const wn8 = merged.wn8?.tiers || {};
    merged.wn8.tiers = {
      '5000': Number(wn8['5000'] ?? defaultPricing.wn8.tiers['5000']),
      '7000': Number(wn8['7000'] ?? defaultPricing.wn8.tiers['7000']),
      '8500': Number(wn8['8500'] ?? defaultPricing.wn8.tiers['8500']),
      '10000': Number(wn8['10000'] ?? defaultPricing.wn8.tiers['10000']),
      '12000': Number(wn8['12000'] ?? defaultPricing.wn8.tiers['12000']),
    };
    const mult = merged.wn8?.multipliers || {};
    merged.wn8.multipliers = {
      rush: Number(mult.rush ?? defaultPricing.wn8.multipliers.rush),
      specific: Number(mult.specific ?? defaultPricing.wn8.multipliers.specific),
    };

    const lbz = merged.lbz?.basePrices || {};
    merged.lbz.basePrices = {
      '1': Number(lbz['1'] ?? defaultPricing.lbz.basePrices['1']),
      '2': Number(lbz['2'] ?? defaultPricing.lbz.basePrices['2']),
      '3': Number(lbz['3'] ?? defaultPricing.lbz.basePrices['3']),
    };
  } catch (e) {
    return defaultPricing;
  }

  return merged;
}

const pricingExists = db.prepare('SELECT key FROM settings WHERE key = ?').get('pricing');
if (!pricingExists) {
  writeSettingJson('pricing', defaultPricing);
  console.log('Pricing seeded with defaults');
}

const adminExists = db.prepare('SELECT id FROM users WHERE role = ?').get('admin');
if (!adminExists) {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPass = process.env.ADMIN_PASSWORD;
  if (adminEmail && adminPass) {
    const hash = bcrypt.hashSync(adminPass, 10);
    db.prepare('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)')
      .run('Администратор', adminEmail, hash, 'admin');
    console.log(' Admin seeded from env:', adminEmail);
  } else {
    console.log('No admin credentials in env; skipping admin seed.');
  }
}

try {
  const info = db.prepare("PRAGMA table_info(chats);").all();
  const hasUserId = info.some(c => c.name === 'user_id');
  if (!hasUserId) {
    db.prepare('ALTER TABLE chats ADD COLUMN user_id INTEGER DEFAULT NULL').run();
    console.log('Migrated chats table: added user_id column');
  }
} catch (e) {
  console.error('Chat table migration check failed:', e.message);
}


const smtpHost = process.env.SMTP_HOST;
const smtpPort = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 465;
const smtpSecure = process.env.SMTP_SECURE === 'true' || smtpPort === 465;
const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;

if (!smtpHost || !smtpUser || !smtpPass) {
  console.warn('SMTP settings are not fully configured via environment variables. Email sending will be disabled.');
}

const transporter = smtpHost && smtpUser && smtpPass ? nodemailer.createTransport({
  host: smtpHost,
  port: smtpPort,
  secure: smtpSecure,
  auth: { user: smtpUser, pass: smtpPass },
}) : null;

async function sendVerificationEmail(email, token) {
  if (!transporter) {
    throw new Error('SMTP is not configured');
  }
  const link = `${BASE_URL}/api/verify?token=${token}`;
  const fromAddress = process.env.SMTP_FROM || smtpUser;
  await transporter.sendMail({
    from: `"Good Boost" <${fromAddress}>`,
    to: email,
    subject: 'Подтвердите вашу почту — Good Boost',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:32px;background:#111;border:1px solid #c9a84c33;border-radius:16px;">
        <h2 style="color:#c9a84c;text-align:center;margin-bottom:24px;">Good Boost</h2>
        <p style="color:#eee;font-size:16px;line-height:1.6;">Здравствуйте! Для завершения регистрации подтвердите вашу почту:</p>
        <div style="text-align:center;margin:32px 0;">
          <a href="${link}" style="background:#c9a84c;color:#000;padding:14px 40px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px;">Подтвердить Email</a>
        </div>
        <p style="color:#888;font-size:13px;text-align:center;">Если вы не регистрировались — просто проигнорируйте это письмо.</p>
      </div>
    `,
  });
}

async function sendPasswordResetEmail(email, token) {
  if (!transporter) {
    throw new Error('SMTP is not configured');
  }
  const link = `${BASE_URL}/reset-password?token=${encodeURIComponent(token)}`;
  const fromAddress = process.env.SMTP_FROM || smtpUser;
  await transporter.sendMail({
    from: `"Good Boost" <${fromAddress}>`,
    to: email,
    subject: 'Сброс пароля — Good Boost',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:32px;background:#111;border:1px solid #c9a84c33;border-radius:16px;">
        <h2 style="color:#c9a84c;text-align:center;margin-bottom:24px;">Good Boost</h2>
        <p style="color:#eee;font-size:16px;line-height:1.6;">Мы получили запрос на сброс пароля. Нажмите кнопку ниже, чтобы задать новый пароль.</p>
        <div style="text-align:center;margin:32px 0;">
          <a href="${link}" style="background:#c9a84c;color:#000;padding:14px 40px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px;">Сбросить пароль</a>
        </div>
        <p style="color:#888;font-size:13px;text-align:center;">Ссылка действует 30 минут. Если это были не вы — просто проигнорируйте письмо.</p>
      </div>
    `,
  });
}

function generateToken(user) {
  return jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
}

function authMiddleware(req, res, next) {
  const token = req.cookies.token || req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Не авторизован' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Токен недействителен' });
  }
}

function adminMiddleware(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Нет доступа' });
  next();
}

app.post('/api/register', async (req, res) => {
  const { name, email, phone, password } = req.body;
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Заполните все обязательные поля' });
  }
  const exists = db.prepare('SELECT id FROM users WHERE lower(email) = ?').get(normalizedEmail);
  if (exists) return res.status(400).json({ error: 'Email уже зарегистрирован' });

  try {
    const hash = bcrypt.hashSync(password, 10);
    const verifyToken = crypto.randomBytes(32).toString('hex');
    const result = db.prepare('INSERT INTO users (name, email, phone, password, verify_token) VALUES (?, ?, ?, ?, ?)')
      .run(name, normalizedEmail, phone || '', hash, verifyToken);

    const user = { id: result.lastInsertRowid, role: 'user' };
    const token = generateToken(user);
    let message = 'Аккаунт создан. Письмо для подтверждения почты отправлено сразу после регистрации.';
    let emailDeliveryFailed = false;

    try {
      await sendVerificationEmail(normalizedEmail, verifyToken);
    } catch (error) {
      emailDeliveryFailed = true;
      message = 'Аккаунт создан, но письмо для подтверждения почты сейчас не отправлено. Вы уже можете войти в свой аккаунт.';
      console.error('Registration email send error:', error.message);
    }

    res.cookie('token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.json({
      success: true,
      message,
      emailDeliveryFailed,
      user: { id: user.id, name, email: normalizedEmail, role: 'user' },
    });
  } catch (error) {
    console.error('Registration error:', error.message);
    return res.status(500).json({ error: 'Не удалось завершить регистрацию. Попробуйте ещё раз.' });
  }
});

app.get('/api/verify', (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).send('Неверная ссылка');

  const user = db.prepare('SELECT * FROM users WHERE verify_token = ?').get(token);
  if (!user) return res.status(400).send('Ссылка недействительна или уже использована');

  db.prepare('UPDATE users SET email_verified = 1, verify_token = NULL WHERE id = ?').run(user.id);

  res.send(`
    <!DOCTYPE html>
    <html lang="ru">
    <head><meta charset="UTF-8"><title>Email подтверждён</title>
    <style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0a0a0a;font-family:Montserrat,sans-serif;color:#fff;}
    .card{text-align:center;background:#1a1a1a;padding:48px;border-radius:16px;border:1px solid rgba(201,168,76,.2);}
    h1{color:#c9a84c;margin-bottom:12px;}a{color:#c9a84c;text-decoration:none;font-weight:600;}</style></head>
    <body><div class="card"><h1>✓ Email подтверждён!</h1><p>Теперь вы можете войти в аккаунт.</p><br><a href="/#login">Перейти к входу →</a></div></body></html>
  `);
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const user = db.prepare('SELECT * FROM users WHERE lower(email) = ?').get(normalizedEmail);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(400).json({ error: 'Неверный email или пароль' });
  }
  const token = generateToken(user);
  res.cookie('token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 });
  res.json({ success: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

app.post('/api/forgot-password', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!email) {
    return res.status(400).json({ error: 'Укажите email' });
  }

  const user = db.prepare('SELECT id, email FROM users WHERE lower(email) = ?').get(email);
  if (!user) {
    return res.json({ success: true, message: 'Если аккаунт существует, мы отправили ссылку для сброса пароля на вашу почту.' });
  }

  try {
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    db.prepare('UPDATE users SET reset_token = ?, reset_expires = ? WHERE id = ?').run(resetToken, expiresAt, user.id);
    await sendPasswordResetEmail(user.email, resetToken);

    return res.json({ success: true, message: 'Письмо для восстановления пароля отправлено на вашу почту.' });
  } catch (error) {
    console.error('Password reset email send error:', error.message);
    return res.status(500).json({ error: 'Не удалось отправить письмо для восстановления пароля. Проверьте настройки SMTP.' });
  }
});

app.get('/api/reset-password/validate', (req, res) => {
  const token = String(req.query?.token || '').trim();
  if (!token) {
    return res.status(400).json({ error: 'Токен не указан' });
  }

  const user = db.prepare('SELECT id, reset_expires FROM users WHERE reset_token = ?').get(token);
  if (!user || !user.reset_expires || new Date(user.reset_expires).getTime() < Date.now()) {
    return res.status(400).json({ error: 'Ссылка для сброса пароля недействительна или истекла' });
  }

  res.json({ success: true });
});

app.post('/api/reset-password', (req, res) => {
  const token = String(req.body?.token || '').trim();
  const password = String(req.body?.password || '');

  if (!token) return res.status(400).json({ error: 'Токен не указан' });
  if (password.length < 6) return res.status(400).json({ error: 'Пароль минимум 6 символов' });

  const user = db.prepare('SELECT id, reset_expires FROM users WHERE reset_token = ?').get(token);
  if (!user || !user.reset_expires || new Date(user.reset_expires).getTime() < Date.now()) {
    return res.status(400).json({ error: 'Ссылка для сброса пароля недействительна или истекла' });
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  db.prepare('UPDATE users SET password = ?, reset_token = NULL, reset_expires = NULL WHERE id = ?').run(passwordHash, user.id);

  res.json({ success: true });
});

app.post('/api/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true });
});

app.get('/api/me', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT id, name, email, phone, role, created FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
  res.json(user);
});

app.put('/api/me', authMiddleware, (req, res) => {
  const { name, phone } = req.body;
  db.prepare('UPDATE users SET name = ?, phone = ? WHERE id = ?').run(name, phone || '', req.user.id);
  res.json({ success: true });
});

app.post('/api/orders', authMiddleware, (req, res) => {
  const { service, details, total } = req.body;
  const result = db.prepare(`
    INSERT INTO orders (user_id, service, details, total, status, payment_status)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(req.user.id, service, details || '', total || 0, 'unpaid', 'unpaid');
  res.json({ success: true, id: result.lastInsertRowid });
});

app.post('/api/orders/:id/pay', authMiddleware, async (req, res) => {
  if (!isCrystalPayConfigured()) {
    return res.status(503).json({ error: 'Оплата временно недоступна: CrystalPay не настроен' });
  }

  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'Некорректный id заказа' });

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!order) return res.status(404).json({ error: 'Заказ не найден' });
  if (req.user.role !== 'admin' && order.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Нет доступа к заказу' });
  }

  if (order.payment_invoice_id && order.payment_url && order.payment_status !== 'paid') {
    return res.json({ success: true, url: order.payment_url, invoiceId: order.payment_invoice_id });
  }

  const amount = Number(order.total || 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'Сумма заказа некорректна' });
  }

  const createBody = {
    auth_login: CRYSTALPAY_AUTH_LOGIN,
    auth_secret: CRYSTALPAY_AUTH_SECRET,
    type: 'topup',
    subtract_from: 'amount',
    lifetime: (Number.isFinite(CRYSTALPAY_LIFETIME_MINUTES) && CRYSTALPAY_LIFETIME_MINUTES > 0)
      ? Math.floor(CRYSTALPAY_LIFETIME_MINUTES)
      : 1440,
    amount: String(amount),
    currency: CRYSTALPAY_CURRENCY,
    description: `Оплата заказа #${order.id}: ${order.service}`,
    redirect_url: `${BASE_URL}/pay/return?orderId=${order.id}`,
    callback_url: `${BASE_URL}/pay/callback/crystalpay`,
    extra: JSON.stringify({ orderId: order.id, userId: order.user_id }),
  };

  try {
    const { json } = await postJson('https://api.crystalpay.io/v3/invoice/create/', createBody);
    if (!json || json.error) {
      return res.status(502).json({ error: (json?.errors && json.errors[0]) ? String(json.errors[0]) : 'Ошибка создания инвойса' });
    }

    db.prepare(`
      UPDATE orders
      SET payment_invoice_id = ?, payment_url = ?, payment_state = ?, payment_updated = CURRENT_TIMESTAMP,
          payment_status = CASE WHEN payment_status IS NULL OR payment_status = '' THEN 'unpaid' ELSE payment_status END
      WHERE id = ?
    `).run(String(json.id || ''), String(json.url || ''), 'notpayed', order.id);

    if (order.status === 'new') {
      db.prepare("UPDATE orders SET status = 'unpaid' WHERE id = ?").run(order.id);
    }

    try {
      io.to('user_' + order.user_id).emit('order:updated', { id: order.id });
      io.to('admin_room').emit('order:updated', { id: order.id });
    } catch (e) {}

    return res.json({ success: true, url: json.url, invoiceId: json.id });
  } catch (e) {
    return res.status(502).json({ error: 'Не удалось связаться с CrystalPay' });
  }
});

app.post('/pay/callback/crystalpay', (req, res) => {
  if (!isCrystalPayConfigured()) {
    return res.status(503).json({ error: 'CrystalPay не настроен' });
  }

  const body = req.body || {};
  const invoiceId = String(body.id || '');
  const signature = String(body.signature || '');
  const state = String(body.state || '');
  const url = body.url ? String(body.url) : null;

  if (!invoiceId || !signature) return res.status(400).json({ error: 'Missing fields' });

  const expected = sha1(`${invoiceId}:${CRYSTALPAY_SALT}`);
  if (!safeEqual(expected, signature)) return res.status(400).json({ error: 'Invalid signature' });

  const paymentStatus = paymentStatusFromState(state);

  const order = db.prepare('SELECT id, user_id, status, payment_status FROM orders WHERE payment_invoice_id = ?').get(invoiceId);
  if (!order) {
    return res.json({ success: true });
  }

  db.prepare(`
    UPDATE orders
    SET payment_state = ?, payment_status = ?, payment_updated = CURRENT_TIMESTAMP,
        payment_url = COALESCE(?, payment_url)
    WHERE id = ?
  `).run(state || null, paymentStatus, url, order.id);


  if (paymentStatus === 'paid') {
    db.prepare("UPDATE orders SET status = 'paid' WHERE id = ? AND status IN ('new','unpaid')").run(order.id);
  } else {
    db.prepare("UPDATE orders SET status = 'unpaid' WHERE id = ? AND status = 'new'").run(order.id);
  }

  try {
    io.to('user_' + order.user_id).emit('order:updated', { id: order.id });
    io.to('admin_room').emit('order:updated', { id: order.id });
  } catch (e) {}

  return res.json({ success: true });
});

app.get('/pay/return', async (req, res) => {
  const orderId = Number(req.query.orderId);
  if (!orderId || !isCrystalPayConfigured()) return res.redirect('/');

  let paymentStatus = 'unpaid';

  try {
    const order = db.prepare('SELECT id, user_id, status, payment_invoice_id FROM orders WHERE id = ?').get(orderId);
    if (!order || !order.payment_invoice_id) return res.redirect('/');

    const infoBody = {
      auth_login: CRYSTALPAY_AUTH_LOGIN,
      auth_secret: CRYSTALPAY_AUTH_SECRET,
      id: String(order.payment_invoice_id),
    };

    const { json } = await postJson('https://api.crystalpay.io/v3/invoice/info/', infoBody);
    if (json && !json.error) {
      const state = String(json.state || '');
      paymentStatus = paymentStatusFromState(state);
      db.prepare(`
        UPDATE orders
        SET payment_state = ?, payment_status = ?, payment_updated = CURRENT_TIMESTAMP,
            payment_url = COALESCE(?, payment_url)
        WHERE id = ?
      `).run(state || null, paymentStatus, json.url ? String(json.url) : null, order.id);

      if (paymentStatus === 'paid') {
        db.prepare("UPDATE orders SET status = 'paid' WHERE id = ? AND status IN ('new','unpaid')").run(order.id);
      }

      try {
        io.to('user_' + order.user_id).emit('order:updated', { id: order.id });
        io.to('admin_room').emit('order:updated', { id: order.id });
      } catch (e) {}
    }
  } catch (e) {
    // ignore
  }

  if (paymentStatus === 'paid') {
    return res.redirect(`/?payment=success&orderId=${orderId}`);
  }

  return res.redirect(`/?payment=unpaid&orderId=${orderId}`);
});

app.get('/api/orders', authMiddleware, (req, res) => {
  const orders = db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY created DESC').all(req.user.id);
  res.json(orders);
});

app.get('/api/orders/:id/payment-status', authMiddleware, async (req, res) => {
  const orderId = Number(req.params.id);
  if (!orderId) return res.status(400).json({ error: 'Некорректный id заказа' });

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order) return res.status(404).json({ error: 'Заказ не найден' });
  if (req.user.role !== 'admin' && order.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Нет доступа к заказу' });
  }

  let nextOrder = order;
  const shouldRefresh = String(req.query.refresh || '') === '1';

  if (shouldRefresh && isCrystalPayConfigured() && order.payment_invoice_id) {
    try {
      const { json } = await postJson('https://api.crystalpay.io/v3/invoice/info/', {
        auth_login: CRYSTALPAY_AUTH_LOGIN,
        auth_secret: CRYSTALPAY_AUTH_SECRET,
        id: String(order.payment_invoice_id),
      });

      if (json && !json.error) {
        const state = String(json.state || '');
        const paymentStatus = paymentStatusFromState(state);

        db.prepare(`
          UPDATE orders
          SET payment_state = ?, payment_status = ?, payment_updated = CURRENT_TIMESTAMP,
              payment_url = COALESCE(?, payment_url)
          WHERE id = ?
        `).run(state || null, paymentStatus, json.url ? String(json.url) : null, order.id);

        if (paymentStatus === 'paid') {
          db.prepare("UPDATE orders SET status = 'paid' WHERE id = ? AND status IN ('new','unpaid')").run(order.id);
        } else {
          db.prepare("UPDATE orders SET status = 'unpaid' WHERE id = ? AND status = 'new'").run(order.id);
        }

        nextOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id) || order;

        try {
          io.to('user_' + order.user_id).emit('order:updated', { id: order.id });
          io.to('admin_room').emit('order:updated', { id: order.id });
        } catch (e) {}
      }
    } catch (e) {}
  }

  return res.json({
    id: nextOrder.id,
    status: nextOrder.status,
    paymentStatus: nextOrder.payment_status || 'unpaid',
    paymentState: nextOrder.payment_state || null,
    paymentUpdated: nextOrder.payment_updated || null,
  });
});

app.post('/api/messages', (req, res) => {
  const { name, email, message } = req.body;
  if (!name || !email || !message) return res.status(400).json({ error: 'Заполните все поля' });
  db.prepare('INSERT INTO messages (name, email, message) VALUES (?, ?, ?)').run(name, email, message);
  res.json({ success: true });
});

app.get('/api/admin/users', authMiddleware, adminMiddleware, (req, res) => {
  const users = db.prepare(`
    SELECT
      u.id,
      u.name,
      u.email,
      u.phone,
      u.role,
      u.created,
      COALESCE(COUNT(o.id), 0) as ordersCount
    FROM users u
    LEFT JOIN orders o ON o.user_id = u.id
    GROUP BY u.id
    ORDER BY u.created DESC
  `).all();
  res.json(users);
});

app.delete('/api/admin/users/:id', authMiddleware, adminMiddleware, (req, res) => {
  db.prepare('DELETE FROM users WHERE id = ? AND role != ?').run(req.params.id, 'admin');
  res.json({ success: true });
});

app.get('/api/admin/orders', authMiddleware, adminMiddleware, (req, res) => {
  const orders = db.prepare(`
    SELECT orders.*, users.name as user_name, users.email as user_email
    FROM orders JOIN users ON orders.user_id = users.id
    ORDER BY orders.created DESC
  `).all();
  res.json(orders);
});

app.put('/api/admin/orders/:id', authMiddleware, adminMiddleware, (req, res) => {
  const { status } = req.body;
  db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, req.params.id);

  if (status === 'paid' || status === 'unpaid') {
    try {
      db.prepare('UPDATE orders SET payment_status = ?, payment_updated = CURRENT_TIMESTAMP WHERE id = ?').run(status, req.params.id);
    } catch (e) {}
  }

  try {
    const order = db.prepare('SELECT id, user_id, status FROM orders WHERE id = ?').get(req.params.id);
    if (order) {
      io.to('user_' + order.user_id).emit('order:updated', { id: order.id, status: order.status });
      io.to('admin_room').emit('order:updated', { id: order.id, status: order.status });
    }
  } catch (e) {
  }

  res.json({ success: true });
});

app.delete('/api/admin/orders/:id', authMiddleware, adminMiddleware, (req, res) => {
  const id = Number(req.params.id);
  const order = db.prepare('SELECT id, user_id FROM orders WHERE id = ?').get(id);
  if (!order) return res.status(404).json({ error: 'Заказ не найден' });
  db.prepare('DELETE FROM orders WHERE id = ?').run(id);

  try {
    io.to('user_' + order.user_id).emit('order:deleted', { id });
    io.to('admin_room').emit('order:deleted', { id });
  } catch (e) {}

  res.json({ success: true });
});

app.get('/api/admin/messages', authMiddleware, adminMiddleware, (req, res) => {
  const messages = db.prepare('SELECT * FROM messages ORDER BY created DESC').all();
  res.json(messages);
});

app.delete('/api/admin/messages/:id', authMiddleware, adminMiddleware, (req, res) => {
  db.prepare('DELETE FROM messages WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.get('/api/admin/stats', authMiddleware, adminMiddleware, (req, res) => {
  const usersCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  const ordersCount = db.prepare('SELECT COUNT(*) as count FROM orders').get().count;
  const messagesCount = db.prepare('SELECT COUNT(*) as count FROM messages').get().count;

  const paidOrdersCount = db.prepare(
    "SELECT COUNT(*) as count FROM orders WHERE COALESCE(payment_status, status) = 'paid'"
  ).get().count;
  const revenueTotal = db.prepare('SELECT COALESCE(SUM(total), 0) as sum FROM orders').get().sum;
  const revenuePaid = db.prepare(
    "SELECT COALESCE(SUM(total), 0) as sum FROM orders WHERE COALESCE(payment_status, status) = 'paid'"
  ).get().sum;

  const revenue = revenuePaid;
  res.json({ usersCount, ordersCount, paidOrdersCount, messagesCount, revenueTotal, revenuePaid, revenue });
});

app.get('/api/admin/chats', authMiddleware, adminMiddleware, (req, res) => {
  const chats = db.prepare(`
    SELECT chats.*, users.name as user_name, users.email as user_email,
      (SELECT text FROM chat_messages WHERE chat_id = chats.id ORDER BY created DESC LIMIT 1) as last_message,
      (SELECT COUNT(*) FROM chat_messages WHERE chat_id = chats.id AND sender = 'user') as user_msgs
    FROM chats LEFT JOIN users ON chats.user_id = users.id
    ORDER BY chats.created DESC
  `).all();
  res.json(chats);
});

app.get('/api/admin/chats/:id/messages', authMiddleware, adminMiddleware, (req, res) => {
  const msgs = db.prepare('SELECT * FROM chat_messages WHERE chat_id = ? ORDER BY created ASC').all(req.params.id);
  res.json(msgs);
});

app.get('/api/pricing', (req, res) => {
  const cfg = readSettingJson('pricing') || defaultPricing;
  res.json(sanitizePricing(cfg));
});

app.get('/api/admin/pricing', authMiddleware, adminMiddleware, (req, res) => {
  const cfg = readSettingJson('pricing') || defaultPricing;
  res.json(sanitizePricing(cfg));
});

app.put('/api/admin/pricing', authMiddleware, adminMiddleware, (req, res) => {
  const next = req.body;
  if (!next || typeof next !== 'object') {
    return res.status(400).json({ error: 'Некорректные данные' });
  }
  const sanitized = sanitizePricing(next);
  writeSettingJson('pricing', sanitized);
  try { io.emit('pricing:updated', sanitized); } catch (e) {}
  res.json({ success: true, pricing: sanitized });
});

app.get('/api/chat/:email', (req, res) => {
  const email = req.params.email;
  let userId = null;
  try {
    const token = req.cookies.token;
    if (token) {
      const payload = jwt.verify(token, JWT_SECRET);
      userId = payload.id;
    }
  } catch (e) {
    userId = null;
  }

  let chat = null;
  if (userId) {
    chat = db.prepare('SELECT * FROM chats WHERE user_id = ?').get(userId);
  }
  if (!chat) {
    chat = db.prepare('SELECT * FROM chats WHERE email = ?').get(email);
  }

  if (!chat) {
    try {
      const result = db.prepare('INSERT INTO chats (email, user_id) VALUES (?, ?)').run(email, userId);
      chat = { id: result.lastInsertRowid, email, user_id: userId };
    } catch (e) {
      chat = db.prepare('SELECT * FROM chats WHERE email = ?').get(email);
    }
  } else if (userId && !chat.user_id) {
    try {
      db.prepare('UPDATE chats SET user_id = ? WHERE id = ?').run(userId, chat.id);
      chat.user_id = userId;
    } catch (e) {}
  }

  const msgs = db.prepare('SELECT * FROM chat_messages WHERE chat_id = ? ORDER BY created ASC').all(chat.id);
  res.json({ chatId: chat.id, messages: msgs });
});

io.on('connection', (socket) => {
  try {
    const cookieHeader = socket.request.headers.cookie || '';
    const parsed = {};
    cookieHeader.split(';').forEach(p => {
      const [k, ...v] = p.split('=');
      if (!k) return;
      parsed[k.trim()] = decodeURIComponent((v || []).join('=').trim());
    });
    const token = parsed.token;
    if (token) {
      try {
        const payload = jwt.verify(token, JWT_SECRET);
        socket.user = payload;
      } catch (e) {
        socket.user = null;
      }
    }
  } catch (e) {
    socket.user = null;
  }

  try {
    if (socket.user && socket.user.id) {
      socket.join('user_' + socket.user.id);
    }
    if (socket.user && socket.user.role === 'admin') {
      socket.join('admin_room');
    }
  } catch (e) {}

  socket.on('chat:start', (email) => {
    let chat = null;

    if (socket.user && socket.user.id) {
      chat = db.prepare('SELECT * FROM chats WHERE user_id = ?').get(socket.user.id);
    }

    if (!chat) chat = db.prepare('SELECT * FROM chats WHERE email = ?').get(email);

    if (!chat) {
      const result = db.prepare('INSERT INTO chats (email, user_id) VALUES (?, ?)').run(email, socket.user?.id || null);
      chat = { id: result.lastInsertRowid, email, user_id: socket.user?.id || null };
    } else if (socket.user && socket.user.id && !chat.user_id) {
      try { db.prepare('UPDATE chats SET user_id = ? WHERE id = ?').run(socket.user.id, chat.id); chat.user_id = socket.user.id; } catch (e) {}
    }

    socket.join('chat_' + chat.id);
    socket.chatId = chat.id;
    socket.chatEmail = chat.email;
    socket.emit('chat:started', chat.id);

    const msgCount = db.prepare('SELECT COUNT(*) as c FROM chat_messages WHERE chat_id = ?').get(chat.id).c;
    if (msgCount === 0) {
      setTimeout(() => {
        const greeting = 'Здравствуйте! Как я могу помочь?';
        db.prepare('INSERT INTO chat_messages (chat_id, sender, text) VALUES (?, ?, ?)').run(chat.id, 'admin', greeting);
        const msg = db.prepare('SELECT * FROM chat_messages WHERE chat_id = ? ORDER BY created DESC LIMIT 1').get(chat.id);
        io.to('chat_' + chat.id).emit('chat:message', msg);
        io.to('admin_room').emit('chat:update');
      }, 2000);
    }
  });

  socket.on('chat:send', (data) => {
    const { chatId, text } = data;
    if (!chatId || !text) return;
    db.prepare('INSERT INTO chat_messages (chat_id, sender, text) VALUES (?, ?, ?)').run(chatId, 'user', text);
    const msg = db.prepare('SELECT * FROM chat_messages WHERE chat_id = ? ORDER BY created DESC LIMIT 1').get(chatId);
    io.to('chat_' + chatId).emit('chat:message', msg);
    io.to('admin_room').emit('chat:update');
  });

  socket.on('admin:join', () => {
    socket.join('admin_room');
  });

  socket.on('admin:openChat', (chatId) => {
    socket.join('chat_' + chatId);
  });

  socket.on('admin:send', (data) => {
    const { chatId, text } = data;
    if (!chatId || !text) return;
    db.prepare('INSERT INTO chat_messages (chat_id, sender, text) VALUES (?, ?, ?)').run(chatId, 'admin', text);
    const msg = db.prepare('SELECT * FROM chat_messages WHERE chat_id = ? ORDER BY created DESC LIMIT 1').get(chatId);
    io.to('chat_' + chatId).emit('chat:message', msg);
    io.to('admin_room').emit('chat:update');
  });
});

app.get('/{*splat}', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

generateStartupFeeds();

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
