-- Run this once to set up the Neon/Postgres schema
-- polyglot-cards database schema

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Decks
CREATE TABLE IF NOT EXISTS decks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  target_language TEXT NOT NULL,
  description TEXT,
  card_front_field TEXT DEFAULT 'auto',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS decks_user_id ON decks(user_id);

-- Blueprint fields (the configurable boxes per deck)
CREATE TABLE IF NOT EXISTS blueprint_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_id UUID NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  key TEXT NOT NULL,           -- e.g. 'japanese', 'chinese', 'example', 'hanja'
  label TEXT NOT NULL,         -- human display name
  description TEXT NOT NULL DEFAULT '',   -- sent to AI so it knows what to fill in
  field_type TEXT DEFAULT 'text', -- 'text' | 'example' (example triggers cloze)
  position INTEGER DEFAULT 0,
  show_on_front BOOLEAN DEFAULT false,
  phonetics JSONB DEFAULT '[]', -- e.g. ['furigana','pinyin','ipa']
  UNIQUE(deck_id, key)
);

-- Migration: safe to run against an existing database
ALTER TABLE blueprint_fields ADD COLUMN IF NOT EXISTS phonetics JSONB DEFAULT '[]';
ALTER TABLE blueprint_fields ALTER COLUMN description SET DEFAULT '';

CREATE INDEX IF NOT EXISTS blueprint_fields_deck ON blueprint_fields(deck_id);

-- Cards
CREATE TABLE IF NOT EXISTS cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_id UUID NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  word TEXT NOT NULL,           -- the target language vocab item
  fields JSONB DEFAULT '{}',   -- { japanese: '...', chinese: '...', example: '...{{word}}...', hanja: '...' }
  -- FSRS state
  stability FLOAT DEFAULT 0,
  difficulty FLOAT DEFAULT 5,
  repetitions INTEGER DEFAULT 0,
  interval INTEGER DEFAULT 0,
  due TIMESTAMPTZ DEFAULT NOW(),
  last_reviewed TIMESTAMPTZ,
  srs_state TEXT DEFAULT 'new',  -- 'new' | 'learning' | 'review' | 'relearning'
  seen BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS cards_deck_id ON cards(deck_id);
CREATE INDEX IF NOT EXISTS cards_user_id ON cards(user_id);
CREATE INDEX IF NOT EXISTS cards_due ON cards(deck_id, due);
CREATE INDEX IF NOT EXISTS cards_srs_state ON cards(deck_id, srs_state);

-- Review log (for analytics / undo future feature)
CREATE TABLE IF NOT EXISTS review_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  rating INTEGER NOT NULL,  -- 1-4
  stability_before FLOAT,
  stability_after FLOAT,
  interval_after INTEGER,
  reviewed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS review_log_card ON review_log(card_id);
CREATE INDEX IF NOT EXISTS review_log_user ON review_log(user_id, reviewed_at);
