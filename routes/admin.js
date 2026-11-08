const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { verifyCsrfAfterUpload } = require('../middleware/security');
const { slugify, parsePriceToCents, parseWholeNumber, SIZE_ORDER_SQL } = require('../lib/helpers');

const router = express.Router();
router.use(requireAdmin);

/* ---------- image uploads ---------- */

const UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads');
const EXT_BY_MIME = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => cb(null, crypto.randomBytes(12).toString('hex') + EXT_BY_MIME[file.mimetype]),
  }),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, Boolean(EXT_BY_MIME[file.mimetype])),
});

function removeUpload(url) {
  if (url && url.startsWith('/uploads/')) {
    fs.unlink(path.join(UPLOAD_DIR, path.basename(url)), () => {});
  }
}

function flash(req, type, msg) {
  req.session.flash = { type, msg };
}

/* ---------- dashboard ---------- */

router.get('/', (req, res) => {
  const stats = {
    products: db.prepare('SELECT COUNT(*) AS n FROM products').get().n,
    customers: db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'customer'").get().n,
    orders: db.prepare('SELECT COUNT(*) AS n FROM orders').get().n,
    revenue: db.prepare('SELECT COALESCE(SUM(total_cents), 0) AS n FROM orders').get().n,
  };
  const byStatus = { pending: 0, shipped: 0, delivered: 0 };
  db.prepare('SELECT status, COUNT(*) AS n FROM orders GROUP BY status').all().forEach((r) => { byStatus[r.status] = r.n; });

  const lowStock = db
    .prepare(
      `SELECT v.id, v.size, v.color, v.stock, p.id AS product_id, p.name
       FROM variants v JOIN products p ON p.id = v.product_id
       WHERE p.is_active = 1 AND v.stock <= 3
       ORDER BY v.stock ASC, p.name LIMIT 12`
    )
    .all();

  const recent = db
    .prepare('SELECT o.*, u.name AS customer FROM orders o JOIN users u ON u.id = o.user_id ORDER BY o.id DESC LIMIT 6')
    .all();

  res.render('admin/dashboard', { title: 'Admin', stats, byStatus, lowStock, recent });
});

/* ---------- products ---------- */

const productListSql = `
  SELECT p.*, c.name AS category_name,
         (SELECT COALESCE(SUM(stock), 0) FROM variants WHERE product_id = p.id) AS total_stock,
         (SELECT COUNT(*) FROM variants WHERE product_id = p.id) AS variant_count
  FROM products p JOIN categories c ON c.id = p.category_id
`;

router.get('/products', (req, res) => {
  const products = db.prepare(`${productListSql} ORDER BY p.id DESC`).all();
  res.render('admin/products', { title: 'Products', products });
});

function readProductForm(body) {
  const values = {
    name: String(body.name || '').trim(),
    brand: String(body.brand || '').trim() || 'STREETLOT',
    category_id: parseInt(body.category_id, 10),
    description: String(body.description || '').trim(),
    price: String(body.price || '').trim(),
    is_active: body.is_active ? 1 : 0,
  };
  const errors = [];
  if (values.name.length < 2) errors.push('Product name is required.');
  if (!Number.isInteger(values.category_id) || !db.prepare('SELECT 1 FROM categories WHERE id = ?').get(values.category_id)) {
    errors.push('Please choose a category.');
  }
  const cents = parsePriceToCents(values.price);
  if (cents === null) errors.push('Price must be a number like 89 or 89.90.');
  return { values, cents, errors };
}

function renderProductForm(res, { product, values, errors, status = 200 }) {
  const categories = db.prepare('SELECT * FROM categories ORDER BY name').all();
  const variants = product ? db.prepare(`SELECT * FROM variants WHERE product_id = ? ORDER BY ${SIZE_ORDER_SQL}, color`).all(product.id) : [];
  res.status(status).render('admin/product-form', {
    title: product ? `Edit ${product.name}` : 'New product',
    product,
    values,
    errors,
    categories,
    variants,
  });
}

router.get('/products/new', (req, res) => {
  renderProductForm(res, { product: null, values: { is_active: 1, brand: 'STREETLOT' }, errors: [] });
});

router.post('/products', upload.single('image'), verifyCsrfAfterUpload, (req, res) => {
  const { values, cents, errors } = readProductForm(req.body);
  if (errors.length) {
    if (req.file) removeUpload(`/uploads/${req.file.filename}`);
    return renderProductForm(res, { product: null, values, errors, status: 400 });
  }
  const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;
  const result = db
    .prepare('INSERT INTO products (category_id, name, brand, description, price_cents, image_url, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(values.category_id, values.name, values.brand, values.description, cents, imageUrl, values.is_active);
  flash(req, 'success', 'Product created. Now add its sizes and colors below.');
  res.redirect(`/admin/products/${Number(result.lastInsertRowid)}/edit`);
});

router.get('/products/:id/edit', (req, res, next) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return next();
  renderProductForm(res, { product, values: { ...product, price: (product.price_cents / 100).toFixed(2) }, errors: [] });
});

router.post('/products/:id', upload.single('image'), verifyCsrfAfterUpload, (req, res, next) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return next();

  const { values, cents, errors } = readProductForm(req.body);
  if (errors.length) {
    if (req.file) removeUpload(`/uploads/${req.file.filename}`);
    return renderProductForm(res, { product, values: { ...values, price: values.price }, errors, status: 400 });
  }

  let imageUrl = product.image_url;
  if (req.file) {
    removeUpload(product.image_url);
    imageUrl = `/uploads/${req.file.filename}`;
  } else if (req.body.remove_image) {
    removeUpload(product.image_url);
    imageUrl = null;
  }

  db.prepare(
    'UPDATE products SET category_id = ?, name = ?, brand = ?, description = ?, price_cents = ?, image_url = ?, is_active = ? WHERE id = ?'
  ).run(values.category_id, values.name, values.brand, values.description, cents, imageUrl, values.is_active, product.id);

  flash(req, 'success', 'Product saved.');
  res.redirect(`/admin/products/${product.id}/edit`);
});

router.post('/products/:id/delete', (req, res, next) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return next();
  db.prepare('DELETE FROM products WHERE id = ?').run(product.id); // variants cascade; past orders keep their snapshot rows
  removeUpload(product.image_url);
  flash(req, 'success', `Deleted "${product.name}".`);
  res.redirect('/admin/products');
});

/* ---------- variants (size / color / stock) ---------- */

router.post('/products/:id/variants', (req, res, next) => {
  const product = db.prepare('SELECT id FROM products WHERE id = ?').get(req.params.id);
  if (!product) return next();

  const size = String(req.body.size || '').trim();
  const color = String(req.body.color || '').trim();
  const stock = parseWholeNumber(req.body.stock, 100000);

  if (!size || !color || stock === null) {
    flash(req, 'error', 'Enter a size, a color and a stock number (0 or more).');
  } else if (db.prepare('SELECT 1 FROM variants WHERE product_id = ? AND size = ? AND color = ?').get(product.id, size, color)) {
    flash(req, 'error', `${size} / ${color} already exists for this product. Edit its stock instead.`);
  } else {
    db.prepare('INSERT INTO variants (product_id, size, color, stock) VALUES (?, ?, ?, ?)').run(product.id, size, color, stock);
    flash(req, 'success', `Added ${size} / ${color}.`);
  }
  res.redirect(`/admin/products/${product.id}/edit`);
});

router.post('/variants/:id', (req, res, next) => {
  const variant = db.prepare('SELECT * FROM variants WHERE id = ?').get(req.params.id);
  if (!variant) return next();
  const stock = parseWholeNumber(req.body.stock, 100000);
  if (stock === null) flash(req, 'error', 'Stock must be a whole number, 0 or more.');
  else {
    db.prepare('UPDATE variants SET stock = ? WHERE id = ?').run(stock, variant.id);
    flash(req, 'success', 'Stock updated.');
  }
  res.redirect(`/admin/products/${variant.product_id}/edit`);
});

router.post('/variants/:id/delete', (req, res, next) => {
  const variant = db.prepare('SELECT * FROM variants WHERE id = ?').get(req.params.id);
  if (!variant) return next();
  db.prepare('DELETE FROM variants WHERE id = ?').run(variant.id);
  flash(req, 'success', 'Variant removed.');
  res.redirect(`/admin/products/${variant.product_id}/edit`);
});

/* ---------- categories ---------- */

router.get('/categories', (req, res) => {
  const categories = db
    .prepare('SELECT c.*, (SELECT COUNT(*) FROM products WHERE category_id = c.id) AS product_count FROM categories c ORDER BY c.name')
    .all();
  res.render('admin/categories', { title: 'Categories', categories });
});

router.post('/categories', (req, res) => {
  const name = String(req.body.name || '').trim();
  const slug = slugify(name);
  if (name.length < 2 || !slug) flash(req, 'error', 'Please enter a category name.');
  else if (db.prepare('SELECT 1 FROM categories WHERE name = ? COLLATE NOCASE OR slug = ?').get(name, slug)) flash(req, 'error', 'That category already exists.');
  else {
    db.prepare('INSERT INTO categories (name, slug) VALUES (?, ?)').run(name, slug);
    flash(req, 'success', `Category "${name}" added.`);
  }
  res.redirect('/admin/categories');
});

router.post('/categories/:id', (req, res, next) => {
  const cat = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
  if (!cat) return next();
  const name = String(req.body.name || '').trim();
  const slug = slugify(name);
  const clash = db.prepare('SELECT 1 FROM categories WHERE (name = ? COLLATE NOCASE OR slug = ?) AND id != ?').get(name, slug, cat.id);
  if (name.length < 2 || !slug) flash(req, 'error', 'Please enter a category name.');
  else if (clash) flash(req, 'error', 'Another category already uses that name.');
  else {
    db.prepare('UPDATE categories SET name = ?, slug = ? WHERE id = ?').run(name, slug, cat.id);
    flash(req, 'success', 'Category renamed.');
  }
  res.redirect('/admin/categories');
});

router.post('/categories/:id/delete', (req, res, next) => {
  const cat = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
  if (!cat) return next();
  const used = db.prepare('SELECT COUNT(*) AS n FROM products WHERE category_id = ?').get(cat.id).n;
  if (used > 0) flash(req, 'error', `Can't delete "${cat.name}" - ${used} product(s) still use it.`);
  else {
    db.prepare('DELETE FROM categories WHERE id = ?').run(cat.id);
    flash(req, 'success', `Deleted "${cat.name}".`);
  }
  res.redirect('/admin/categories');
});

/* ---------- orders ---------- */

const NEXT_STATUS = { pending: 'shipped', shipped: 'delivered' };

router.get('/orders', (req, res) => {
  const status = ['pending', 'shipped', 'delivered'].includes(req.query.status) ? req.query.status : '';
  const orders = db
    .prepare(
      `SELECT o.*, u.name AS customer, u.email,
              (SELECT COALESCE(SUM(quantity), 0) FROM order_items WHERE order_id = o.id) AS item_count
       FROM orders o JOIN users u ON u.id = o.user_id
       ${status ? 'WHERE o.status = ?' : ''}
       ORDER BY o.id DESC`
    )
    .all(...(status ? [status] : []));
  res.render('admin/orders', { title: 'Orders', orders, status });
});

router.get('/orders/:id', (req, res, next) => {
  const order = db
    .prepare('SELECT o.*, u.name AS customer, u.email FROM orders o JOIN users u ON u.id = o.user_id WHERE o.id = ?')
    .get(req.params.id);
  if (!order) return next();
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id').all(order.id);
  res.render('admin/order', { title: `Order #${order.id}`, order, items, nextStatus: NEXT_STATUS[order.status] || null });
});

router.post('/orders/:id/status', (req, res, next) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return next();

  const next_ = NEXT_STATUS[order.status];
  if (!next_ || req.body.status !== next_) {
    flash(req, 'error', `An order that is ${order.status} can only move to ${next_ || 'nothing further'}.`);
    return res.redirect(`/admin/orders/${order.id}`);
  }

  if (next_ === 'shipped') {
    const tracking = String(req.body.tracking_number || '').trim().slice(0, 60) || null;
    db.prepare("UPDATE orders SET status = 'shipped', shipped_at = datetime('now'), tracking_number = ? WHERE id = ?").run(tracking, order.id);
  } else {
    db.prepare("UPDATE orders SET status = 'delivered', delivered_at = datetime('now') WHERE id = ?").run(order.id);
  }
  flash(req, 'success', `Order #${order.id} marked ${next_}.`);
  res.redirect(`/admin/orders/${order.id}`);
});

module.exports = router;
