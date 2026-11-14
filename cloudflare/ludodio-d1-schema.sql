-- Ludodio : schema D1 isolé (ne modifie pas Supabase/Célébrations).
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS categories(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT NOT NULL UNIQUE,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS subcategories(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT NOT NULL,
 category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(category_id,name)
);
CREATE TABLE IF NOT EXISTS audios(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 title TEXT NOT NULL,
 description TEXT,
 image_path TEXT,
 audio_path TEXT NOT NULL,
 category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
 subcategory_id INTEGER REFERENCES subcategories(id) ON DELETE SET NULL,
 duration INTEGER,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP,
 illustration_key TEXT,
 cover_color TEXT,
 is_published INTEGER NOT NULL DEFAULT 1 CHECK(is_published IN(0,1))
);
CREATE INDEX IF NOT EXISTS audios_category_idx ON audios(category_id,is_published);
CREATE TABLE IF NOT EXISTS blog_categories(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT NOT NULL UNIQUE,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS articles(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 title TEXT NOT NULL,
 excerpt TEXT,
 content TEXT,
 category TEXT,
 cover_path TEXT,
 published INTEGER NOT NULL DEFAULT 0 CHECK(published IN(0,1)),
 published_at TEXT,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS articles_public_idx ON articles(published,published_at);
CREATE TABLE IF NOT EXISTS studio_sound_library(
 id TEXT PRIMARY KEY,
 name_fr TEXT NOT NULL,
 original_name TEXT NOT NULL,
 storage_path TEXT NOT NULL,
 category TEXT NOT NULL,
 keywords TEXT NOT NULL DEFAULT '[]',
 mime_type TEXT,
 size_bytes INTEGER,
 created_by TEXT,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP,
 content_sha256 TEXT
);
CREATE TABLE IF NOT EXISTS studio_projects(
 id TEXT PRIMARY KEY,
 name TEXT NOT NULL,
 project_data TEXT NOT NULL DEFAULT '{}',
 created_by TEXT,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
-- Auth throttling: IP is stored as a keyed SHA-256, not as a raw address.
CREATE TABLE IF NOT EXISTS login_limits(
 visitor TEXT PRIMARY KEY,
 fails INTEGER NOT NULL DEFAULT 0,
 locked_until INTEGER NOT NULL DEFAULT 0
);
