// Test: ¿La Edge Function rechaza llamadas sin Authorization header?
const SUPABASE_URL = 'https://pxvhovctyewwppwkldaq.supabase.co'
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB4dmhvdmN0eWV3d3Bwd2tsZGFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY3MTY3NDQsImV4cCI6MjA4MjI5Mjc0NH0.-fHvp3Rs4RFcBD87_SYLA2xFw756_VSdkWhy0Q1ekNo'

async function main() {
  // Test 1: Sin Authorization header (como lo hace BuilderBot)
  console.log('🧪 Test 1: SIN Authorization header (como BuilderBot)')
  const res1 = await fetch(`${SUPABASE_URL}/functions/v1/process-order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ eventName: 'test', data: { body: 'ping', from: '000' } })
  })
  console.log(`   Status: ${res1.status} ${res1.statusText}`)
  const text1 = await res1.text()
  console.log(`   Response: ${text1.substring(0, 200)}`)

  // Test 2: Con Authorization header
  console.log('\n🧪 Test 2: CON Authorization header')
  const res2 = await fetch(`${SUPABASE_URL}/functions/v1/process-order`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ANON_KEY}`
    },
    body: JSON.stringify({ eventName: 'test', data: { body: 'ping', from: '000' } })
  })
  console.log(`   Status: ${res2.status} ${res2.statusText}`)
  const text2 = await res2.text()
  console.log(`   Response: ${text2.substring(0, 200)}`)
}

main().catch(console.error)
