// Supabase Edge Function: approve-order
// Triggered by photographer saying "Todo ok PD-XXXXXX"
// 1. Marks order as approved
// 2. Searches photos in Supabase Storage bucket "photos"
// 3. Sends photos directly via WhatsApp in batches to avoid blocks
// 4. Notifies photographer when complete

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── BuilderBot Cloud API ──
const sendWhatsAppMessage = async (phone, content, mediaUrl = null) => {
  const botId = Deno.env.get('BUILDERBOT_BOT_ID')
  const apiKey = Deno.env.get('BUILDERBOT_API_KEY')

  const body = {
    messages: { content, ...(mediaUrl ? { mediaUrl } : {}) },
    number: phone,
    checkIfExists: false,
  }

  const res = await fetch(
    `https://app.builderbot.cloud/api/v2/${botId}/messages`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-builderbot': apiKey,
      },
      body: JSON.stringify(body),
    }
  )

  if (!res.ok) {
    console.error(`WhatsApp send failed: ${res.status}`)
  }
  return res.ok
}

// ── Delay helper ──
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms))

// ── Batch config (anti-bloqueo WhatsApp) ──
const getBatchConfig = (totalPhotos) => {
  if (totalPhotos <= 5) return { batchSize: 5, delayBetween: 3000, batchPause: 0 }
  if (totalPhotos <= 10) return { batchSize: 10, delayBetween: 4000, batchPause: 0 }
  if (totalPhotos <= 20) return { batchSize: 10, delayBetween: 4000, batchPause: 60000 }
  if (totalPhotos <= 30) return { batchSize: 10, delayBetween: 4000, batchPause: 90000 }
  return { batchSize: 10, delayBetween: 5000, batchPause: 120000 }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { ticket_code, photographer_phone } = await req.json()

    if (!ticket_code) {
      return new Response(
        JSON.stringify({ error: 'Missing ticket_code' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabase = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    )

    // ── 1. Find order ──
    const { data: order, error: findError } = await supabase
      .from('orders')
      .select('*')
      .eq('ticket_code', ticket_code.toUpperCase())
      .single()

    if (findError || !order) {
      return new Response(
        JSON.stringify({ error: `Order ${ticket_code} not found` }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ── 2. Update status ──
    await supabase
      .from('orders')
      .update({ status: 'sending', approved_at: new Date().toISOString() })
      .eq('id', order.id)

    // ── 3. Get photos from DB ──
    const { data: photos } = await supabase
      .from('order_photos')
      .select('*')
      .eq('order_id', order.id)
      .order('created_at', { ascending: true })

    let photosToSend = photos || []

    // ── 4. If photos don't have storage URLs yet, search in Supabase Storage ──
    const needsSearch = photosToSend.some(p => !p.storage_url)

    if (needsSearch) {
      // Sanitize event name to match storage folder (same logic as panel)
      const slug = order.event_name.trim()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, '_')
        .replace(/[^a-zA-Z0-9_-]/g, '')
        .toLowerCase()
      const folderPath = `events/${slug}`

      // List files in the event folder
      const { data: storageFiles, error: listError } = await supabase
        .storage
        .from('photos')
        .list(folderPath, { limit: 500 })

      if (!listError && storageFiles?.length > 0) {
        for (const photo of photosToSend) {
          // Find matching file in storage
          const match = storageFiles.find(f =>
            f.name.toLowerCase().includes(photo.photo_name.toLowerCase().replace(/\.[^.]+$/, '')) ||
            photo.photo_name.toLowerCase().includes(f.name.toLowerCase().replace(/\.[^.]+$/, ''))
          )

          if (match) {
            const publicUrl = `${supabaseUrl}/storage/v1/object/public/photos/${folderPath}/${match.name}`
            photo.storage_url = publicUrl
            photo.file_size = match.metadata?.size || null

            // Update in DB
            await supabase
              .from('order_photos')
              .update({
                storage_url: publicUrl,
                file_size: match.metadata?.size || null,
              })
              .eq('id', photo.id)
          }
        }
      }
    }

    // Filter to photos we can actually send
    const sendablePhotos = photosToSend.filter(p => p.storage_url)
    const missingPhotos = photosToSend.filter(p => !p.storage_url)
    const totalPhotos = sendablePhotos.length

    if (totalPhotos === 0) {
      // None found — notify client and photographer
      const missingList = missingPhotos.map(p => `• ${p.photo_name}`).join('\n')
      await sendWhatsAppMessage(
        order.client_phone,
        `⚠️ Hola! Lamentablemente no pudimos encontrar las siguientes fotos en nuestra base de datos:\n\n` +
        `${missingList}\n\n` +
        `En breve un asesor te va a contactar para solucionarlo. ¡Disculpá las molestias! 🙏`
      )
      await sendWhatsAppMessage(
        order.photographer_phone || Deno.env.get('PHOTOGRAPHER_PHONE'),
        `⚠️ Pedido ${ticket_code}: No se encontraron fotos en Storage para "${order.event_name}".\n\n` +
        `Fotos no encontradas:\n${missingList}\n\n` +
        `Subí las fotos desde el panel y volvé a aprobar.`
      )
      return new Response(
        JSON.stringify({ error: 'No photos found in storage', missing: missingPhotos.map(p => p.photo_name) }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ── 5. Notify about missing photos (if some found, some not) ──
    if (missingPhotos.length > 0) {
      const missingList = missingPhotos.map(p => `• ${p.photo_name}`).join('\n')
      await sendWhatsAppMessage(
        order.client_phone,
        `⚠️ Algunas fotos no se encontraron en nuestra base de datos:\n\n` +
        `${missingList}\n\n` +
        `En breve un asesor te va a contactar para solucionarlo.\n` +
        `Mientras tanto, te enviamos las ${totalPhotos} que sí encontramos 👇`
      )
      await sendWhatsAppMessage(
        order.photographer_phone || Deno.env.get('PHOTOGRAPHER_PHONE'),
        `⚠️ Pedido ${ticket_code}: Fotos parcialmente encontradas.\n` +
        `✅ Encontradas: ${totalPhotos}\n❌ No encontradas:\n${missingList}`
      )
      await delay(2000)
    }

    // ── 6. Send intro message ──
    await sendWhatsAppMessage(
      order.client_phone,
      `📸 ¡Tus fotos de "${order.event_name}" están listas!\n\nTe envío ${totalPhotos} foto${totalPhotos > 1 ? 's' : ''} a continuación ⬇️`
    )
    await delay(2000)

    // ── 6. Send photos in batches ──
    const config = getBatchConfig(totalPhotos)
    let sentCount = 0
    const totalBatches = Math.ceil(totalPhotos / config.batchSize)

    for (let i = 0; i < totalPhotos; i += config.batchSize) {
      const batch = sendablePhotos.slice(i, i + config.batchSize)
      const batchEnd = Math.min(i + config.batchSize, totalPhotos)

      // Progress message for multi-batch
      if (totalBatches > 1) {
        await sendWhatsAppMessage(
          order.client_phone,
          `📸 Enviando fotos (${i + 1}-${batchEnd} de ${totalPhotos})...`
        )
        await delay(1500)
      }

      // Send each photo
      for (const photo of batch) {
        const sent = await sendWhatsAppMessage(
          order.client_phone,
          `📷 ${photo.photo_name}`,
          photo.storage_url
        )

        if (sent) {
          sentCount++
          await supabase
            .from('order_photos')
            .update({ sent_via_whatsapp: true })
            .eq('id', photo.id)
        }

        await delay(config.delayBetween)
      }

      // Pause between batches
      if (i + config.batchSize < totalPhotos && config.batchPause > 0) {
        await delay(config.batchPause)
      }
    }

    // ── 7. Completion ──
    await delay(2000)
    await sendWhatsAppMessage(
      order.client_phone,
      `✅ ¡Listo! Te envié ${sentCount} foto${sentCount > 1 ? 's' : ''}.\n¡Disfrutalas! ✨`
    )

    // ── 8. Update status ──
    await supabase
      .from('orders')
      .update({
        status: 'delivered',
        whatsapp_sent: true,
        download_count: sentCount,
        delivered_at: new Date().toISOString(),
      })
      .eq('id', order.id)

    // ── 9. Notify photographer ──
    await sendWhatsAppMessage(
      order.photographer_phone || Deno.env.get('PHOTOGRAPHER_PHONE'),
      `✅ Pedido ${ticket_code} entregado\n${sentCount}/${totalPhotos} fotos enviadas\nEvento: ${order.event_name}`
    )

    return new Response(
      JSON.stringify({
        success: true,
        ticket_code,
        photos_sent: sentCount,
        photos_total: totalPhotos,
        batches_used: totalBatches,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('approve-order error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
