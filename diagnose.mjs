// Diagnóstico completo del sistema JERPRO
// Chequea: Supabase Management API, Edge Functions, BuilderBot API

const SUPABASE_URL = 'https://pxvhovctyewwppwkldaq.supabase.co'
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB4dmhvdmN0eWV3d3Bwd2tsZGFxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjcxNjc0NCwiZXhwIjoyMDgyMjkyNzQ0fQ.nQhpJ6t4KSn-uLlD1vTL_UzFVfgwal3yS4bN7WJpg3w'
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB4dmhvdmN0eWV3d3Bwd2tsZGFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY3MTY3NDQsImV4cCI6MjA4MjI5Mjc0NH0.-fHvp3Rs4RFcBD87_SYLA2xFw756_VSdkWhy0Q1ekNo'

// OLD and NEW management tokens
const OLD_MGMT_TOKEN = 'sbp_652501246151de5fe3cb95fb04f7f3f7f2a4900a'
const NEW_MGMT_TOKEN = 'sbp_f9d0cfe09cc1fc2fd9fdacfea8f6a987b6644977'
const PROJECT_REF = 'pxvhovctyewwppwkldaq'

// BuilderBot
const BOT_ID = 'f5f7490e-9308-494f-ba24-82846175f37c'
const BB_API_KEY = 'bb-239c34ff-5eb4-41c4-84c4-ca1d284f852f'

const sep = () => console.log('\n' + '═'.repeat(60))

async function main() {
  console.log('🩺 DIAGNÓSTICO COMPLETO DEL SISTEMA JERPRO')
  console.log('═'.repeat(60))

  // ── 1. Test Management API con OLD token ──
  sep()
  console.log('1️⃣  Management API — Token VIEJO')
  try {
    const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}`, {
      headers: { 'Authorization': `Bearer ${OLD_MGMT_TOKEN}` }
    })
    console.log(`   Status: ${res.status} ${res.statusText}`)
    if (!res.ok) {
      console.log('   ❌ Token viejo YA NO FUNCIONA (expirado/revocado)')
    } else {
      console.log('   ✅ Token viejo sigue activo')
    }
  } catch (e) {
    console.log('   ❌ Error:', e.message)
  }

  // ── 2. Test Management API con NEW token ──
  sep()
  console.log('2️⃣  Management API — Token NUEVO')
  try {
    const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}`, {
      headers: { 'Authorization': `Bearer ${NEW_MGMT_TOKEN}` }
    })
    console.log(`   Status: ${res.status} ${res.statusText}`)
    if (res.ok) {
      const data = await res.json()
      console.log(`   ✅ Token nuevo FUNCIONA — Proyecto: ${data.name}`)
    } else {
      const text = await res.text()
      console.log(`   ❌ Token nuevo NO funciona: ${text.substring(0, 200)}`)
    }
  } catch (e) {
    console.log('   ❌ Error:', e.message)
  }

  // ── 3. Test Supabase DB (anon key) ──
  sep()
  console.log('3️⃣  Supabase Database — Anon Key')
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/orders?select=id,ticket_code,status&limit=3`, {
      headers: {
        'apikey': ANON_KEY,
        'Authorization': `Bearer ${ANON_KEY}`,
      }
    })
    console.log(`   Status: ${res.status}`)
    if (res.ok) {
      const data = await res.json()
      console.log(`   ✅ DB accesible — ${data.length} orders devueltas`)
      data.forEach(o => console.log(`      - ${o.ticket_code} → ${o.status}`))
    } else {
      console.log(`   ❌ Error:`, await res.text())
    }
  } catch (e) {
    console.log('   ❌ Error:', e.message)
  }

  // ── 4. Test Supabase DB (service key) ──
  sep()
  console.log('4️⃣  Supabase Database — Service Role Key')
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/events?select=id,name,slug&limit=3`, {
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
      }
    })
    console.log(`   Status: ${res.status}`)
    if (res.ok) {
      const data = await res.json()
      console.log(`   ✅ DB accesible con service key — ${data.length} events`)
      data.forEach(e => console.log(`      - ${e.name} (${e.slug})`))
    } else {
      console.log(`   ❌ Error:`, await res.text())
    }
  } catch (e) {
    console.log('   ❌ Error:', e.message)
  }

  // ── 5. Test Edge Function: process-order (ping) ──
  sep()
  console.log('5️⃣  Edge Function: process-order (ping)')
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/process-order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ANON_KEY}`,
      },
      body: JSON.stringify({
        eventName: 'test.ping',
        data: { body: 'test ping - no trigger', from: '0000000000' }
      })
    })
    console.log(`   Status: ${res.status}`)
    const body = await res.json()
    console.log(`   Response:`, JSON.stringify(body, null, 2).substring(0, 300))
    
    if (res.ok && body.skip) {
      console.log('   ✅ Edge Function ESTÁ ACTIVA y respondió correctamente (skip porque no matchea trigger)')
    } else if (res.status === 500) {
      console.log('   ❌ Edge Function tiene un ERROR INTERNO')
    } else if (res.status === 404) {
      console.log('   ❌ Edge Function NO ESTÁ DEPLOYADA')
    } else {
      console.log('   ⚠️  Respuesta inesperada')
    }
  } catch (e) {
    console.log('   ❌ Error:', e.message)
  }

  // ── 6. Test Edge Function secrets (env vars) ──
  sep()
  console.log('6️⃣  Edge Function Secrets (Variables de entorno)')
  try {
    const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/secrets`, {
      headers: { 'Authorization': `Bearer ${NEW_MGMT_TOKEN}` }
    })
    console.log(`   Status: ${res.status}`)
    if (res.ok) {
      const data = await res.json()
      const secretNames = data.map(s => s.name)
      console.log(`   Secrets configurados (${secretNames.length}):`)
      secretNames.forEach(n => console.log(`      ✦ ${n}`))
      
      // Check required secrets
      const required = ['BUILDERBOT_BOT_ID', 'BUILDERBOT_API_KEY', 'PHOTOGRAPHER_PHONE', 'PAYMENT_CBU', 'PAYMENT_ALIAS', 'PAYMENT_BANCO', 'PAYMENT_HOLDER', 'PRICE_PER_PHOTO']
      const missing = required.filter(r => !secretNames.includes(r))
      if (missing.length > 0) {
        console.log(`\n   ⚠️  SECRETS FALTANTES:`)
        missing.forEach(m => console.log(`      ❌ ${m}`))
      } else {
        console.log('\n   ✅ Todos los secrets requeridos están configurados')
      }
    } else {
      const text = await res.text()
      console.log(`   ❌ No se pudo leer los secrets: ${text.substring(0, 200)}`)
    }
  } catch (e) {
    console.log('   ❌ Error:', e.message)
  }

  // ── 7. List Edge Functions deployadas ──
  sep()
  console.log('7️⃣  Edge Functions Deployadas')
  try {
    const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/functions`, {
      headers: { 'Authorization': `Bearer ${NEW_MGMT_TOKEN}` }
    })
    console.log(`   Status: ${res.status}`)
    if (res.ok) {
      const data = await res.json()
      if (data.length === 0) {
        console.log('   ❌ NO HAY EDGE FUNCTIONS DEPLOYADAS — Este es probablemente el problema!')
      } else {
        console.log(`   ${data.length} funciones:`)
        data.forEach(f => console.log(`      ✦ ${f.slug} — status: ${f.status} — updated: ${f.updated_at || 'n/a'}`))
      }
    } else {
      console.log(`   ❌ Error:`, await res.text())
    }
  } catch (e) {
    console.log('   ❌ Error:', e.message)
  }

  // ── 8. Test BuilderBot API ──
  sep()
  console.log('8️⃣  BuilderBot Cloud API')
  try {
    // Just verify the bot exists by checking its status
    const res = await fetch(`https://app.builderbot.cloud/api/v2/${BOT_ID}`, {
      headers: { 'x-api-builderbot': BB_API_KEY }
    })
    console.log(`   Status: ${res.status}`)
    const text = await res.text()
    console.log(`   Response: ${text.substring(0, 300)}`)
    
    if (res.ok) {
      console.log('   ✅ BuilderBot API accesible')
    } else {
      console.log('   ⚠️  BuilderBot respondió con error')
    }
  } catch (e) {
    console.log('   ❌ Error:', e.message)
  }

  // ── 9. Check system_errors table ──
  sep()
  console.log('9️⃣  System Errors (últimos 5)')
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/system_errors?select=*&order=created_at.desc&limit=5`, {
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
      }
    })
    if (res.ok) {
      const data = await res.json()
      if (data.length === 0) {
        console.log('   ✅ Sin errores registrados')
      } else {
        data.forEach(e => {
          console.log(`\n   ⚠️  ${e.created_at} | ${e.error_source}`)
          console.log(`      ${e.error_message}`)
          if (e.payload) console.log(`      Payload: ${JSON.stringify(e.payload).substring(0, 150)}`)
        })
      }
    } else {
      // Table might not exist
      console.log(`   ⚠️  Table might not exist: ${res.status}`)
    }
  } catch (e) {
    console.log('   ❌ Error:', e.message)
  }

  sep()
  console.log('\n🏁 DIAGNÓSTICO COMPLETO\n')
}

main().catch(console.error)
