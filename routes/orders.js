const express = require('express');
const db = require('../db');
const { requireLogin } = require('../middleware/auth');

const router = express.Router();

router.get('/orders', requireLogin, (req, res) => {
  const orders = db
    .prepare(
      `SELECT o.*, (SELECT COALESCE(SUM(quantity), 0) FROM order_items WHERE order_id = o.id) AS item_count
       FROM orders o WHERE o.user_id = ? ORDER BY o.id DESC`
    )
    .all(req.session.user.id);
  res.render('orders', { title: 'My orders', orders });
});

router.get('/orders/:id', requireLogin, (req, res, next) => {
  // Customers can only see their own orders.
  const order = db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(req.params.id, req.session.user.id);
  if (!order) return next();
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id').all(order.id);
  res.render('order', { title: `Order #${order.id}`, order, items });
});

module.exports = router;
