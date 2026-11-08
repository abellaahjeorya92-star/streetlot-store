const crypto = require('crypto');

// Makes sure every session has a CSRF token and exposes it to the views.
function csrfToken(req, res, next) {
  if (!req.session.csrf) req.session.csrf = crypto.randomBytes(24).toString('hex');
  res.locals.csrfToken = req.session.csrf;
  next();
}

function tokensMatch(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

// The only routes that accept file uploads. Their token is verified in the route itself,
// after multer has parsed the multipart body (see verifyCsrfAfterUpload).
const UPLOAD_ROUTES = [/^\/admin\/products\/?$/, /^\/admin\/products\/\d+\/?$/];

// Verifies the token on every state-changing request.
function csrfProtect(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const isMultipart = (req.headers['content-type'] || '').startsWith('multipart/form-data');
  if (isMultipart && UPLOAD_ROUTES.some((re) => re.test(req.path))) return next();
  if (tokensMatch(req.body && req.body._csrf, req.session.csrf)) return next();
  return res.status(403).render('error', { title: 'Forbidden', message: 'Your form expired. Please go back, refresh and try again.' });
}

function verifyCsrfAfterUpload(req, res, next) {
  if (tokensMatch(req.body && req.body._csrf, req.session.csrf)) return next();
  return res.status(403).render('error', { title: 'Forbidden', message: 'Your form expired. Please go back, refresh and try again.' });
}

module.exports = { csrfToken, csrfProtect, verifyCsrfAfterUpload };
