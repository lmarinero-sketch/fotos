// Test del parser localmente
const parseClientMessage = (rawMessage) => {
  const cleanMsg = rawMessage.replace(/\*/g, '').trim()
  const lines = cleanMsg.split('\n').map(l => l.trim()).filter(l => l.length > 0)
  
  console.log('Lines after cleaning:')
  lines.forEach((l, i) => console.log(`  [${i}] "${l}" → endsWith(':')=${l.endsWith(':')} startsWith('-')=${l.startsWith('-')}`))
  
  let eventName = ''
  const photos = []
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.startsWith('-')) {
      photos.push(line.substring(1).trim())
    } else if (line.endsWith(':')) {
      const candidate = line.substring(0, line.length - 1).trim()
      console.log(`  → Candidate event: "${candidate}"`)
      console.log(`    includes('misfotos.click'): ${candidate.toLowerCase().includes('misfotos.click')}`)
      console.log(`    includes('me interesan estas fotos'): ${candidate.toLowerCase().includes('me interesan estas fotos')}`)
      console.log(`    === 'son en total': ${candidate.toLowerCase() === 'son en total'}`)
      
      if (candidate.toLowerCase() !== 'son en total' && 
          !candidate.toLowerCase().includes('misfotos.click') &&
          !candidate.toLowerCase().includes('me interesan estas fotos')) {
        eventName = candidate
        console.log(`    ✅ ACCEPTED as event name: "${eventName}"`)
      } else {
        console.log(`    ❌ REJECTED`)
      }
    }
  }
  
  return { eventName, photos }
}

// Test WITHOUT asterisks (how it fails)
console.log('\n=== TEST 1: Sin asteriscos ===')
const msg1 = 'Hola! Estoy en misfotos.click me interesan estas fotos:\n\nTest2:\n- AND_0001.jpg\n- AND_0003.jpg\n\nSon en total:\n2 fotos.\nGracias!'
const r1 = parseClientMessage(msg1)
console.log('\nResult:', r1)

console.log('\n\n=== TEST 2: Con asteriscos ===')
const msg2 = '*Hola! Estoy en misfotos.click me interesan estas fotos:*\n\n*Test2:*\n- AND_0001.jpg\n- AND_0003.jpg\n\n*Son en total:*\n2 fotos.\n*Gracias!*'
const r2 = parseClientMessage(msg2)
console.log('\nResult:', r2)
