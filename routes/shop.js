const express = require('express');
const db = require('../db');
const { SIZE_ORDER_SQL } = require('../lib/helpers');

const router = express.Router();

const SORTS = {
  newest: 'p.id DESC',
  price_asc: 'p.price_cents ASC',
  price_desc: 'p.price_cents DESC',
  name: 'p.name COLLATE NOCASE ASC',
};

const listSelect = `
  SELECT p.*, c.name AS category_name, c.slug AS category_slug,
         (SELECT COALESCE(SUM(v.stock), 0) FROM variants v WHERE v.product_id = p.id) AS total_stock,
         (SELECT GROUP_CONCAT(DISTINCT v.color) FROM variants v WHERE v.product_id = p.id AND v.stock > 0) AS colors
  FROM products p
  JOIN categories c ON c.id = p.category_id
`;

router.get('/', (req, res) => {
  const featured = db.prepare(`${listSelect} WHERE p.is_active = 1 ORDER BY p.id DESC LIMIT 8`).all();
  const categories = db.prepare('SELECT * FROM categories ORDER BY name').all();
  res.render('index', { title: 'Home', featured, categories });
});

router.get('/shop', (req, res) => {
  const { category = '', q = '', size = '', color = '', sort = 'newest' } = req.query;

  const where = ['p.is_active = 1'];
  const params = [];

  if (category) {
    where.push('c.slug = ?');
    params.push(String(category));
  }
  if (q) {
    where.push('(p.name LIKE ? OR p.brand LIKE ? OR p.description LIKE ?)');
    const like = `%${String(q).trim()}%`;
    params.push(like, like, like);
  }
  if (size) {
    where.push('EXISTS (SELECT 1 FROM variants v WHERE v.product_id = p.id AND v.size = ? AND v.stock > 0)');
    params.push(String(size));
  }
  if (color) {
    where.push('EXISTS (SELECT 1 FROM variants v WHERE v.product_id = p.id AND v.color = ? AND v.stock > 0)');
    params.push(String(color));
  }

  const orderBy = SORTS[sort] || SORTS.newest;
  const products = db.prepare(`${listSelect} WHERE ${where.join(' AND ')} ORDER BY ${orderBy}`).all(...params);

  const categories = db.prepare('SELECT * FROM categories ORDER BY name').all();
  const sizes = db.prepare(`SELECT DISTINCT size FROM variants ORDER BY ${SIZE_ORDER_SQL}`).all().map((r) => r.size);
  const colors = db.prepare('SELECT DISTINCT color FROM variants ORDER BY color').all().map((r) => r.color);

  res.render('shop', {
    title: 'Shop',
    products,
    categories,
    sizes,
    colors,
    filters: { category: String(category), q: String(q), size: String(size), color: String(color), sort: SORTS[sort] ? sort : 'newest' },
  });
});

router.get('/product/:id', (req, res, next) => {
  const product = db
    .prepare(
      `SELECT p.*, c.name AS category_name, c.slug AS category_slug
       FROM products p JOIN categories c ON c.id = p.category_id
       WHERE p.id = ? AND p.is_active = 1`
    )
    .get(req.params.id);
  if (!product) return next();

  const variants = db
    .prepare(`SELECT id, size, color, stock FROM variants WHERE product_id = ? ORDER BY ${SIZE_ORDER_SQL}, color`)
    .all(product.id);
  const sizes = [...new Set(variants.map((v) => v.size))];
  const colors = [...new Set(variants.map((v) => v.color))];

  const related = db
    .prepare(`${listSelect} WHERE p.is_active = 1 AND p.category_id = ? AND p.id != ? ORDER BY p.id DESC LIMIT 4`)
    .all(product.category_id, product.id);

  res.render('product', { title: product.name, product, variants, sizes, colors, related });
});

module.exports = router;