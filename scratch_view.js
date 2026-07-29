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
  db.get('SELECT * FROM templates WHERE id = 9', [], (err, row) => {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    const designs = JSON.parse(row.frontDesign);
    const parsed = JSON.parse(designs[0]);
    console.log('BEFORE:');
    console.log('isHiRes:', parsed.isHiRes);
    if (parsed.backgroundImage) {
      console.log('bg scaleX:', parsed.backgroundImage.scaleX, 'scaleY:', parsed.backgroundImage.scaleY);
    }

    // Run migration
    const displayScale = Math.min(550 / 650, 400 / 1039, 0.6); // 55x88 mm values
    const scaleMultiplier = 1 / displayScale;

    if (!parsed.isHiRes) {
      if (parsed.backgroundImage) {
        parsed.backgroundImage.left = (parsed.backgroundImage.left || 0) * scaleMultiplier;
        parsed.backgroundImage.top = (parsed.backgroundImage.top || 0) * scaleMultiplier;
        parsed.backgroundImage.scaleX = (parsed.backgroundImage.scaleX || 1) * scaleMultiplier;
        parsed.backgroundImage.scaleY = (parsed.backgroundImage.scaleY || 1) * scaleMultiplier;
      }
      parsed.isHiRes = true;
    }

    console.log('AFTER:');
    console.log('isHiRes:', parsed.isHiRes);
    if (parsed.backgroundImage) {
      console.log('bg scaleX:', parsed.backgroundImage.scaleX, 'scaleY:', parsed.backgroundImage.scaleY);
    }
    db.close();
  });
});
