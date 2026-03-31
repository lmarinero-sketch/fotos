-- Corre este SQL en tu panel de Supabase (SQL Editor) -> New Query -> Run
-- Tabla para el historial de chat del CRM

CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT NOT NULL,
  name TEXT,
  direction TEXT NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
  body TEXT,
  media_url TEXT,
  attachment JSONB,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_phone ON chat_messages(phone);
CREATE INDEX IF NOT EXISTS idx_chat_created ON chat_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_unread ON chat_messages(phone, is_read) WHERE direction = 'incoming' AND is_read = false;

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for chat_messages"
  ON chat_messages FOR ALL
  USING (true)
  WITH CHECK (true);
