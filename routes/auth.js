const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Logs the user in without losing their cart, and issues a fresh session id (prevents session fixation).
function startSession(req, res, next, userRow) {
  const cart = req.session.cart || [];
  const returnTo = req.session.returnTo;
  req.session.regenerate((err) => {
    if (err) return next(err);
    req.session.user = { id: userRow.id, name: userRow.name, email: userRow.email, role: userRow.role };
    req.session.cart = cart;
    req.session.flash = { type: 'success', msg: `Welcome, ${userRow.name}!` };
    const safeReturn = typeof returnTo === 'string' && returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : null;
    res.redirect(safeReturn || (userRow.role === 'admin' ? '/admin' : '/'));
  });
}

router.get('/register', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('register', { title: 'Create account', form: {}, error: null });
});

router.post('/register', (req, res, next) => {
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const confirm = String(req.body.confirm || '');
  const form = { name, email };

  let error = null;
  if (name.length < 2) error = 'Please enter your name.';
  else if (!EMAIL_RE.test(email)) error = 'Please enter a valid email address.';
  else if (password.length < 8) error = 'Password must be at least 8 characters.';
  else if (password !== confirm) error = 'Passwords do not match.';
  else if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) error = 'That email is already registered.';

  if (error) return res.status(400).render('register', { title: 'Create account', form, error });

  const result = db
    .prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)')
    .run(name, email, bcrypt.hashSync(password, 10), 'customer');
  const userRow = { id: Number(result.lastInsertRowid), name, email, role: 'customer' };
  return startSession(req, res, next, userRow);
});

router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('login', { title: 'Log in', form: {}, error: null });
});

router.post('/login', (req, res, next) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    return res.status(401).render('login', { title: 'Log in', form: { email }, error: 'Incorrect email or password.' });
  }
  return startSession(req, res, next, row);
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

module.exports = router;
