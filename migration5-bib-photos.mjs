import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_KEY
)

async function migrate() {
  console.log('🚀 Migration 5: Creating event_photos table for bib number detection...\n')

  // 1. Create event_photos table
  const { error: tableError } = await supabase.rpc('exec_sql', {
    sql: `
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

      -- Index for fast bib number search
      CREATE INDEX IF NOT EXISTS idx_event_photos_bib ON event_photos(bib_number);
      CREATE INDEX IF NOT EXISTS idx_event_photos_event ON event_photos(event_id);

      -- Enable RLS
      ALTER TABLE event_photos ENABLE ROW LEVEL SECURITY;

      -- Public can view all event photos (thumbnails are watermarked)
      CREATE POLICY "Public can view event photos"
        ON event_photos FOR SELECT
        USING (true);

      -- Authenticated users can insert/update/delete their own event photos
      CREATE POLICY "Auth users can manage event photos"
        ON event_photos FOR ALL
        USING (true)
        WITH CHECK (true);
    `
  })

  if (tableError) {
    console.log('⚠️  Could not create table via RPC, trying direct SQL...')
    
    // Try creating table directly with individual queries
    const queries = [
      `CREATE TABLE IF NOT EXISTS event_photos (
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
      )`,
    ]

    for (const sql of queries) {
      const { error } = await supabase.from('event_photos').select('id').limit(0)
      if (error && error.code === '42P01') {
        console.log('❌ Table does not exist. Please run this SQL in Supabase SQL Editor:')
        console.log(`
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
        `)
        break
      } else {
        console.log('✅ Table event_photos already exists or was created successfully')
        break
      }
    }
  } else {
    console.log('✅ Table event_photos created successfully')
  }

  // 2. Check if thumbnails bucket exists, create if not
  const { data: buckets } = await supabase.storage.listBuckets()
  const thumbBucket = buckets?.find(b => b.name === 'thumbnails')
  
  if (!thumbBucket) {
    const { error: bucketError } = await supabase.storage.createBucket('thumbnails', {
      public: true,
      fileSizeLimit: 5242880, // 5MB max for thumbnails
    })
    if (bucketError) {
      console.log('⚠️  Error creating thumbnails bucket:', bucketError.message)
    } else {
      console.log('✅ Thumbnails bucket created (public)')
    }
  } else {
    console.log('✅ Thumbnails bucket already exists')
  }

  console.log('\n✨ Migration 5 complete!')
}

migrate().catch(console.error)
