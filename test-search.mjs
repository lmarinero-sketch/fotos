import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import 'dotenv/config'

async function run() {
  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY
  );

  const { data, error } = await supabase.storage.from('photos').list('events', { search: 'JER', limit: 2 })
  console.log(data, error)
}
run()
