# STREETLOT - Streetwear & Sneaker Store

A full e-commerce web application for a streetwear and sneaker shop.

| Requirement | Implementation |
| --- | --- |
| Core framework | Express.js (Node.js) |
| Frontend / styling | EJS templates + Tailwind CSS |
| Database | SQLite (relational) via `better-sqlite3` |
| Admin page | `/admin`: dashboard, products and variants, categories, orders |

## Features

**Storefront**
- Product catalog with category, size, color and text filters, plus sorting
- Product page with **size and color variants**: out-of-stock combinations are disabled, and low stock is flagged
- Session cart (add, change quantity, remove). Prices and stock are re-read from the database every time
- Register / log in / log out (bcrypt password hashing)
- Checkout with an atomic stock check, so the same item can't be oversold
- **Order tracking**: `pending -> shipped -> delivered`, with dates and a tracking number on each order

**Admin** (`admin@streetlot.test`)
- Dashboard: revenue, order counts by status, low-stock list, recent orders
- Products: create, edit, hide, delete, image upload, and per-variant (size / color / stock) management
- Categories: add, rename, delete (blocked while products use them)
- Orders: filter by status, view details, move an order forward one step (adds a tracking number when shipping)

**Security basics**: hashed passwords, session regeneration on login, CSRF tokens on every form, parameterized SQL everywhere, HTML escaping in all templates, role-protected admin routes, upload type and size limits.

## Run it

Requires Node.js 18.11 or newer.

```bash
npm install          # also builds the Tailwind CSS (postinstall)
npm start            # http://localhost:3000
```

During development:

```bash
npm run watch:css    # terminal 1: rebuild CSS when you edit views or src/input.css
npm run dev          # terminal 2: restart the server on code changes
```

The database file `store.db` is created and seeded automatically on first start. To start over with fresh demo data: `npm run seed:reset`, then `npm start`.

### Demo accounts

| Role | Email | Password |
| --- | --- | --- |
| Admin | admin@streetlot.test | admin123 |
| Customer | customer@streetlot.test | customer123 |

Change these (and set `SESSION_SECRET`) before putting the app anywhere public.

## Project structure

```
server.js              app setup, sessions, shared view variables
db.js                  schema, indexes, seed data
routes/
  shop.js              home, shop (filters), product page
  auth.js              register, login, logout
  cart.js              cart + checkout (transaction)
  orders.js            customer order list and tracking
  admin.js             dashboard, products, variants, categories, orders
middleware/            auth guards, CSRF protection
lib/                   cart logic, helpers (money, slugs, parsing)
views/                 EJS templates (+ partials, admin/)
src/input.css          Tailwind entry file   ->   public/css/output.css
tailwind.config.js
```

## Database

```
users(id, name, email, password_hash, role, created_at)
categories(id, name, slug)
products(id, category_id -> categories, name, brand, description, price_cents, image_url, is_active)
variants(id, product_id -> products, size, color, stock)        UNIQUE(product_id, size, color)
orders(id, user_id -> users, status, total_cents, shipping_name, shipping_address,
       tracking_number, created_at, shipped_at, delivered_at)
order_items(id, order_id -> orders, variant_id -> variants, product_name, size, color,
            unit_price_cents, quantity)                        -- name/price are snapshots
```

Order items keep a snapshot of the product name, size, color and price, so past orders stay correct even if a product is edited or deleted.

## Ideas to extend it

- Wishlist, product reviews, discount codes
- Real payments (e.g. a Stripe test-mode checkout)
- Order cancellation that restores stock
- Pagination on the shop and admin tables
- Persistent session store (the default in-memory store is for development only)

## Product images

The sample product photos are in `public/uploads/`. After running the app,
log in as admin, open Admin > Products > Edit, and upload a picture for each
product. Uploaded images appear on the home page, shop, and product pages.