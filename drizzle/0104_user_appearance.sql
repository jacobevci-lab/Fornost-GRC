CREATE TABLE IF NOT EXISTS user_appearance (
  user_id TEXT PRIMARY KEY NOT NULL,
  palette TEXT NOT NULL DEFAULT 'default'
);
