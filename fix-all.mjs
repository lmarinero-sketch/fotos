import fs from 'fs';

const MGMT_TOKEN = 'sbp_f9d0cfe09cc1fc2fd9fdacfea8f6a987b6644977'
const PROJECT_REF = 'pxvhovctyewwppwkldaq'

async function runSQL(label, sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${MGMT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  })
  const text = await res.text()
  console.log(`${res.ok ? '✅' : '❌'} ${label}`, text.substring(0, 150))
}

async function main() {
  console.log('🔧 Fixing Storage and DB Policies...\n');

  // Drop if exist just to be safe
  await runSQL('Drop existing thumbnail policies', `
    DROP POLICY IF EXISTS "Allow authenticated uploads to thumbnails bucket" ON storage.objects;
    DROP POLICY IF EXISTS "Allow authenticated updates to thumbnails bucket" ON storage.objects;
    DROP POLICY IF EXISTS "Allow public read of thumbnails bucket" ON storage.objects;
    DROP POLICY IF EXISTS "Allow authenticated deletes from thumbnails bucket" ON storage.objects;
  `);

  // Fix Policies for bucket 'thumbnails'
  await runSQL('Thumbnails Insert Policy', `
    CREATE POLICY "Allow authenticated uploads to thumbnails bucket" 
    ON storage.objects FOR INSERT TO authenticated 
    WITH CHECK (bucket_id = 'thumbnails');
  `);

  await runSQL('Thumbnails Update Policy', `
    CREATE POLICY "Allow authenticated updates to thumbnails bucket" 
    ON storage.objects FOR UPDATE TO authenticated 
    USING (bucket_id = 'thumbnails');
  `);

  await runSQL('Thumbnails Public Select Policy', `
    CREATE POLICY "Allow public read of thumbnails bucket" 
    ON storage.objects FOR SELECT TO public 
    USING (bucket_id = 'thumbnails');
  `);

  await runSQL('Thumbnails Delete Policy', `
    CREATE POLICY "Allow authenticated deletes from thumbnails bucket" 
    ON storage.objects FOR DELETE TO authenticated 
    USING (bucket_id = 'thumbnails');
  `);
  
  // Create table
  const sqlContent = fs.readFileSync('crear_tabla_fotos.sql', 'utf-8');
  await runSQL('Create event_photos table', sqlContent);

  console.log('\\n✨ All permissions fixed automatically!');
}

main().catch(console.error);
