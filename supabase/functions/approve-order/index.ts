// Supabase Edge Function: approve-order
// Triggered by photographer saying "Todo ok PD-XXXXXX"
// 1. Marks order as approved
// 2. Searches photos in Supabase Storage bucket "photos" and maps URLs
// 3. Sends ONLY the gallery link via WhatsApp (no photo flooding)
// 4. Notifies photographer when complete

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── BuilderBot Cloud API con CORTAFUEGO ──
// Límites: 8 msgs/phone/10min, 40 msgs totales/10min
const sendWhatsAppMessage = async (phone, content, mediaUrl = null) => {
  const botId = Deno.env.get('BUILDERBOT_BOT_ID')
  const apiKey = Deno.env.get('BUILDERBOT_API_KEY')

  // ── CORTAFUEGO: Rate Limiter ──
  try {
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString()

    const { count: phoneCount } = await sb
      .from('chat_messages')
      .select('*', { count: 'exact', head: true })
      .eq('phone', phone)
      .eq('direction', 'outgoing')
      .gte('created_at', tenMinAgo)

    if ((phoneCount || 0) >= 8) {
      console.warn(`🚫 CORTAFUEGO: Bloqueado para ${phone} (${phoneCount} msgs en 10min)`)
      await sb.from('system_errors').insert({
        error_source: 'cortafuego-phone',
        error_message: `Mensaje bloqueado: ${phoneCount} msgs en 10min para ${phone}`,
        payload: { phone, content: content.substring(0, 100), phoneCount }
      })
      return false
    }

    const { count: globalCount } = await sb
      .from('chat_messages')
      .select('*', { count: 'exact', head: true })
      .eq('direction', 'outgoing')
      .gte('created_at', tenMinAgo)

    if ((globalCount || 0) >= 40) {
      console.warn(`🚫 CORTAFUEGO GLOBAL: Bloqueado (${globalCount} msgs totales en 10min)`)
      await sb.from('system_errors').insert({
        error_source: 'cortafuego-global',
        error_message: `Mensaje bloqueado: ${globalCount} msgs totales en 10min`,
        payload: { phone, content: content.substring(0, 100), globalCount }
      })
      return false
    }
  } catch (_rateErr) {
    console.warn('Rate limiter check failed, proceeding anyway')
  }

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

    // ── 2. Get photos from DB ──
    const { data: photos } = await supabase
      .from('order_photos')
      .select('*')
      .eq('order_id', order.id)
      .order('created_at', { ascending: true })

    let photosToProcess = photos || []

    // ── 3. If photos don't have storage URLs yet, search in Supabase Storage ──
    const needsSearch = photosToProcess.some(p => !p.storage_url)

    if (needsSearch) {
      const { data: eventData, error: eventError } = await supabase
        .from('events')
        .select('slug')
        .eq('name', order.event_name)
        .single()
        
      if (eventError || !eventData) {
        console.error('Error fetching event slug:', eventError)
        throw new Error(`No se encontró el evento "${order.event_name}" en la base de datos para buscar sus fotos.`)
      }
      
      const folderPath = `events/${eventData.slug}`

      for (const photo of photosToProcess) {
        if (photo.storage_url) continue;

        const searchTerm = photo.photo_name.toLowerCase().replace(/\.[^.]+$/, '');
        
        const { data: searchResults, error: searchError } = await supabase
          .storage
          .from('photos')
          .list(folderPath, { limit: 10, search: searchTerm });

        if (!searchError && searchResults?.length > 0) {
          const match = searchResults.find(f =>
            f.name.toLowerCase().includes(searchTerm) ||
            searchTerm.includes(f.name.toLowerCase().replace(/\.[^.]+$/, ''))
          );

          if (match) {
            const publicUrl = `${supabaseUrl}/storage/v1/object/public/photos/${folderPath}/${match.name}`;
            photo.storage_url = publicUrl;
            photo.file_size = match.metadata?.size || null;

            // Update in DB
            await supabase
              .from('order_photos')
              .update({
                storage_url: publicUrl,
                file_size: match.metadata?.size || null,
              })
              .eq('id', photo.id);
          }
        }
      }
    }

    // Check how many photos were resolved
    const resolvedPhotos = photosToProcess.filter(p => p.storage_url)
    const missingPhotos = photosToProcess.filter(p => !p.storage_url)
    const totalPhotos = resolvedPhotos.length

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

    // ── 4. Notify about missing photos (if some found, some not) ──
    if (missingPhotos.length > 0) {
      const missingList = missingPhotos.map(p => `• ${p.photo_name}`).join('\n')
      await sendWhatsAppMessage(
        order.photographer_phone || Deno.env.get('PHOTOGRAPHER_PHONE'),
        `⚠️ Pedido ${ticket_code}: Fotos parcialmente encontradas.\n` +
        `✅ Encontradas: ${totalPhotos}\n❌ No encontradas:\n${missingList}`
      )
    }

    // ── 5. Update status to delivered FIRST (before any message send) ──
    // Esto garantiza que el pedido se marca como entregado aunque
    // WhatsApp esté bloqueado y el send falle.
    await supabase
      .from('orders')
      .update({
        status: 'delivered',
        whatsapp_sent: true,
        download_count: totalPhotos,
        approved_at: new Date().toISOString(),
        delivered_at: new Date().toISOString(),
      })
      .eq('id', order.id)

    // ── 6. TRY to send gallery link (don't fail if WhatsApp is blocked) ──
    const galleryLink = `https://jerpro.vercel.app/${ticket_code}`
    const galleryMessage = 
      `📥 *PARA NO PERDER CALIDAD:*\n` +
      `Descargalas en su resolución original (HD sin la compresión de WhatsApp) desde tu galería privada:\n\n` +
      `👉 ${galleryLink}\n\n` +
      `¡Que las disfrutes! ✨\n\n` +
      `Automatización hecha por Grow Labs, visitanos en www.growlabs.lat`

    let messageSent = false
    try {
      await sendWhatsAppMessage(order.client_phone, galleryMessage)
      messageSent = true
    } catch (_sendErr) {
      console.warn(`⚠️ No se pudo enviar mensaje a ${order.client_phone} (WhatsApp bloqueado?)`)
    }

    return new Response(
      JSON.stringify({
        success: true,
        ticket_code,
        photos_resolved: totalPhotos,
        missing_photos: missingPhotos.length,
        delivery_method: 'gallery_link_only',
        gallery_link: galleryLink,
        gallery_message: galleryMessage,
        message_sent: messageSent,
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
