-- ============================================================================
-- Conscious Spending App — Core PostgreSQL Schema (MVP)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- USERS
-- ----------------------------------------------------------------------------
CREATE TABLE users (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_number        TEXT NOT NULL UNIQUE,
    full_name           TEXT,
    monthly_income      NUMERIC(12, 2),         -- self-declared, used to derive safe_limit
    safe_limit_pct      NUMERIC(4, 2) DEFAULT 40.00, -- e.g. 40.00 = 40% of income
    data_source_mode    TEXT CHECK (data_source_mode IN ('AA_MOCK', 'CSV_UPLOAD')), -- null until onboarding completes
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- AA CONSENTS
-- One row per consent artefact issued via the TSP. A user may have multiple
-- consents over time (renewals, additional accounts linked later).
-- ----------------------------------------------------------------------------
CREATE TABLE aa_consents (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    consent_handle      TEXT NOT NULL UNIQUE,   -- returned by TSP at consent creation
    tsp_provider        TEXT NOT NULL,          -- 'setu' | 'finbox' | 'onemoney' | 'anumati' etc.
    status              TEXT NOT NULL DEFAULT 'PENDING'
                            CHECK (status IN ('PENDING', 'ACTIVE', 'PAUSED', 'REVOKED', 'EXPIRED')),
    fi_types            TEXT[] NOT NULL DEFAULT ARRAY['DEPOSIT'], -- FI types requested
    consent_start       TIMESTAMPTZ,
    consent_expiry      TIMESTAMPTZ,
    fetch_frequency     TEXT DEFAULT 'DAILY_3X', -- informational; actual cron controls cadence
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_aa_consents_user_status ON aa_consents(user_id, status);

-- ----------------------------------------------------------------------------
-- LINKED ACCOUNTS
-- One bank account discovered/linked under a given consent.
-- ----------------------------------------------------------------------------
CREATE TABLE linked_accounts (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    consent_id          UUID NOT NULL REFERENCES aa_consents(id) ON DELETE CASCADE,
    fip_id              TEXT NOT NULL,          -- FIP identifier from AA network (the bank)
    masked_account_no   TEXT NOT NULL,          -- last 4 digits only, never store full number
    account_type        TEXT NOT NULL DEFAULT 'SAVINGS',
    bank_name           TEXT,
    last_synced_at      TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (consent_id, fip_id, masked_account_no)
);

-- ----------------------------------------------------------------------------
-- CATEGORIES
-- Fixed lean set, seeded once. Kept as a table (not an enum) so it's editable
-- without a migration if the team adds e.g. "Health" later.
-- ----------------------------------------------------------------------------
CREATE TABLE categories (
    id                  SMALLSERIAL PRIMARY KEY,
    code                TEXT NOT NULL UNIQUE,   -- 'RENT_BILLS', 'FOOD_GROCERIES', etc.
    display_name        TEXT NOT NULL,
    is_essential         BOOLEAN NOT NULL DEFAULT false, -- used in Safe Limit framing, not exclusion
    sort_order          SMALLINT NOT NULL DEFAULT 0
);

INSERT INTO categories (code, display_name, is_essential, sort_order) VALUES
    ('RENT_BILLS',      'Rent / Bills',        true,  1),
    ('FOOD_GROCERIES',  'Food / Groceries',    true,  2),
    ('TRAVEL_COMMUTE',  'Travel / Commute',    true,  3),
    ('OUTINGS_LEISURE', 'Outings / Leisure',   false, 4),
    ('SHOPPING',        'Shopping',            false, 5),
    ('UNCATEGORIZED',   'Uncategorized',       false, 99);

-- ----------------------------------------------------------------------------
-- CATEGORY RULES
-- Data-driven rule engine. Tier 1 (exact merchant) and Tier 2 (pattern) both
-- live here so non-engineers can maintain it via an internal tool, no deploy.
-- ----------------------------------------------------------------------------
CREATE TABLE category_rules (
    id                  SERIAL PRIMARY KEY,
    rule_type           TEXT NOT NULL CHECK (rule_type IN ('EXACT_VPA', 'EXACT_MERCHANT', 'REGEX', 'MCC')),
    match_value         TEXT NOT NULL,          -- the VPA, merchant string, regex pattern, or MCC code
    category_id         SMALLINT NOT NULL REFERENCES categories(id),
    priority            SMALLINT NOT NULL DEFAULT 100, -- lower = checked first
    is_active           BOOLEAN NOT NULL DEFAULT true,
    source              TEXT DEFAULT 'manual', -- 'manual' | 'promoted_from_llm'
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_category_rules_active_priority ON category_rules(is_active, priority);
CREATE INDEX idx_category_rules_match_value ON category_rules(match_value text_pattern_ops);

-- Seed examples
INSERT INTO category_rules (rule_type, match_value, category_id, priority) VALUES
    ('EXACT_VPA', 'swiggy@axisbank',  (SELECT id FROM categories WHERE code = 'FOOD_GROCERIES'), 10),
    ('EXACT_VPA', 'zomato@icici',     (SELECT id FROM categories WHERE code = 'FOOD_GROCERIES'), 10),
    ('EXACT_VPA', 'zeptomarketplace@ybl', (SELECT id FROM categories WHERE code = 'FOOD_GROCERIES'), 10),
    ('EXACT_VPA', 'rapido@paytm',     (SELECT id FROM categories WHERE code = 'TRAVEL_COMMUTE'), 10),
    ('REGEX',     'electricity|broadband|gas bill|rent', (SELECT id FROM categories WHERE code = 'RENT_BILLS'), 20);

-- ----------------------------------------------------------------------------
-- TRANSACTIONS
-- The core ledger. One row per transaction pulled from the AA payload.
-- ----------------------------------------------------------------------------
CREATE TABLE transactions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    linked_account_id   UUID NOT NULL REFERENCES linked_accounts(id) ON DELETE CASCADE,

    -- Idempotency: bank-issued reference, NOT our own generated ID.
    -- UTR for UPI, FIP txnId otherwise. This is what prevents duplicate
    -- ingestion across overlapping 2-3x/day sync windows.
    bank_txn_ref        TEXT NOT NULL,

    amount              NUMERIC(12, 2) NOT NULL,
    txn_type            TEXT NOT NULL CHECK (txn_type IN ('DEBIT', 'CREDIT')),
    txn_timestamp       TIMESTAMPTZ NOT NULL,

    raw_narration       TEXT,                   -- original description string from FIP
    counterparty_vpa    TEXT,                   -- payee/payer VPA if UPI
    mcc_code            TEXT,                   -- merchant category code, if FIP provides it

    category_id         SMALLINT NOT NULL REFERENCES categories(id)
                            DEFAULT (SELECT id FROM categories WHERE code = 'UNCATEGORIZED'),
    categorization_source TEXT NOT NULL DEFAULT 'PENDING'
                            CHECK (categorization_source IN ('PENDING', 'RULE_EXACT', 'RULE_REGEX', 'LLM', 'USER_TAGGED', 'P2P_UNCATEGORIZED')),
    categorization_confidence NUMERIC(3, 2),    -- null for rule matches (deterministic), set for LLM
    is_p2p              BOOLEAN NOT NULL DEFAULT false,

    is_excluded_from_safe_limit BOOLEAN NOT NULL DEFAULT false, -- e.g. self-transfers, refunds

    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (linked_account_id, bank_txn_ref)
);

CREATE INDEX idx_transactions_user_timestamp ON transactions(user_id, txn_timestamp DESC);
CREATE INDEX idx_transactions_user_category ON transactions(user_id, category_id);
CREATE INDEX idx_transactions_uncategorized
    ON transactions(user_id, txn_timestamp DESC)
    WHERE categorization_source IN ('PENDING', 'P2P_UNCATEGORIZED');

-- ----------------------------------------------------------------------------
-- USER TAGGING OVERRIDES (audit trail)
-- Every time a user quick-tags an Uncategorized transaction, log it here too.
-- This becomes training/promotion signal for category_rules over time.
-- ----------------------------------------------------------------------------
CREATE TABLE user_category_overrides (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id      UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    previous_category_id SMALLINT REFERENCES categories(id),
    new_category_id     SMALLINT NOT NULL REFERENCES categories(id),
    tagged_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- MONTHLY SAFE LIMIT SNAPSHOT (optional cache table)
-- Recomputed on write via app logic / materialized view refresh; this table
-- just lets the frontend read a cheap precomputed value instead of summing
-- the ledger on every app open. Source of truth is still `transactions`.
-- ----------------------------------------------------------------------------
CREATE TABLE safe_limit_snapshots (
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    month_year          DATE NOT NULL,          -- always first-of-month, e.g. 2026-06-01
    safe_limit_amount   NUMERIC(12, 2) NOT NULL,
    spent_amount        NUMERIC(12, 2) NOT NULL DEFAULT 0,
    is_red_zone         BOOLEAN NOT NULL DEFAULT false,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, month_year)
);
