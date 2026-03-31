// Script de recuperación masiva: mapea storage_url para todos los pedidos
// pendientes de Ironman 70.3 San Juan. NO envía nada por WhatsApp.
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_KEY
)

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const FOLDER_PATH = 'events/ironman-70-3-san-juan' // slug real del storage

async function run() {
  console.log('🔍 Buscando pedidos pendientes de Ironman 70.3 San Juan...\n')

  // 1. Traer todos los pedidos del Ironman con sus fotos
  const { data: orders, error } = await supabase
    .from('orders')
    .select('*, order_photos(*)')
    .eq('event_name', 'Ironman 70.3 San Juan')
    .eq('status', 'awaiting_payment')
    .order('created_at', { ascending: true })

  if (error) {
    console.error('❌ Error al buscar pedidos:', error.message)
    return
  }

  console.log(`📋 Encontrados ${orders.length} pedidos pendientes\n`)

  let totalPhotos = 0
  let mapped = 0
  let notFound = 0
  let alreadyMapped = 0
  const missingList = []

  for (const order of orders) {
    const photos = order.order_photos || []
    console.log(`\n── ${order.ticket_code} | ${order.client_name || order.client_phone} | ${photos.length} fotos ──`)

    for (const photo of photos) {
      totalPhotos++

      // Si ya tiene URL, skip
      if (photo.storage_url) {
        console.log(`  ✅ ${photo.photo_name} → ya mapeada`)
        alreadyMapped++
        continue
      }

      // Buscar en storage
      const searchTerm = photo.photo_name.toLowerCase().replace(/\.[^.]+$/, '')

      const { data: searchResults, error: searchError } = await supabase
        .storage
        .from('photos')
        .list(FOLDER_PATH, { limit: 10, search: searchTerm })

      if (searchError) {
        console.log(`  ❌ ${photo.photo_name} → error de búsqueda: ${searchError.message}`)
        notFound++
        missingList.push({ ticket: order.ticket_code, photo: photo.photo_name, reason: 'search_error' })
        continue
      }

      if (!searchResults || searchResults.length === 0) {
        console.log(`  ⚠️  ${photo.photo_name} → NO encontrada en storage`)
        notFound++
        missingList.push({ ticket: order.ticket_code, photo: photo.photo_name, reason: 'not_in_storage' })
        continue
      }

      // Buscar match exacto
      const match = searchResults.find(f =>
        f.name.toLowerCase().includes(searchTerm) ||
        searchTerm.includes(f.name.toLowerCase().replace(/\.[^.]+$/, ''))
      )

      if (!match) {
        console.log(`  ⚠️  ${photo.photo_name} → búsqueda devolvió resultados pero ninguno matchea`)
        notFound++
        missingList.push({ ticket: order.ticket_code, photo: photo.photo_name, reason: 'no_match', candidates: searchResults.map(f => f.name) })
        continue
      }

      // Construir URL pública y actualizar DB
      const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/photos/${FOLDER_PATH}/${match.name}`

      const { error: updateError } = await supabase
        .from('order_photos')
        .update({
          storage_url: publicUrl,
          file_size: match.metadata?.size || null,
        })
        .eq('id', photo.id)

      if (updateError) {
        console.log(`  ❌ ${photo.photo_name} → encontrada pero error al guardar: ${updateError.message}`)
        notFound++
        continue
      }

      console.log(`  ✅ ${photo.photo_name} → ${match.name} ✓`)
      mapped++
    }
  }

  // Resumen
  console.log('\n\n════════════════════════════════════')
  console.log('📊 RESUMEN DE RECUPERACIÓN')
  console.log('════════════════════════════════════')
  console.log(`  Pedidos procesados:   ${orders.length}`)
  console.log(`  Fotos totales:        ${totalPhotos}`)
  console.log(`  Ya mapeadas:          ${alreadyMapped}`)
  console.log(`  Mapeadas ahora:       ${mapped}`)
  console.log(`  No encontradas:       ${notFound}`)
  console.log('════════════════════════════════════\n')

  if (missingList.length > 0) {
    console.log('⚠️  Fotos no encontradas:')
    missingList.forEach(m => {
      console.log(`  - ${m.ticket} → "${m.photo}" (${m.reason})${m.candidates ? ' candidatos: ' + m.candidates.join(', ') : ''}`)
    })
  }
}

run().catch(console.error)
