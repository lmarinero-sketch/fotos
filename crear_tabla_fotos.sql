-- Corre este SQL en tu panel de Supabase (SQL Editor) -> New Query -> Run

CREATE TABLE IF NOT EXISTS event_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  original_path TEXT NOT NULL,
  thumbnail_path TEXT,
  bib_number TEXT,
  detected_text TEXT,
  detection_confidence TEXT DEFAULT 'none',
  width INTEGER,
  height INTEGER,
  file_size BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_photos_bib ON event_photos(bib_number);
CREATE INDEX IF NOT EXISTS idx_event_photos_event ON event_photos(event_id);

ALTER TABLE event_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view event photos"
  ON event_photos FOR SELECT
  USING (true);

CREATE POLICY "Auth users can manage event photos"
  ON event_photos FOR ALL
  USING (true)
  WITH CHECK (true);
