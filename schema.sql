-- Run this once to set up the Neon/Postgres schema

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS decks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  target_language TEXT NOT NULL,
  source_language TEXT DEFAULT 'English',
  description TEXT,
  card_front_field TEXT DEFAULT 'auto',
  context_language TEXT DEFAULT 'target',
  strict_accents   BOOLEAN DEFAULT true,
  strict_mode      BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE decks ADD COLUMN IF NOT EXISTS source_language TEXT DEFAULT 'English';
ALTER TABLE decks ADD COLUMN IF NOT EXISTS context_language TEXT DEFAULT 'target';
ALTER TABLE decks ADD COLUMN IF NOT EXISTS strict_accents BOOLEAN DEFAULT true;
ALTER TABLE decks ADD COLUMN IF NOT EXISTS strict_mode BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS decks_user_id ON decks(user_id);

CREATE TABLE IF NOT EXISTS blueprint_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_id UUID NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  field_type TEXT DEFAULT 'text',
  position INTEGER DEFAULT 0,
  show_on_front BOOLEAN DEFAULT false,
  phonetics JSONB DEFAULT '[]',
  UNIQUE(deck_id, key)
);

ALTER TABLE blueprint_fields ADD COLUMN IF NOT EXISTS phonetics JSONB DEFAULT '[]';
ALTER TABLE blueprint_fields ALTER COLUMN description SET DEFAULT '';

CREATE INDEX IF NOT EXISTS blueprint_fields_deck ON blueprint_fields(deck_id);

-- Cards: fields column stores { key: value } where value is either:
--   - a plain string (for unannotated fields like source_translation, context)
--   - an object { text: "...", annotationType: "..." } for annotated/example fields
CREATE TABLE IF NOT EXISTS cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_id UUID NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  word TEXT NOT NULL,
  fields JSONB DEFAULT '{}',
  stability FLOAT DEFAULT 0,
  difficulty FLOAT DEFAULT 5,
  repetitions INTEGER DEFAULT 0,
  interval INTEGER DEFAULT 0,
  due TIMESTAMPTZ DEFAULT NOW(),
  last_reviewed TIMESTAMPTZ,
  srs_state TEXT DEFAULT 'new',
  learning_step INTEGER DEFAULT NULL,
  seen BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE cards ADD COLUMN IF NOT EXISTS learning_step INTEGER DEFAULT NULL;

CREATE INDEX IF NOT EXISTS cards_deck_id ON cards(deck_id);
CREATE INDEX IF NOT EXISTS cards_user_id ON cards(user_id);
CREATE INDEX IF NOT EXISTS cards_due ON cards(deck_id, due);
CREATE INDEX IF NOT EXISTS cards_srs_state ON cards(deck_id, srs_state);

CREATE TABLE IF NOT EXISTS review_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  rating INTEGER NOT NULL,
  stability_before FLOAT,
  stability_after FLOAT,
  interval_after INTEGER,
  reviewed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS review_log_card ON review_log(card_id);
CREATE INDEX IF NOT EXISTS review_log_user ON review_log(user_id, reviewed_at);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id TEXT PRIMARY KEY,
  settings JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Romanisation is now handled via hidden mandatory card fields (target_romanisation, source_romanisation)
-- These columns are kept for backwards compatibility but no longer used by the app
-- ALTER TABLE decks ADD COLUMN IF NOT EXISTS latin_typing BOOLEAN DEFAULT false;
-- ALTER TABLE decks ADD COLUMN IF NOT EXISTS romanisation_field TEXT DEFAULT '';
