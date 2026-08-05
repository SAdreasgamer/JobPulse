-- Job Tracker schema. libSQL is SQLite-compatible, so this file initializes the
-- application database and the in-memory SQLite test database.

-- One-time data-migration ledger (core/db.py's `_apply_data_migrations`). A row's
-- presence means that migration key has already run, so init_schema skips it on
-- every future startup instead of re-running it forever.
CREATE TABLE IF NOT EXISTS schema_migrations (
    key        TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS jobs (
    id          TEXT PRIMARY KEY,    -- UUID
    title       TEXT,                -- nullable: stub/migrated rows may have no scrape yet
    company     TEXT,                -- nullable, same reason
    company_key TEXT,                -- normalized company, advisory only (GET /jobs lookup)
    title_key   TEXT,                -- normalized title, advisory only (never auto-links)
    status      TEXT NOT NULL DEFAULT 'new',
    hidden      INTEGER NOT NULL DEFAULT 0,
    starred     INTEGER NOT NULL DEFAULT 0,
    meta        TEXT,                -- JSON side-bag for custom fields and internal
                                     -- metadata such as duplicate exclusions
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);

-- Not unique: distinct jobs legitimately share company+title (different teams/times).
CREATE INDEX IF NOT EXISTS idx_jobs_keys ON jobs (company_key, title_key);

CREATE TABLE IF NOT EXISTS listings (
    id          TEXT PRIMARY KEY,    -- opaque surrogate (UUID); never parsed. Real identity is
                                     -- the natural key (platform, platform_id) below. Legacy rows
                                     -- may carry an older readable 'PREFIX-platform_id' id.
    job_id      TEXT NOT NULL REFERENCES jobs (id),
    platform    TEXT NOT NULL,       -- 'linkedin' | 'manual' | <adapter platform> | ...
    platform_id TEXT NOT NULL,       -- bare platform-native id ('4424562295')
    url         TEXT,
    title       TEXT,
    company     TEXT,
    apply_type  TEXT,                -- 'easy_apply' | 'external' | 'unknown' | NULL
    meta        TEXT,                -- JSON side-bag: scraped fields - description (JD), region, applicants, chips, ...
    captured_at TEXT,                -- NULL = stub row (e.g. from a bare event), not yet scraped
    closed_at   TEXT,                -- set when posting goes "no longer accepting applications"
    updated_at  TEXT,
    UNIQUE (platform, platform_id)
);

-- job_id is an unindexed FK otherwise: hit by list_for_job, job_has_listings,
-- and the GET /jobs apply_type join. (platform, platform_id) is already covered
-- by the UNIQUE constraint above, which serves the batch-state lookup.
CREATE INDEX IF NOT EXISTS idx_listings_job_id ON listings (job_id);

CREATE TABLE IF NOT EXISTS events (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id        TEXT NOT NULL REFERENCES jobs (id),
    listing_id    TEXT REFERENCES listings (id),  -- nullable provenance
    event         TEXT NOT NULL,     -- vocabulary is validated in core/enums.py
    ts            TEXT NOT NULL,     -- UTC; sole time field (no day/tz dedup anymore)
    meta          TEXT,              -- JSON side-bag: reason, actor, interview date, outcome, note, ...
    meta_hash     TEXT               -- sha256 of canonical meta; drives flag novelty
);

-- Supports lookup of the latest event of a kind for metadata deduplication.
CREATE INDEX IF NOT EXISTS idx_events_job_event ON events (job_id, event);

CREATE TABLE IF NOT EXISTS documents (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id     TEXT NOT NULL REFERENCES jobs (id),
    type       TEXT NOT NULL,        -- 'cover_letter' | 'motivation_letter' | 'cv' | 'other'
    requested  TEXT,                 -- 'required' | 'optional' | NULL
    provided   INTEGER NOT NULL DEFAULT 0,
    content    TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Company blocklist. A company the user never wants to see captured (freelancing
-- platforms and other feed spam). Keyed by the same normalized company_key the
-- jobs table carries (app.core.text.normalize_company), so a block matches every
-- posting from that company regardless of its exact rendered name. `platform` is
-- the scope seam: '*' = block everywhere (the one-tap default), or a specific
-- platform ('linkedin') to block there only -- a company can post fine on Indeed
-- while spamming LinkedIn. Enforcement is client-side (the extension skips capture
-- and hides the card); the server is purely the durable, cross-machine list and
-- never filters GET /jobs.
CREATE TABLE IF NOT EXISTS blocked_companies (
    company_key TEXT NOT NULL,             -- normalized company (matches jobs.company_key)
    platform    TEXT NOT NULL DEFAULT '*', -- '*' = all platforms | 'linkedin' | ...
    label       TEXT,                      -- raw company name at block time, for display
    created_at  TEXT NOT NULL,
    PRIMARY KEY (company_key, platform)
);

-- Opt-in full-context search diagnostics. One append-only row per popup session,
-- deliberately FK-free so logging can never block a real write or job deletion.
-- Capture is either disabled, active for 30 minutes, or active until turned off;
-- the table is capped to a fixed retention window.
CREATE TABLE IF NOT EXISTS search_log (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    ts       TEXT NOT NULL,          -- UTC ISO, when the popup logged the session
    host     TEXT,                   -- active tab host
    seed     TEXT,                   -- automatic seed, if any
    query    TEXT,                   -- final searched text, including replacement
    results  INTEGER,                -- result count for the final query
    job_id   TEXT,                   -- clicked job id
    seed_rule TEXT,                  -- extractor that produced the automatic seed
    seed_results INTEGER             -- result count returned by the automatic seed
);
