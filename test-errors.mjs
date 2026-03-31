import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

async function run() {
  const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
  const { data, error } = await sb.from('system_errors').select('*').order('created_at', { ascending: false }).limit(3);
  console.log("ERRORS:", JSON.stringify(data, null, 2));
}

run();
