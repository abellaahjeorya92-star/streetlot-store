// Deletes the SQLite database so the next start re-creates it with fresh seed data.
const fs = require('fs');
const path = require('path');

const base = process.env.DB_FILE || path.join(__dirname, '..', 'store.db');
['', '-wal', '-shm'].forEach((suffix) => {
  const f = base + suffix;
  if (fs.existsSync(f)) {
    fs.unlinkSync(f);
    console.log('Removed', f);
  }
});
console.log('Done. Run "npm start" to re-create and re-seed the database.');
