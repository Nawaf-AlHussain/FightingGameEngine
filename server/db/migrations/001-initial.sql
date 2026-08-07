-- Fighting Game Engine — Initial Schema
-- Compatible with Neon Serverless Postgres

CREATE TABLE IF NOT EXISTS users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  TEXT UNIQUE NOT NULL,
  username    TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS characters (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  def_file    TEXT NOT NULL,
  sff_file    TEXT NOT NULL,
  snd_file    TEXT NOT NULL,
  file_size   BIGINT,
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  def_file    TEXT NOT NULL,
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rooms (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT UNIQUE NOT NULL,
  host_id     UUID REFERENCES users(id),
  status      TEXT DEFAULT 'waiting',
  p1_char_id  UUID REFERENCES characters(id),
  p2_char_id  UUID REFERENCES characters(id),
  stage_id    UUID REFERENCES stages(id),
  created_at  TIMESTAMPTZ DEFAULT now(),
  finished_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS room_players (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id     UUID REFERENCES rooms(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES users(id),
  slot        SMALLINT NOT NULL,
  joined_at   TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS match_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id     UUID REFERENCES rooms(id),
  winner_slot SMALLINT,
  p1_char_id  UUID REFERENCES characters(id),
  p2_char_id  UUID REFERENCES characters(id),
  duration_ms INTEGER,
  played_at   TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_rooms_code ON rooms(code);
CREATE INDEX IF NOT EXISTS idx_rooms_status ON rooms(status);
CREATE INDEX IF NOT EXISTS idx_room_players_room ON room_players(room_id);
CREATE INDEX IF NOT EXISTS idx_room_players_user ON room_players(user_id);
CREATE INDEX IF NOT EXISTS idx_match_history_room ON match_history(room_id);
CREATE INDEX IF NOT EXISTS idx_characters_active ON characters(is_active) WHERE is_active = true;