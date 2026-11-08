const COLOR_HEX = {
  black: '#111111', white: '#f5f5f5', grey: '#9ca3af', gray: '#9ca3af', red: '#dc2626',
  navy: '#1e3a8a', blue: '#2563eb', olive: '#6b7a3a', green: '#16a34a', cream: '#f3ead3',
  sand: '#d6c3a1', orange: '#f97316', brown: '#7c4a2d', pink: '#ec4899', yellow: '#eab308',
};

function colorHex(name) {
  return COLOR_HEX[String(name || '').toLowerCase()] || '#888888';
}

function money(cents) {
  return '$' + (Number(cents || 0) / 100).toFixed(2);
}

function slugify(text) {
  return String(text)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Parses "89.00" / "89" into integer cents. Returns null when the input is not a valid price.
function parsePriceToCents(input) {
  const cleaned = String(input || '').trim();
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(parseFloat(cleaned) * 100);
}

// Parses a non-negative whole number. Returns null when invalid.
function parseWholeNumber(input, max = 100000) {
  const cleaned = String(input ?? '').trim();
  if (!/^\d+$/.test(cleaned)) return null;
  const n = parseInt(cleaned, 10);
  return n <= max ? n : null;
}

function formatDate(value) {
  if (!value) return '-';
  // SQLite datetime('now') is UTC without a timezone marker.
  const d = new Date(String(value).replace(' ', 'T') + 'Z');
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// SQL fragment that sorts sizes sensibly: numeric shoe sizes first, then XS..XXL, then One Size.
const SIZE_ORDER_SQL = `CASE size
  WHEN 'XS' THEN 1 WHEN 'S' THEN 2 WHEN 'M' THEN 3 WHEN 'L' THEN 4
  WHEN 'XL' THEN 5 WHEN 'XXL' THEN 6 WHEN 'One Size' THEN 7 ELSE 0 END, CAST(size AS REAL), size`;

module.exports = { colorHex, money, slugify, parsePriceToCents, parseWholeNumber, formatDate, SIZE_ORDER_SQL };
