const sqlite3 = require('sqlite3');
const path = require('path');
const os = require('os');

const userDataPath = path.join(os.homedir(), 'AppData', 'Roaming', 'idmaker');
const dbPath = path.join(userDataPath, 'database.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  db.all('SELECT id, name, paperSize, layout FROM templates', [], (err, rows) => {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    console.log(JSON.stringify(rows, null, 2));
    db.close();
  });
});
