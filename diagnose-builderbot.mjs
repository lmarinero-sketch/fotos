// Diagnóstico detallado de BuilderBot
// Prueba distintos endpoints de la API de BuilderBot para entender qué está pasando

const BOT_ID = 'f5f7490e-9308-494f-ba24-82846175f37c'
const BB_API_KEY = 'bb-239c34ff-5eb4-41c4-84c4-ca1d284f852f'
const BB_BASE = 'https://app.builderbot.cloud/api/v2'

const sep = () => console.log('\n' + '─'.repeat(50))

async function tryEndpoint(label, url, options = {}) {
  console.log(`\n🔍 ${label}`)
  console.log(`   URL: ${url}`)
  try {
    const res = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        'x-api-builderbot': BB_API_KEY,
        ...options.headers
      },
      ...options
    })
    console.log(`   Status: ${res.status} ${res.statusText}`)
    const text = await res.text()
    // Try to parse as JSON
    try {
      const json = JSON.parse(text)
      console.log(`   Response:`, JSON.stringify(json, null, 2).substring(0, 500))
    } catch {
      console.log(`   Response (raw): ${text.substring(0, 500)}`)
    }
    return res.status
  } catch (e) {
    console.log(`   ❌ Error: ${e.message}`)
    return 0
  }
}

async function main() {
  console.log('🤖 DIAGNÓSTICO BUILDERBOT CLOUD')
  console.log('═'.repeat(50))

  // 1. Ping base API
  await tryEndpoint('API Base', `${BB_BASE}`)
  
  // 2. Check bot info
  await tryEndpoint('Bot Info', `${BB_BASE}/${BOT_ID}`)

  // 3. Check bot status/health
  await tryEndpoint('Bot Status', `${BB_BASE}/${BOT_ID}/status`)

  // 4. Check bot config
  await tryEndpoint('Bot Config', `${BB_BASE}/${BOT_ID}/config`)

  // 5. Check webhooks
  await tryEndpoint('Bot Webhooks', `${BB_BASE}/${BOT_ID}/webhooks`)

  // 6. Try to list messages
  await tryEndpoint('Bot Messages (GET)', `${BB_BASE}/${BOT_ID}/messages`)

  // 7. Try sending a test message (dry run — to non-existent number to see format)
  sep()
  console.log('\n🧪 Simulación de envío de mensaje (a número de test)')
  await tryEndpoint('Send Message (test)', `${BB_BASE}/${BOT_ID}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      messages: { content: 'TEST DIAGNÓSTICO - ignorar' },
      number: '0000000000',
      checkIfExists: false,
    })
  })

  // 8. Try v1 endpoints as fallback
  sep()
  console.log('\n📡 Probando endpoints alternativos (v1)')
  await tryEndpoint('V1 Bot Info', `https://app.builderbot.cloud/api/v1/${BOT_ID}`)
  await tryEndpoint('V1 Messages', `https://app.builderbot.cloud/api/v1/${BOT_ID}/messages`)

  // 9. Check what webhook URL BuilderBot should be calling
  sep()
  console.log('\n📋 CONFIGURACIÓN ESPERADA:')
  console.log(`   BuilderBot debería tener configurado este webhook:`)
  console.log(`   URL: https://pxvhovctyewwppwkldaq.supabase.co/functions/v1/process-order`)
  console.log(`   Método: POST`)
  console.log(`   Evento: message.incoming`)
  console.log()
  console.log(`   ⚠️  Si el webhook NO está configurado en BuilderBot,`)
  console.log(`   los mensajes de WhatsApp no llegarán a process-order.`)
  console.log(`   Verificá en: https://app.builderbot.cloud → Tu bot → Webhooks/Settings`)
  
  sep()
  console.log('\n🏁 DIAGNÓSTICO BUILDERBOT COMPLETO\n')
}

main().catch(console.error)
