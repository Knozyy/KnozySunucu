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
      install_path TEXT,
      is_active INTEGER DEFAULT 0,
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

  // Migration: install_path ve is_active sütunları yoksa ekle
  try {
    const cols = database.prepare("PRAGMA table_info(installed_modpacks)").all();
    const colNames = cols.map(c => c.name);
    if (!colNames.includes('install_path')) {
      database.exec("ALTER TABLE installed_modpacks ADD COLUMN install_path TEXT");
    }
    if (!colNames.includes('is_active')) {
      database.exec("ALTER TABLE installed_modpacks ADD COLUMN is_active INTEGER DEFAULT 0");
    }
    if (!colNames.includes('server_port')) {
      database.exec("ALTER TABLE installed_modpacks ADD COLUMN server_port INTEGER DEFAULT 25565");
    }
    if (!colNames.includes('curseforge_file_id')) {
      database.exec("ALTER TABLE installed_modpacks ADD COLUMN curseforge_file_id INTEGER");
    }
    if (!colNames.includes('file_display_name')) {
      database.exec("ALTER TABLE installed_modpacks ADD COLUMN file_display_name TEXT");
    }
    if (!colNames.includes('min_ram')) {
      database.exec("ALTER TABLE installed_modpacks ADD COLUMN min_ram TEXT");
    }
    if (!colNames.includes('max_ram')) {
      database.exec("ALTER TABLE installed_modpacks ADD COLUMN max_ram TEXT");
    }
    if (!colNames.includes('jvm_args')) {
      database.exec("ALTER TABLE installed_modpacks ADD COLUMN jvm_args TEXT");
    }
  } catch { /* columns already exist */ }

  console.error('[DB] Database initialized successfully');
}

module.exports = { getDb, initDatabase };

