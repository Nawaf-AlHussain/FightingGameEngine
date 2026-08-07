# Database Schema — Neon PostgreSQL

## Tables

### users
```sql
CREATE TABLE users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  TEXT UNIQUE NOT NULL,
  username    TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);
```

### characters
```sql
CREATE TABLE characters (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  def_file    TEXT NOT NULL,       -- e.g. "chars/KnightmareSuperman/KnightmareSuperman.def"
  sff_file    TEXT NOT NULL,
  snd_file    TEXT NOT NULL,
  file_size   BIGINT,              -- total bytes
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now()
);
```

### stages
```sql
CREATE TABLE stages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  def_file    TEXT NOT NULL,
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now()
);
```

### rooms
```sql
CREATE TABLE rooms (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT UNIQUE NOT NULL,  -- 6-char room code
  host_id     UUID REFERENCES users(id),
  status      TEXT DEFAULT 'waiting', -- waiting | playing | finished
  p1_char_id  UUID REFERENCES characters(id),
  p2_char_id  UUID REFERENCES characters(id),
  stage_id    UUID REFERENCES stages(id),
  created_at  TIMESTAMPTZ DEFAULT now(),
  finished_at TIMESTAMPTZ
);
```

### room_players
```sql
CREATE TABLE room_players (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id     UUID REFERENCES rooms(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES users(id),
  slot        SMALLINT NOT NULL,     -- 1 or 2
  joined_at   TIMESTAMPTZ DEFAULT now()
);
```

### match_history
```sql
CREATE TABLE match_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id     UUID REFERENCES rooms(id),
  winner_slot SMALLINT,              -- 1, 2, or NULL (draw)
  p1_char_id  UUID REFERENCES characters(id),
  p2_char_id  UUID REFERENCES characters(id),
  duration_ms INTEGER,
  played_at   TIMESTAMPTZ DEFAULT now()
);
```

## Indexes

```sql
CREATE INDEX idx_rooms_code ON rooms(code);
CREATE INDEX idx_rooms_status ON rooms(status);
CREATE INDEX idx_room_players_room ON room_players(room_id);
CREATE INDEX idx_room_players_user ON room_players(user_id);
CREATE INDEX idx_match_history_room ON match_history(room_id);
CREATE INDEX idx_characters_active ON characters(is_active) WHERE is_active = true;
```

## Redis Key Patterns

| Pattern | Type | TTL | Purpose |
|---------|------|-----|---------|
| `room:{code}` | Hash | 24h | Current room state (players, chars, status) |
| `session:{sid}` | String | 24h | Map session ID to user UUID |
| `input:{room_code}:{frame}` | String | 60s | Buffered input for a specific frame |
| `room:players:{code}` | Set | 24h | Set of session IDs in a room |
| `lockstep:{room_code}` | Hash | 24h | Current frame counter, last input frame |