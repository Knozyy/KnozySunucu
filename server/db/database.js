const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.resolve(__dirname, 'knozy.db');
let db;

function getDb() {
    if (!db) {
        db = new Database(DB_PATH);
        db.pragma('journal_mode = WAL');
    }
    return db;
}

function initDatabase() {
    const database = getDb();

    database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS installed_modpacks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      curseforge_id INTEGER,
      name TEXT NOT NULL,
      version TEXT,
      author TEXT,
      logo_url TEXT,
      installed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      status TEXT DEFAULT 'installed'
    );

    CREATE TABLE IF NOT EXISTS backups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      filename TEXT NOT NULL,
      size INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

    console.error('[DB] Database initialized successfully');
}

module.exports = { getDb, initDatabase };
