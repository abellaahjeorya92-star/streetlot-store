const express = require('express');
const db = require('../db');
const { loadCart, syncSession, MAX_QTY_PER_LINE } = require('../lib/cart');
const { requireLogin } = require('../middleware/auth');

const router = express.Router();

function backTo(req, fallback) {
  const ref = req.get('Referer');
  return ref && ref.startsWith(`${req.protocol}://${req.get('host')}/`) ? ref : fallback;
}

router.get('/', (req, res) => {
  const cart = loadCart(req.session);
  if (cart.adjusted) {
    syncSession(req.session, cart);
    res.locals.flash = res.locals.flash || { type: 'info', msg: 'Some items in your cart changed because of stock or availability.' };
  }
  res.render('cart', { title: 'Your cart', cart });
});

router.post('/add', (req, res) => {
  const variantId = parseInt(req.body.variantId, 10);
  let qty = parseInt(req.body.qty, 10);
  if (!Number.isInteger(qty) || qty < 1) qty = 1;

  const variant = Number.isInteger(variantId)
    ? db
        .prepare(
          `SELECT v.id, v.stock, p.is_active, p.id AS product_id
           FROM variants v JOIN products p ON p.id = v.product_id WHERE v.id = ?`
        )
        .get(variantId)
    : undefined;

  if (!variant || !variant.is_active) {
    req.session.flash = { type: 'error', msg: 'Please choose a size and color first.' };
    return res.redirect(backTo(req, '/shop'));
  }
  if (variant.stock <= 0) {
    req.session.flash = { type: 'error', msg: 'Sorry, that size and color is sold out.' };
    return res.redirect(`/product/${variant.product_id}`);
  }

  req.session.cart = req.session.cart || [];
  const line = req.session.cart.find((l) => l.variantId === variant.id);
  const wanted = (line ? line.qty : 0) + qty;
  const finalQty = Math.min(wanted, variant.stock, MAX_QTY_PER_LINE);

  if (line) line.qty = finalQty;
  else req.session.cart.push({ variantId: variant.id, qty: finalQty });

  req.session.flash = {
    type: finalQty < wanted ? 'info' : 'success',
    msg: finalQty < wanted ? `Only ${finalQty} available - cart updated.` : 'Added to cart.',
  };
  return res.redirect('/cart');
});

router.post('/update', (req, res) => {
  const variantId = parseInt(req.body.variantId, 10);
  const qty = parseInt(req.body.qty, 10);
  const cart = req.session.cart || [];
  const line = cart.find((l) => l.variantId === variantId);

  if (line && Number.isInteger(qty)) {
    if (qty <= 0) req.session.cart = cart.filter((l) => l.variantId !== variantId);
    else line.qty = Math.min(qty, MAX_QTY_PER_LINE); // loadCart() clamps to real stock
  }
  res.redirect('/cart');
});

router.post('/remove', (req, res) => {
  const variantId = parseInt(req.body.variantId, 10);
  req.session.cart = (req.session.cart || []).filter((l) => l.variantId !== variantId);
  res.redirect('/cart');
});

router.get('/checkout', requireLogin, (req, res) => {
  const cart = loadCart(req.session);
  if (cart.items.length === 0) {
    req.session.flash = { type: 'info', msg: 'Your cart is empty.' };
    return res.redirect('/shop');
  }
  syncSession(req.session, cart);
  res.render('checkout', { title: 'Checkout', cart, form: { name: req.session.user.name, address: '' }, error: null });
});

const placeOrder = db.transaction((userId, name, address, items) => {
  let total = 0;
  const reduceStock = db.prepare('UPDATE variants SET stock = stock - ? WHERE id = ? AND stock >= ?');

  for (const it of items) {
    // The "stock >= ?" guard makes overselling impossible even with two buyers at once.
    const r = reduceStock.run(it.qty, it.variant_id, it.qty);
    if (r.changes === 0) {
      const err = new Error(`Sorry, "${it.name}" (${it.size} / ${it.color}) just sold out.`);
      err.userFacing = true;
      throw err;
    }
    total += it.qty * it.price_cents;
  }

  const order = db
    .prepare('INSERT INTO orders (user_id, status, total_cents, shipping_name, shipping_address) VALUES (?, ?, ?, ?, ?)')
    .run(userId, 'pending', total, name, address);
  const orderId = Number(order.lastInsertRowid);

  const addItem = db.prepare(
    `INSERT INTO order_items (order_id, variant_id, product_name, size, color, unit_price_cents, quantity)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  for (const it of items) addItem.run(orderId, it.variant_id, it.name, it.size, it.color, it.price_cents, it.qty);

  return orderId;
});

router.post('/checkout', requireLogin, (req, res) => {
  const name = String(req.body.name || '').trim();
  const address = String(req.body.address || '').trim();
  const cart = loadCart(req.session);

  if (cart.items.length === 0) return res.redirect('/cart');

  let error = null;
  if (name.length < 2) error = 'Please enter the name for delivery.';
  else if (address.length < 10) error = 'Please enter a full delivery address.';
  if (error) return res.status(400).render('checkout', { title: 'Checkout', cart, form: { name, address }, error });

  try {
    const orderId = placeOrder(req.session.user.id, name, address, cart.items);
    req.session.cart = [];
    req.session.flash = { type: 'success', msg: `Order #${orderId} placed. Thank you!` };
    return res.redirect(`/orders/${orderId}`);
  } catch (err) {
    if (err.userFacing) {
      const fresh = loadCart(req.session);
      syncSession(req.session, fresh);
      return res.status(409).render('checkout', { title: 'Checkout', cart: fresh, form: { name, address }, error: err.message });
    }
    throw err;
  }
});

module.exports = router;
