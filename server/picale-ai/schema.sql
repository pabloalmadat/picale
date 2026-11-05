-- PÍCALE AI · tablas propias (prefijo ai_). No toca las tablas del API actual.
-- Se aplica sola al arrancar el servicio; también puedes correrla a mano con psql.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS ai_courts (
  id           UUID PRIMARY KEY,               -- mismo court_id que usa el API actual
  club_id      TEXT NOT NULL,                  -- 'somos', 'duo', 'cuatro'
  club_name    TEXT NOT NULL,
  court_name   TEXT NOT NULL,
  sport        TEXT NOT NULL DEFAULT 'padel',
  qr_code      TEXT UNIQUE,                    -- código secreto del QR (picalereplay.com/c/<qr_code>)
  hls_url      TEXT,
  calibration  JSONB,                          -- esquinas de la cancha en la imagen (la manda la mini PC)
  active       BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS ai_edges (           -- mini PC de cada club
  club_id    TEXT PRIMARY KEY,
  last_seen  TIMESTAMPTZ,
  info       JSONB
);

CREATE TABLE IF NOT EXISTS ai_users (           -- copia ligera de quien usa PÍCALE AI (sale de /auth/me)
  user_id    TEXT PRIMARY KEY,
  name       TEXT,
  username   TEXT,
  email      TEXT,
  is_admin   BOOLEAN NOT NULL DEFAULT false,
  last_seen  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_users_username ON ai_users (lower(username));

CREATE TABLE IF NOT EXISTS ai_token_ledger (    -- el saldo es la suma de este historial
  id          BIGSERIAL PRIMARY KEY,
  user_id     TEXT NOT NULL,
  delta       INT NOT NULL,
  reason      TEXT NOT NULL,   -- purchase | session | refund_failed | refund_early | store_refund | promo | admin
  ref         TEXT,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (reason, ref)
);
CREATE INDEX IF NOT EXISTS ai_token_ledger_user ON ai_token_ledger (user_id);

CREATE TABLE IF NOT EXISTS ai_sessions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type               TEXT NOT NULL,               -- match | training
  user_id            TEXT NOT NULL,               -- quien pagó
  court_id           UUID NOT NULL REFERENCES ai_courts(id),
  tokens_spent       INT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'recording',
      -- recording → naming → waiting_video → queued → processing → ready | failed | cancelled
  started_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at            TIMESTAMPTZ NOT NULL,
  finished_at        TIMESTAMPTZ,
  upload_token       TEXT NOT NULL,
  players_named      BOOLEAN NOT NULL DEFAULT false,
  segments_total     INT,
  video_ready        BOOLEAN NOT NULL DEFAULT false,
  progress           REAL,
  error              TEXT,
  result             JSONB,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ai_one_recording_per_court ON ai_sessions (court_id) WHERE status = 'recording';
CREATE UNIQUE INDEX IF NOT EXISTS ai_one_recording_per_user  ON ai_sessions (user_id)  WHERE status = 'recording';
CREATE INDEX IF NOT EXISTS ai_sessions_user ON ai_sessions (user_id, started_at DESC);

CREATE TABLE IF NOT EXISTS ai_session_players (
  session_id     UUID NOT NULL REFERENCES ai_sessions(id) ON DELETE CASCADE,
  track_id       TEXT NOT NULL,          -- A | B | C | D
  user_id        TEXT,
  display_name   TEXT,
  tag_status     TEXT,                   -- NULL | pending | accepted | declined
  stats          JSONB,
  heatmap        BOOLEAN NOT NULL DEFAULT false,
  coach_summary  TEXT,
  coach_note     TEXT,
  PRIMARY KEY (session_id, track_id)
);
CREATE INDEX IF NOT EXISTS ai_session_players_user ON ai_session_players (user_id);

CREATE TABLE IF NOT EXISTS ai_devices (
  token       TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  platform    TEXT NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_clips (           -- clips cortados del partido completo
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL REFERENCES ai_sessions(id) ON DELETE CASCADE,
  user_id     TEXT,                    -- quien lo creó (NULL = automático)
  start_s     REAL NOT NULL,
  end_s       REAL NOT NULL,
  title       TEXT,
  auto        BOOLEAN NOT NULL DEFAULT false,
  status      TEXT NOT NULL DEFAULT 'processing',   -- processing | ready | failed
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_clips_session ON ai_clips (session_id, start_s);
