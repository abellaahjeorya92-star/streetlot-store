function requireLogin(req, res, next) {
  if (req.session.user) return next();
  req.session.flash = { type: 'info', msg: 'Please log in to continue.' };
  req.session.returnTo = req.originalUrl;
  return res.redirect('/login');
}

function requireAdmin(req, res, next) {
  if (!req.session.user) {
    req.session.flash = { type: 'info', msg: 'Please log in as an admin.' };
    req.session.returnTo = req.originalUrl;
    return res.redirect('/login');
  }
  if (req.session.user.role !== 'admin') {
    return res.status(403).render('error', { title: 'Forbidden', message: 'You need an admin account to view this page.' });
  }
  return next();
}

module.exports = { requireLogin, requireAdmin };
