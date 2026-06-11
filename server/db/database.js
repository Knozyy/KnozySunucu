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
      default_value REAL NOT NULL,                   -- normal/istenen değer (lag yokken)
      relief_value REAL,                             -- lag'de gidilecek değer (rahatlama); < veya > default olabilir
      step REAL NOT NULL DEFAULT 1,                  -- her aksiyonda değişim miktarı
      min_value REAL,                                -- (legacy/opsiyonel sert sınır)
      max_value REAL,
      step_down REAL,                                -- (legacy)
      step_up REAL,                                  -- (legacy)
      current_value REAL,                            -- NULL = default'ta
      lag_ceiling REAL,                              -- sweet-spot: bu değer lag yapmıştı
      priority INTEGER NOT NULL DEFAULT 50,          -- düşük = önce kısılır
      enabled INTEGER NOT NULL DEFAULT 1,
      is_builtin INTEGER NOT NULL DEFAULT 0,
      effect_score REAL,                             -- Faz 2: kısınca MSPT'de ölçülen ortalama düşüş (adım başına ms; yüksek = daha etkili)
      effect_samples INTEGER NOT NULL DEFAULT 0,     -- etki ölçüm sayısı
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- LagGuard · Restart-config kuyruğu (Faz 2)
    -- config_restart kaldıraçları canlı uygulanamaz; istenen değer burada bekler,
    -- admin "Uygula"/"Uygula+Restart" deyince config dosyalarına yazılır.
    CREATE TABLE IF NOT EXISTS lag_restart_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lever_id INTEGER,
      lever_key TEXT,
      lever_name TEXT,
      config_path TEXT,
      config_format TEXT DEFAULT 'toml',
      config_key TEXT,
      target_value REAL,
      value_type TEXT DEFAULT 'int',
      reason TEXT,
      status TEXT NOT NULL DEFAULT 'pending', -- pending | applied | cancelled
      queued_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      applied_at DATETIME
    );
    CREATE INDEX IF NOT EXISTS idx_lag_restart_queue_status ON lag_restart_queue(status);

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

    -- LagGuard · Lag Atıf / Shadow Log (Faz 3)
    -- Lag anında "kim/ne" sorusuna en iyi-çaba yanıt: en kötü boyut + entity census
    -- + online oyuncu adayları + (varsa) FTB Chunks claim sahibi. Ceza YOK — sadece kayıt.
    CREATE TABLE IF NOT EXISTS lag_attribution (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INTEGER NOT NULL,
      mode TEXT,                    -- dryrun | auto | manual
      mspt_at REAL,
      worst_dim TEXT,               -- en kötü boyut (ör. minecraft:overworld)
      worst_dim_mspt REAL,
      suspect_count INTEGER DEFAULT 0,
      evidence TEXT,                -- JSON: { dims, entities, players, suspects, claims, notes }
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_lag_attribution_ts ON lag_attribution(ts);

    -- ── VIP Sistemi (panelden yönetilen, çoklu paket; Discord rolü + MC komutları) ──
    -- Yapılandırılabilir VIP paketleri: her biri bir Discord rolü atar ve verme/bitiş
    -- anında MC komutları çalıştırır (LuckPerms grubu, kit, vb. — {nick} yer tutucusu).
    CREATE TABLE IF NOT EXISTS vip_packages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      color TEXT DEFAULT '#f1c40f',
      discord_role_id TEXT,                 -- atanacak Discord rolü (opsiyonel)
      discord_guild_id TEXT,                -- rolün guild'i (boşsa birincil guild)
      duration_days INTEGER DEFAULT 30,     -- varsayılan süre (0 = süresiz)
      grant_commands TEXT NOT NULL DEFAULT '[]',  -- JSON: verme anı MC komutları ({nick},{discord})
      revoke_commands TEXT NOT NULL DEFAULT '[]', -- JSON: bitiş/iptal anı MC komutları
      join_message TEXT,                          -- VIP girince sohbet duyurusu ({nick},{package})
      leave_message TEXT,                         -- VIP çıkınca sohbet duyurusu
      sort_order INTEGER DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS vip_grants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      package_id INTEGER REFERENCES vip_packages(id) ON DELETE SET NULL,
      package_name TEXT,                    -- anlık kopya (paket silinse de görünür)
      user_id TEXT,                         -- Discord kullanıcı id (rol için)
      mc_nick TEXT,                         -- Minecraft nick (komutlar için)
      granted_by TEXT DEFAULT 'admin',
      granted_at INTEGER NOT NULL,          -- epoch sn
      expires_at INTEGER,                   -- epoch sn · NULL = süresiz
      status TEXT NOT NULL DEFAULT 'active',-- active | expired | revoked
      revoked_at INTEGER,
      note TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_vip_grants_status ON vip_grants(status, expires_at);

    CREATE TABLE IF NOT EXISTS vip_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      grant_id INTEGER,
      action TEXT NOT NULL,                 -- grant | expire | revoke | error
      package_name TEXT,
      mc_nick TEXT,
      user_id TEXT,
      detail TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Migration: vip_packages — join/leave duyuru mesajı kolonları
  try {
    const vc = database.prepare("PRAGMA table_info(vip_packages)").all().map(c => c.name);
    if (!vc.includes('join_message')) database.exec('ALTER TABLE vip_packages ADD COLUMN join_message TEXT');
    if (!vc.includes('leave_message')) database.exec('ALTER TABLE vip_packages ADD COLUMN leave_message TEXT');
  } catch (e) { /* tablo henüz yoksa sorun değil */ }

  // Migration: lag_levers — relief_value/step modeli (eski min_value/step_down'dan backfill)
  try {
    const lc = database.prepare("PRAGMA table_info(lag_levers)").all().map(c => c.name);
    if (!lc.includes('relief_value')) database.exec('ALTER TABLE lag_levers ADD COLUMN relief_value REAL');
    if (!lc.includes('step')) database.exec('ALTER TABLE lag_levers ADD COLUMN step REAL');
    // Faz 2: etki-güdümlü hedefleme kolonları
    if (!lc.includes('effect_score')) database.exec('ALTER TABLE lag_levers ADD COLUMN effect_score REAL');
    if (!lc.includes('effect_samples')) database.exec('ALTER TABLE lag_levers ADD COLUMN effect_samples INTEGER NOT NULL DEFAULT 0');
    // Backfill: eski model "min'e doğru azalt" → relief = min_value, step = step_down
    database.exec(`UPDATE lag_levers SET relief_value = min_value WHERE relief_value IS NULL AND min_value IS NOT NULL`);
    database.exec(`UPDATE lag_levers SET step = COALESCE(step_down, 1) WHERE step IS NULL`);
  } catch (e) { /* tablo henüz yoksa sorun değil */ }

  // Migration: player_sessions.ip_address (Oyuncu 360 — konum/alt-hesap, ileriye dönük)
  try {
    const psc = database.prepare("PRAGMA table_info(player_sessions)").all().map(c => c.name);
    if (!psc.includes('ip_address')) {
      database.exec('ALTER TABLE player_sessions ADD COLUMN ip_address TEXT');
    }
  } catch (e) { /* tablo henüz yoksa sorun değil */ }

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

