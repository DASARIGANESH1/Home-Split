-- HomeSplit — Shared Bill Splitter
-- Migration 0001: Initial schema
--
-- All monetary values are stored as INTEGER cents. Never use floating point.
-- At least three named constraints are defined (see uk_* below), plus CHECK
-- constraints so the database itself enforces correctness — not only the API.

-- ---------------------------------------------------------------------------
-- homes: a household / group that owns bills and members
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS homes (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),

  CONSTRAINT chk_home_name_length CHECK (length(name) >= 1 AND length(name) <= 100)
);

-- ---------------------------------------------------------------------------
-- members: people who belong to a home and owe shares on its bills
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS members (
  id          TEXT PRIMARY KEY,
  home_id     TEXT NOT NULL,
  name        TEXT NOT NULL,
  position    INTEGER NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (home_id) REFERENCES homes(id) ON DELETE CASCADE,

  -- Named constraint #1: a member's position within a home must be unique.
  -- This preserves deterministic member ordering for bill-split allocation.
  CONSTRAINT uk_member_home_position UNIQUE (home_id, position),

  CONSTRAINT chk_member_name_length CHECK (length(name) >= 1 AND length(name) <= 100),
  CONSTRAINT chk_member_position_nonneg CHECK (position >= 0)
);

CREATE INDEX IF NOT EXISTS idx_members_home ON members(home_id);

-- ---------------------------------------------------------------------------
-- bills: a single expense to be split across a home's members
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bills (
  id            TEXT PRIMARY KEY,
  home_id       TEXT NOT NULL,
  title         TEXT NOT NULL,
  total_amount  INTEGER NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (home_id) REFERENCES homes(id) ON DELETE CASCADE,

  CONSTRAINT chk_bill_title_length CHECK (length(title) >= 1 AND length(title) <= 200),
  -- total_amount must be a positive integer (cents). Zero/negative rejected.
  CONSTRAINT chk_bill_total_positive CHECK (total_amount > 0)
);

CREATE INDEX IF NOT EXISTS idx_bills_home ON bills(home_id);

-- ---------------------------------------------------------------------------
-- shares: an individual member's portion of a bill, payable independently
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shares (
  id                    TEXT PRIMARY KEY,
  bill_id               TEXT NOT NULL,
  member_id             TEXT NOT NULL,
  amount                INTEGER NOT NULL,
  paid_at               TEXT,
  paid_idempotency_key  TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (bill_id)   REFERENCES bills(id)   ON DELETE CASCADE,
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,

  -- Named constraint #2: a member can appear at most once per bill.
  CONSTRAINT uk_share_per_bill_member UNIQUE (bill_id, member_id),

  -- Named constraint #3: a paid share's idempotency key is unique.
  -- Combined with the conditional UPDATE (WHERE paid_at IS NULL) in the pay
  -- endpoint, this gives a database-enforced mutex against double payment.
  CONSTRAINT uk_share_paid_key UNIQUE (paid_idempotency_key),

  CONSTRAINT chk_share_amount_nonneg CHECK (amount >= 0)
);

CREATE INDEX IF NOT EXISTS idx_shares_bill   ON shares(bill_id);
CREATE INDEX IF NOT EXISTS idx_shares_member ON shares(member_id);

-- ---------------------------------------------------------------------------
-- idempotency_keys: durable record of the first response for a given key.
-- Replays with the same key return the stored response; a different key on an
-- already-paid share returns 409 Conflict.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key              TEXT PRIMARY KEY,
  share_id         TEXT NOT NULL,
  response_status  INTEGER NOT NULL,
  response_body    TEXT NOT NULL,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (share_id) REFERENCES shares(id) ON DELETE CASCADE,

  CONSTRAINT chk_idem_status_valid CHECK (response_status >= 200 AND response_status < 300)
);

CREATE INDEX IF NOT EXISTS idx_idem_share ON idempotency_keys(share_id);
