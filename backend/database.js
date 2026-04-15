const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

async function setupDb() {
    const db = await open({
        filename: './database.sqlite',
        driver: sqlite3.Database
    });

    // We added price, verdict, and timestamp columns
  await db.exec(`
    CREATE TABLE IF NOT EXISTS watchlist (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticker TEXT UNIQUE, 
        price TEXT,
        verdict TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`);

    console.log("SQL: Watchlist table updated with extra columns.");
    return db;
}

module.exports = { setupDb };