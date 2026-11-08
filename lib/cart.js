const db = require('../db');

const MAX_QTY_PER_LINE = 10;

const variantStmt = db.prepare(`
  SELECT v.id AS variant_id, v.size, v.color, v.stock,
         p.id AS product_id, p.name, p.price_cents, p.image_url, p.is_active
  FROM variants v
  JOIN products p ON p.id = v.product_id
  WHERE v.id = ?
`);

// Builds the cart from the session, re-reading price and stock from the database every time
// so a customer can never check out at a stale price or beyond available stock.
function loadCart(session) {
  const lines = Array.isArray(session.cart) ? session.cart : [];
  const items = [];
  let total = 0;
  let count = 0;
  let adjusted = false;

  for (const line of lines) {
    const row = variantStmt.get(line.variantId);
    if (!row || !row.is_active || row.stock <= 0) {
      adjusted = true;
      continue;
    }
    const qty = Math.min(line.qty, row.stock, MAX_QTY_PER_LINE);
    if (qty !== line.qty) adjusted = true;
    const lineTotal = qty * row.price_cents;
    items.push({ ...row, qty, line_total: lineTotal });
    total += lineTotal;
    count += qty;
  }

  return { items, total, count, adjusted };
}

// Writes the cleaned-up cart back to the session.
function syncSession(session, cart) {
  session.cart = cart.items.map((i) => ({ variantId: i.variant_id, qty: i.qty }));
}

module.exports = { loadCart, syncSession, MAX_QTY_PER_LINE };
