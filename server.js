const path = require('path');
const fs = require('fs');
const express = require('express');
const session = require('express-session');

require('./db'); // creates tables and seeds demo data on first run
const { csrfToken, csrfProtect } = require('./middleware/security');
const { colorHex, money, formatDate } = require('./lib/helpers');

const app = express();
const PORT = process.env.PORT || 3000;

fs.mkdirSync(path.join(__dirname, 'public', 'uploads'), { recursive: true });

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.disable('x-powered-by');

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: false }));

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dev-only-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 24 * 7 },
  })
);

// Variables available in every EJS view.
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.cartCount = (req.session.cart || []).reduce((n, line) => n + line.qty, 0);
  res.locals.flash = req.session.flash || null;
  res.locals.currentPath = req.path;
  res.locals.money = money;
  res.locals.colorHex = colorHex;
  res.locals.formatDate = formatDate;
  delete req.session.flash;
  next();
});

app.use(csrfToken);
app.use(csrfProtect);

app.use('/', require('./routes/shop'));
app.use('/', require('./routes/auth'));
app.use('/cart', require('./routes/cart'));
app.use('/', require('./routes/orders'));
app.use('/admin', require('./routes/admin'));

app.use((req, res) => {
  res.status(404).render('error', { title: 'Not found', message: "That page doesn't exist." });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  const message = err.code === 'LIMIT_FILE_SIZE' ? 'That image is too large (2 MB max).' : 'Something went wrong on our side.';
  res.status(500).render('error', { title: 'Error', message });
});

app.listen(PORT, () => {
  console.log(`STREETLOT running at http://localhost:${PORT}`);
});
