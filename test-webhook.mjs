// Test más detallado del parsing
const SUPABASE_URL = 'https://pxvhovctyewwppwkldaq.supabase.co'
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB4dmhvdmN0eWV3d3Bwd2tsZGFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY3MTY3NDQsImV4cCI6MjA4MjI5Mjc0NH0.-fHvp3Rs4RFcBD87_SYLA2xFw756_VSdkWhy0Q1ekNo'

async function test(label, payload) {
  console.log(`\n${'═'.repeat(50)}`)
  console.log(`🧪 ${label}`)
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/process-order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ANON_KEY}`,
      },
      body: JSON.stringify(payload)
    })
    const body = await res.json()
    console.log(`   Status: ${res.status}`)
    console.log(`   Response:`, JSON.stringify(body, null, 2))
    return { status: res.status, body }
  } catch (e) {
    console.log(`   ❌ Error:`, e.message)
    return null
  }
}

async function main() {
  console.log('🧪 TESTING PROCESS-ORDER EDGE FUNCTION')
  
  // Test 1: Exact format BuilderBot should send
  await test('BuilderBot format (message.incoming)', {
    eventName: 'message.incoming',
    data: {
      body: 'Hola! Estoy en misfotos.click me interesan estas fotos:\n\nTest2:\n- AND_0001.jpg\n- AND_0003.jpg\n\nSon en total:\n2 fotos.\nGracias!',
      from: '5491100000000',
      name: 'Test User'
    }
  })

  // Test 2: With asterisks (WhatsApp bold formatting)
  await test('Con asteriscos (formato WhatsApp)', {
    eventName: 'message.incoming',
    data: {
      body: '*Hola! Estoy en misfotos.click me interesan estas fotos:*\n\n*Test2:*\n- AND_0001.jpg\n- AND_0003.jpg\n\n*Son en total:*\n2 fotos.\n*Gracias!*',
      from: '5491100000000',
      name: 'Test User'
    }
  })

  // Test 3: Alternative body field names
  await test('Campo message en vez de data.body', {
    message: '*Hola! Estoy en misfotos.click me interesan estas fotos:*\n\n*Test2:*\n- AND_0001.jpg\n- AND_0003.jpg\n\n*Son en total:*\n2 fotos.\n*Gracias!*',
    phone: '5491100000000'
  })

  // Test 4: Check what might be the actual BuilderBot Cloud format
  await test('Formato data.message', {
    eventName: 'message.incoming', 
    data: {
      message: '*Hola! Estoy en misfotos.click me interesan estas fotos:*\n\n*Test2:*\n- AND_0001.jpg\n- AND_0003.jpg\n\n*Son en total:*\n2 fotos.\n*Gracias!*',
      from: '5491100000000',
      name: 'Test User'
    }
  })

  console.log('\n\n✅ Tests completados')
}

main().catch(console.error)
