// Deploy process-order Edge Function via Management API
import fs from 'fs'

const NEW_MGMT_TOKEN = 'sbp_f9d0cfe09cc1fc2fd9fdacfea8f6a987b6644977'
const PROJECT_REF = 'pxvhovctyewwppwkldaq'

async function deploy(functionSlug, filePath) {
  console.log(`🚀 Deploying ${functionSlug}...`)
  
  const code = fs.readFileSync(filePath, 'utf8')
  
  // Create FormData with the function code as a file
  // Supabase expects an ESZip or a multipart form with the source
  const boundary = '----FormBoundary' + Date.now()
  
  // For Supabase Management API, we use import_map approach
  // Actually, the API expects the body as an eszip bundle or we can use the source directly
  
  // Method: Use the body-based deploy
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/functions/${functionSlug}/body`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${NEW_MGMT_TOKEN}`,
      'Content-Type': 'application/x-eszip',
    },
    body: code
  })
  
  console.log(`   Status: ${res.status} ${res.statusText}`)
  
  if (!res.ok) {
    // Try multipart form upload
    console.log('   Trying multipart form upload...')
    
    const formBody = `--${boundary}\r\nContent-Disposition: form-data; name="source"; filename="index.ts"\r\nContent-Type: application/typescript\r\n\r\n${code}\r\n--${boundary}--`
    
    const res2 = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/functions/${functionSlug}/body`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${NEW_MGMT_TOKEN}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body: formBody
    })
    
    console.log(`   Multipart Status: ${res2.status}`)
    const text2 = await res2.text()
    console.log(`   Response: ${text2.substring(0, 300)}`)
  } else {
    const text = await res.text()
    console.log(`   ✅ Deployed successfully`)
    console.log(`   Response: ${text.substring(0, 200)}`)
  }
}

async function main() {
  await deploy('process-order', './supabase/functions/process-order/index.ts')
}

main().catch(console.error)
