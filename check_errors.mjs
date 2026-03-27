import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://pxvhovctyewwppwkldaq.supabase.co'
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB4dmhvdmN0eWV3d3Bwd2tsZGFxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjcxNjc0NCwiZXhwIjoyMDgyMjkyNzQ0fQ.nQhpJ6t4KSn-uLlD1vTL_UzFVfgwal3yS4bN7WJpg3w'

const supabase = createClient(supabaseUrl, supabaseKey)

async function check() {
  const { data, error } = await supabase.from('system_errors').select('*').order('created_at', { ascending: false }).limit(5)
  console.log("Errors:", data)
}
check()
