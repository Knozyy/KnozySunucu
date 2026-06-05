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
      role TEXT DEFAULT 'user',
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

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS crash_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exit_code INTEGER,
      auto_restarted INTEGER DEFAULT 0,
      crash_count INTEGER DEFAULT 1,
      occurred_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS permission_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      color TEXT DEFAULT '#6366f1',
      pages TEXT NOT NULL DEFAULT '[]',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS timed_whitelist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mc_nick TEXT NOT NULL,
      added_by TEXT,
      expires_at INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS player_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      joined_at INTEGER NOT NULL,
      left_at INTEGER,
      duration_seconds INTEGER
    );

    CREATE TABLE IF NOT EXISTS player_stats_archives (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      archive_name TEXT NOT NULL,
      username TEXT NOT NULL,
      session_count INTEGER NOT NULL,
      total_seconds INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS api_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      token_prefix TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      created_by TEXT DEFAULT 'admin',
      last_used_at INTEGER,
      expires_at INTEGER,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ban_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      action TEXT NOT NULL,
      reason TEXT DEFAULT '',
      banned_by TEXT DEFAULT 'admin',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS command_macros (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      commands TEXT NOT NULL DEFAULT '[]',
      color TEXT DEFAULT '#6366f1',
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS player_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      note TEXT NOT NULL,
      color TEXT DEFAULT '#6366f1',
      created_by TEXT DEFAULT 'admin',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user TEXT NOT NULL,
      action TEXT NOT NULL,
      details TEXT DEFAULT '',
      ip TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS server_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      config TEXT NOT NULL DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      endpoint TEXT NOT NULL UNIQUE,
      subscription TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS discord_user_cache (
      user_id      TEXT PRIMARY KEY,
      username     TEXT,
      global_name  TEXT,
      avatar       TEXT,
      fetched_at   INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS discord_role_cache (
      role_id      TEXT PRIMARY KEY,
      guild_id     TEXT,
      name         TEXT,
      color        INTEGER,
      fetched_at   INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS discord_guild_cache (
      guild_id     TEXT PRIMARY KEY,
      name         TEXT,
      icon         TEXT,
      fetched_at   INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS servers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      path TEXT NOT NULL,
      port INTEGER DEFAULT 25565,
      jvm_args TEXT DEFAULT '',
      is_active INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    -- Not: min_ram / max_ram kolonları kaldırıldı (v2).
    -- RAM artık modpack.jvm_args / modpack.max_ram / JVM_ARGS env üzerinden okunuyor.

    CREATE TABLE IF NOT EXISTS throttle_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      priority INTEGER DEFAULT 1,
      enabled INTEGER DEFAULT 1,
      config_path TEXT NOT NULL,
      config_format TEXT NOT NULL DEFAULT 'toml',
      reload_command TEXT,
      server_id INTEGER NULL REFERENCES servers(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS throttle_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id INTEGER NOT NULL REFERENCES throttle_profiles(id) ON DELETE CASCADE,
      config_key TEXT NOT NULL,
      description TEXT DEFAULT '',
      value_type TEXT NOT NULL DEFAULT 'number',
      default_value TEXT NOT NULL,
      min_value TEXT NOT NULL,
      step_down REAL NOT NULL DEFAULT 1,
      step_up REAL NOT NULL DEFAULT 1,
      current_value TEXT
    );

    CREATE TABLE IF NOT EXISTS throttle_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id INTEGER,
      rule_id INTEGER,
      action TEXT NOT NULL,
      old_value TEXT,
      new_value TEXT,
      tps_at_time REAL,
      occurred_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- LagGuard — downsample'lı metrik geçmişi (panel grafiği restart sonrası dolu gelsin)
    CREATE TABLE IF NOT EXISTS lag_samples (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INTEGER NOT NULL,
      tps REAL,
      mspt REAL,
      players INTEGER DEFAULT 0,
      cant_keep_up INTEGER DEFAULT 0,
      server_id INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_lag_samples_ts ON lag_samples(ts);

    -- LagGuard · Kaldıraçlar (generic, veri-tabanlı — moda özel sabit kod yok)
    CREATE TABLE IF NOT EXISTS lag_levers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lever_key TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      apply_method TEXT NOT NULL DEFAULT 'gamerule', -- gamerule | command | config_reload | config_restart
      apply_template TEXT DEFAULT '',                -- ör: "gamerule randomTickSpeed {value}"
      config_path TEXT,                              -- config_* yöntemleri için
      config_format TEXT DEFAULT 'toml',
      config_key TEXT,
      reload_command TEXT,                           -- config_reload için
      value_type TEXT NOT NULL DEFAULT 'int',        -- int | float
      default_value REAL NOT NULL,
      min_value REAL NOT NULL,
      max_value REAL,
      step_down REAL NOT NULL DEFAULT 1,
      step_up REAL NOT NULL DEFAULT 1,
      current_value REAL,                            -- NULL = default'ta
      lag_ceiling REAL,                              -- sweet-spot: bu değer lag yapmıştı (recovery üst sınırı)
      priority INTEGER NOT NULL DEFAULT 50,          -- düşük = önce kısılır
      enabled INTEGER NOT NULL DEFAULT 1,
      is_builtin INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS lag_lever_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lever_id INTEGER,
      lever_key TEXT,
      action TEXT NOT NULL,        -- throttle | recover | reset | manual
      mode TEXT,                   -- dryrun | auto
      old_value REAL,
      new_value REAL,
      mspt_at REAL,
      detail TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_lag_lever_history_ts ON lag_lever_history(created_at);
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

    const userCols = database.prepare("PRAGMA table_info(users)").all();
    const userColNames = userCols.map(c => c.name);
    if (!userColNames.includes('role')) {
      database.exec("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'");
      // İlk admin varsa onu admin yap
      database.exec("UPDATE users SET role = 'admin' WHERE id = 1");
    }
    if (!userColNames.includes('category_id')) {
      database.exec("ALTER TABLE users ADD COLUMN category_id INTEGER NULL REFERENCES permission_categories(id)");
    }
    // servers tablosuna active_modpack_id kolonu ekle
    const serverCols = database.prepare("PRAGMA table_info(servers)").all().map(c => c.name);
    if (!serverCols.includes('active_modpack_id')) {
      database.exec("ALTER TABLE servers ADD COLUMN active_modpack_id INTEGER NULL REFERENCES installed_modpacks(id)");
    }

    // backups tablosuna server_id kolonu ekle (hangi sunucuya ait)
    const backupCols = database.prepare("PRAGMA table_info(backups)").all().map(c => c.name);
    if (!backupCols.includes('server_id')) {
      database.exec("ALTER TABLE backups ADD COLUMN server_id INTEGER NULL REFERENCES servers(id)");
    }

    // servers tablosu boşsa mevcut env ayarlarından ilk sunucuyu oluştur
    const serverCount = database.prepare('SELECT COUNT(*) as c FROM servers').get();
    if (serverCount.c === 0) {
        const defaultPath = process.env.MINECRAFT_SERVER_PATH || '/home/minecraft/server';
        database.prepare(`INSERT INTO servers (name, path, port, min_ram, max_ram, jvm_args, is_active)
            VALUES (?, ?, ?, ?, ?, ?, 1)`)
            .run('Varsayılan Sunucu', defaultPath, 25565,
                process.env.MINECRAFT_MIN_RAM || '2G',
                process.env.MINECRAFT_MAX_RAM || '4G',
                process.env.JVM_ARGS || '');
    }
  } catch (err) { console.error('Migration error:', err.message) }

  console.log('[DB] Database initialized successfully');
}

module.exports = { getDb, initDatabase };

