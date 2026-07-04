-- Agent memory layer:
-- 1. chat_sessions loses its hard FK to resumes so the Global Agent can own
--    sessions under the sentinel resume_id '__global__'.
-- 2. checkpoint column = GenericAgent-style working checkpoint (compressed
--    task state the agent maintains across turns).
-- NOTE: PRAGMA foreign_keys is a no-op inside a transaction; this script runs
-- via execute_batch outside an explicit transaction, so the OFF/ON pair works.
PRAGMA foreign_keys=OFF;

CREATE TABLE chat_sessions_new (
    id TEXT PRIMARY KEY,
    resume_id TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '新对话',
    checkpoint TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

INSERT INTO chat_sessions_new (id, resume_id, title, created_at, updated_at)
    SELECT id, resume_id, title, created_at, updated_at FROM chat_sessions;

DROP TABLE chat_sessions;
ALTER TABLE chat_sessions_new RENAME TO chat_sessions;
CREATE INDEX IF NOT EXISTS idx_chat_sessions_resume ON chat_sessions(resume_id);

PRAGMA foreign_keys=ON;
