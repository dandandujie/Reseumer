-- L4 session archive — distilled records of finished tasks/sessions, kept for
-- long-horizon recall (GenericAgent memory hierarchy).
CREATE TABLE IF NOT EXISTS session_archives (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    scope TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_session_archives_created ON session_archives(created_at DESC);
