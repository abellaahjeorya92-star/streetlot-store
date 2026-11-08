const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const dbFile = process.env.DB_FILE || path.join(__dirname, 'store.db');
const db = new Database(dbFile);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer','admin')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS categories (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS products (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  name        TEXT NOT NULL,
  brand       TEXT NOT NULL DEFAULT 'STREETLOT',
  description TEXT NOT NULL DEFAULT '',
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  image_url   TEXT,
  is_active   INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS variants (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  size       TEXT NOT NULL,
  color      TEXT NOT NULL,
  stock      INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  UNIQUE (product_id, size, color)
);

CREATE TABLE IF NOT EXISTS orders (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id          INTEGER NOT NULL REFERENCES users(id),
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','shipped','delivered')),
  total_cents      INTEGER NOT NULL,
  shipping_name    TEXT NOT NULL,
  shipping_address TEXT NOT NULL,
  tracking_number  TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  shipped_at       TEXT,
  delivered_at     TEXT
);

CREATE TABLE IF NOT EXISTS order_items (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id         INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  variant_id       INTEGER REFERENCES variants(id) ON DELETE SET NULL,
  product_name     TEXT NOT NULL,
  size             TEXT NOT NULL,
  color            TEXT NOT NULL,
  unit_price_cents INTEGER NOT NULL,
  quantity         INTEGER NOT NULL CHECK (quantity > 0)
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_variants_product  ON variants(product_id);
CREATE INDEX IF NOT EXISTS idx_orders_user       ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_items_order       ON order_items(order_id);
`);

function seed() {
  const hasUsers = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  if (hasUsers) return;

  const addUser = db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)');
  addUser.run('Store Admin', 'admin@streetlot.test', bcrypt.hashSync('admin123', 10), 'admin');
  addUser.run('Demo Customer', 'customer@streetlot.test', bcrypt.hashSync('customer123', 10), 'customer');

  const addCat = db.prepare('INSERT INTO categories (name, slug) VALUES (?, ?)');
  const cats = {};
  [['Sneakers', 'sneakers'], ['Hoodies', 'hoodies'], ['Tees', 'tees'], ['Pants', 'pants'], ['Caps', 'caps']]
    .forEach(([name, slug]) => { cats[slug] = addCat.run(name, slug).lastInsertRowid; });

  const addProduct = db.prepare(
    'INSERT INTO products (category_id, name, brand, description, price_cents) VALUES (?, ?, ?, ?, ?)'
  );
  const addVariant = db.prepare('INSERT INTO variants (product_id, size, color, stock) VALUES (?, ?, ?, ?)');

  const shoeSizes = ['7', '8', '9', '10', '11'];
  const apparelSizes = ['S', 'M', 'L', 'XL'];

  const catalog = [
    ['sneakers', 'Voltage Runner', 'STREETLOT', 'Lightweight mesh runner with a chunky foam midsole and reflective heel tab. Built for the city, comfortable all day.', 12900, shoeSizes, ['Black', 'White', 'Orange']],
    ['sneakers', 'Concrete High', 'STREETLOT', 'High-top court silhouette in premium leather with a cushioned collar and vulcanized outsole.', 14900, shoeSizes, ['White', 'Grey']],
    ['sneakers', 'Nightshift Low', 'STREETLOT', 'Stealth low-top with tonal stitching and a grippy gum sole. Goes with everything.', 11900, shoeSizes, ['Black', 'Olive']],
    ['hoodies', 'Heavyweight Box Hoodie', 'STREETLOT', '450gsm brushed fleece, boxy cut, dropped shoulders and a double-layer hood.', 8900, apparelSizes, ['Black', 'Cream', 'Navy']],
    ['hoodies', 'Zip Utility Hoodie', 'STREETLOT', 'Full-zip hoodie with hidden media pocket and ribbed cuffs.', 9900, apparelSizes, ['Grey', 'Olive']],
    ['tees', 'Oversized Logo Tee', 'STREETLOT', 'Washed 240gsm cotton with an oversized fit and a puff-print chest logo.', 3900, apparelSizes, ['White', 'Black', 'Sand']],
    ['tees', 'Graphic Skyline Tee', 'STREETLOT', 'Screen-printed skyline graphic on a soft boxy tee.', 4200, apparelSizes, ['Black', 'Cream']],
    ['pants', 'Cargo Joggers', 'STREETLOT', 'Tapered cargo joggers with six pockets and an adjustable hem.', 7500, apparelSizes, ['Black', 'Olive', 'Sand']],
    ['pants', 'Wide Leg Denim', 'STREETLOT', 'Relaxed wide-leg denim in a rigid mid-weight cotton.', 8200, apparelSizes, ['Blue', 'Black']],
    ['caps', 'Six-Panel Dad Cap', 'STREETLOT', 'Washed cotton six-panel with a metal buckle strap.', 2800, ['One Size'], ['Black', 'Navy', 'Cream']],
  ];

  const insertAll = db.transaction(() => {
    catalog.forEach(([cat, name, brand, desc, price, sizes, colors], i) => {
      const pid = Number(addProduct.run(cats[cat], name, brand, desc, price).lastInsertRowid);
      sizes.forEach((size, si) => {
        colors.forEach((color, ci) => {
          // Deterministic mix of stock levels, including a few sold-out and low-stock combos.
          const stock = (i * 7 + si * 3 + ci * 5) % 9;
          addVariant.run(pid, size, color, stock === 8 ? 0 : stock + 1);
        });
      });
    });
  });
  insertAll();
}

seed();

module.exports = db;
