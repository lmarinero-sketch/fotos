// Supabase Edge Function: process-order
// Recibe el mensaje RAW del cliente desde BuilderBot
// Parsea: evento, fotos, y genera la respuesta con datos de pago
//
// Trigger: mensaje que empieza con "Hola! Estoy en misfotos.click"
//
// PROTECCIONES ANTI-FLOODING:
// 1. Ignora mensajes OUTGOING (eco del bot)
// 2. Ignora eventos de sistema (QR, status, etc.)
// 3. Anti-duplicado para "Todo ok" (5 min cooldown por ticket)
// 4. Anti-duplicado para nuevos pedidos (60s cooldown)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── BuilderBot Cloud API con CORTAFUEGO ──
// Límites: 8 msgs/phone/10min, 40 msgs totales/10min
const sendWhatsAppMessage = async (phone: string, content: string, mediaUrl?: string) => {
  const botId = Deno.env.get('BUILDERBOT_BOT_ID')
  const apiKey = Deno.env.get('BUILDERBOT_API_KEY')

  // ── CORTAFUEGO: Rate Limiter ──
  try {
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString()

    // Check per-phone limit (max 8 per 10 min)
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
      return
    }

    // Check global limit (max 40 total per 10 min)
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
      return
    }
  } catch (_rateErr) {
    // Si falla el rate limiter, igual enviar (no bloquear por error de DB)
    console.warn('Rate limiter check failed, proceeding anyway')
  }

  const messages: Record<string, string> = { content }
  if (mediaUrl) messages.mediaUrl = mediaUrl

  await fetch(
    `https://app.builderbot.cloud/api/v2/${botId}/messages`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-builderbot': apiKey!,
      },
      body: JSON.stringify({
        messages,
        number: phone,
        checkIfExists: false,
      }),
    }
  )
}

// ── Parse incoming WhatsApp message ──
const parseClientMessage = (rawMessage) => {
  const cleanMsg = rawMessage.replace(/\*/g, '').trim()
  const lines = cleanMsg.split('\n').map(l => l.trim()).filter(l => l.length > 0)
  
  let eventName = ''
  const photos = []
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.startsWith('-')) {
      photos.push(line.substring(1).trim())
    } else if (line.endsWith(':')) {
      const candidate = line.substring(0, line.length - 1).trim()
      if (candidate.toLowerCase() !== 'son en total' && 
          !candidate.toLowerCase().includes('misfotos.click') &&
          !candidate.toLowerCase().includes('me interesan estas fotos')) {
        eventName = candidate
      }
    } else if (!line.startsWith('Hola!') && !line.includes('fotos.') && !line.includes('Gracias!') && !line.match(/^\d+$/)) {
      // fallback heuristic
      if (!eventName && i > 0 && lines[i+1] && lines[i+1].startsWith('-')) {
        eventName = line.replace(/:$/, '').trim()
      }
    }
  }
  
  return { eventName, photos }
}

// ── Generate ticket code (4 dígitos) ──
const generateTicketCode = () => {
  const num = Math.floor(1000 + Math.random() * 9000) // 1000-9999
  return `PD-${num}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()

    // ════════════════════════════════════════════════
    // BARRERA 1: Ignorar mensajes OUTGOING (eco del bot)
    // Cuando el bot envía un mensaje, BuilderBot dispara
    // el webhook de nuevo como "message.outgoing". Si no
    // lo filtramos, cada mensaje del bot genera otro ciclo.
    // ════════════════════════════════════════════════
    if (body.eventName && body.eventName !== 'message.incoming') {
      return new Response(
        JSON.stringify({ skip: true, reason: 'Not an incoming message', event: body.eventName }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ════════════════════════════════════════════════
    // BARRERA 2: Ignorar eventos de sistema de BuilderBot
    // (QR, reconexión, status changes, etc.)
    // ════════════════════════════════════════════════
    const rawMessage = body.data?.body || body.message || ''
    const clientPhone = body.data?.from || body.phone || ''
    const clientName = body.data?.name || ''

    // Si no hay teléfono real o es un evento de sistema, ignorar
    if (!clientPhone || clientPhone === 'unknown' || clientPhone === 'status') {
      return new Response(
        JSON.stringify({ skip: true, reason: 'No valid phone / system event' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Si el body es un evento interno de BuilderBot, ignorar
    if (body.data?.title?.includes('ACTION REQUIRED') || body.data?.status === 'require_action') {
      return new Response(
        JSON.stringify({ skip: true, reason: 'BuilderBot system event (QR/status)' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const cleanMsg = rawMessage.replace(/\*/g, '').trim()

    // Si el mensaje está vacío, solo guardar en CRM y salir
    if (!cleanMsg) {
      // Intentar guardar media si existe
      try {
        const chatSb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
        let permanentMediaUrl: string | null = null
        const urlsTemps: string[] = body.data?.urlsTempsFiles || []
        const attachment = body.data?.attachment || []

        if (urlsTemps.length > 0) {
          try {
            const mediaResp = await fetch(urlsTemps[0])
            if (mediaResp.ok) {
              const blob = await mediaResp.blob()
              const ext = (typeof attachment[0] === 'string' ? attachment[0] : '').split('.').pop() || 'jpg'
              const fileName = `chat-media/${clientPhone}/${Date.now()}.${ext}`
              await chatSb.storage.from('photos').upload(fileName, blob, {
                contentType: blob.type || 'application/octet-stream',
                cacheControl: '31536000',
                upsert: true,
              })
              const { data: urlData } = chatSb.storage.from('photos').getPublicUrl(fileName)
              permanentMediaUrl = urlData.publicUrl
            }
          } catch (_) { permanentMediaUrl = urlsTemps[0] }
        }

        await chatSb.from('chat_messages').insert({
          phone: clientPhone,
          name: clientName || null,
          direction: 'incoming',
          body: permanentMediaUrl ? '📷 Imagen' : null,
          media_url: permanentMediaUrl,
          attachment: attachment.length ? attachment : null,
        })
      } catch (_) {}

      return new Response(
        JSON.stringify({ skip: true, reason: 'Empty message, saved to CRM' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ── GUARDAR EN HISTORIAL CRM (siempre, nunca bloquea) ──
    try {
      const chatSb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
      let permanentMediaUrl: string | null = null

      const urlsTemps: string[] = body.data?.urlsTempsFiles || []
      const attachment = body.data?.attachment || []

      if (urlsTemps.length > 0) {
        const tempUrl = urlsTemps[0]
        try {
          const mediaResp = await fetch(tempUrl)
          if (mediaResp.ok) {
            const blob = await mediaResp.blob()
            const attachName = typeof attachment[0] === 'string' ? attachment[0] : ''
            const ext = attachName.split('.').pop() || 'jpg'
            const fileName = `chat-media/${clientPhone}/${Date.now()}.${ext}`
            await chatSb.storage.from('photos').upload(fileName, blob, {
              contentType: blob.type || 'application/octet-stream',
              cacheControl: '31536000',
              upsert: true
            })
            const { data: urlData } = chatSb.storage.from('photos').getPublicUrl(fileName)
            permanentMediaUrl = urlData.publicUrl
          }
        } catch (_dlErr) {
          permanentMediaUrl = tempUrl
        }
      }

      let cleanBody = rawMessage || null
      if (cleanBody && (cleanBody.startsWith('_event_media_') || cleanBody.startsWith('_event_voice_note_') || cleanBody.startsWith('_event_document_'))) {
        if (permanentMediaUrl) {
          const isVoice = cleanBody.startsWith('_event_voice_note_')
          const isDoc = cleanBody.startsWith('_event_document_')
          cleanBody = isVoice ? '🎤 Audio' : isDoc ? '📄 Documento' : '📷 Imagen'
        }
      }

      await chatSb.from('chat_messages').insert({
        phone: clientPhone,
        name: clientName || null,
        direction: 'incoming',
        body: cleanBody,
        media_url: permanentMediaUrl,
        attachment: attachment.length ? attachment : null,
      })
    } catch (_chatErr) { /* silently continue */ }

    // ════════════════════════════════════════════════
    // ROUTER: Detect message type
    // ════════════════════════════════════════════════

    // ── 1) "Todo ok PD-XXXX" → Approve order ──
    const approveMatch = cleanMsg.match(/^todo\s*ok\s*(pd-\d{4})\s*$/i)
    if (approveMatch) {
      const ticketCode = approveMatch[1].toUpperCase()
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const sb = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

      // ════════════════════════════════════════════════
      // BARRERA 3: Anti-duplicado para "Todo ok"
      // Si el pedido ya fue entregado o está en proceso,
      // ignorar el "Todo ok" repetido.
      // ════════════════════════════════════════════════
      const { data: existingOrder } = await sb
        .from('orders')
        .select('id, status, delivered_at')
        .eq('ticket_code', ticketCode)
        .single()

      if (!existingOrder) {
        return new Response(
          JSON.stringify({ skip: true, reason: 'Order not found for Todo ok', ticket: ticketCode }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Si ya fue entregado, NO volver a procesar
      if (existingOrder.status === 'delivered') {
        return new Response(
          JSON.stringify({ skip: true, reason: 'Already delivered', ticket: ticketCode }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Si está en proceso de envío, NO duplicar
      if (existingOrder.status === 'sending') {
        return new Response(
          JSON.stringify({ skip: true, reason: 'Already sending', ticket: ticketCode }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Marcar como "sending" ANTES de llamar a approve-order para prevenir duplicados
      await sb.from('orders')
        .update({ status: 'sending' })
        .eq('id', existingOrder.id)

      // No enviar mensaje de "procesando" — approve-order ya envía el link directamente

      try {
        const approveRes = await fetch(
          `${supabaseUrl}/functions/v1/approve-order`,
          {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            },
            body: JSON.stringify({
              ticket_code: ticketCode,
              photographer_phone: clientPhone,
            }),
          }
        )

        if (!approveRes.ok) {
           const errorText = await approveRes.text()
           let isHandled = false
           try {
             const errJson = JSON.parse(errorText)
             if (approveRes.status === 404 && errJson.error === 'No photos found in storage') {
                isHandled = true
             }
           } catch (_) {}

           if (isHandled) {
             return new Response(
               JSON.stringify({ routed: 'approve-order', error: 'Photos not found, handled' }),
               { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
             )
           }
           throw new Error(`approve-order returned ${approveRes.status}: ${errorText}`)
        }

        const approveResult = await approveRes.json()
        return new Response(
          JSON.stringify({ routed: 'approve-order', ticket_code: ticketCode, ...approveResult }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      } catch (err) {
        await sb.from('system_errors').insert({
          error_source: 'process-order-approve-call',
          error_message: err.message,
          payload: { ticketCode, clientPhone }
        })

        // Revertir status si falló
        await sb.from('orders')
          .update({ status: existingOrder.status })
          .eq('id', existingOrder.id)

        await sendWhatsAppMessage(clientPhone, `❌ Error interno al enviar las fotos. Contactá a soporte o aprobalo desde el Panel Web.`)

        return new Response(
          JSON.stringify({ error: err.message }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // ── 2) "Hola! Estoy en misfotos.click..." → New order ──
    const triggerPhrase = 'Hola! Estoy'
    if (!cleanMsg.startsWith(triggerPhrase) && !cleanMsg.toLowerCase().includes('misfotos.click')) {
      // No es un mensaje reconocido — solo guardarlo en CRM (ya se guardó arriba)
      return new Response(
        JSON.stringify({ skip: true, reason: 'Message does not match any trigger' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!clientPhone) {
      return new Response(
        JSON.stringify({ error: 'Missing client phone number' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ── Parse message ──
    const { eventName, photos } = parseClientMessage(rawMessage)

    if (!eventName || photos.length === 0) {
      const sb = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))
      await sb.from('system_errors').insert({
        error_source: 'process-order',
        error_message: 'Parse error: Could not identify event name or photos',
        payload: { rawMessage, parsedEvent: eventName, parsedPhotos: photos }
      })

      return new Response(
        JSON.stringify({ error: 'Could not parse event name or photos from message', rawMessage }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ── Supabase ──
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    )

    // ── Anti-duplicate: skip if same phone + same event within 60s ──
    const oneMinuteAgo = new Date(Date.now() - 60000).toISOString()
    const { data: recentOrder } = await supabase
      .from('orders')
      .select('id, ticket_code')
      .eq('client_phone', clientPhone)
      .ilike('event_name', eventName)
      .gte('created_at', oneMinuteAgo)
      .limit(1)
      .maybeSingle()

    if (recentOrder) {
      return new Response(
        JSON.stringify({ skip: true, reason: 'Duplicate order detected', existing_ticket: recentOrder.ticket_code }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ── Get event pricing from DB ──
    const { data: eventData } = await supabase
      .from('events')
      .select('price_per_photo, price_pack')
      .ilike('name', eventName)
      .limit(1)
      .single()

    const pricePerPhoto = eventData?.price_per_photo || parseInt(Deno.env.get('PRICE_PER_PHOTO') || '3000')
    const pricePack = eventData?.price_pack || 15000

    const costIndividual = photos.length * pricePerPhoto
    const totalPrice = costIndividual > pricePack ? pricePack : costIndividual
    
    const ticketCode = generateTicketCode()

    // ── Create order ──
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        ticket_code: ticketCode,
        event_name: eventName,
        client_phone: clientPhone,
        client_name: clientName,
        photographer_phone: Deno.env.get('PHOTOGRAPHER_PHONE'),
        status: 'awaiting_payment',
        total_price: totalPrice,
      })
      .select()
      .single()

    if (orderError) throw orderError

    // ── Insert photo records ──
    const photoRecords = photos.map(photoName => ({
      order_id: order.id,
      photo_name: photoName,
    }))

    await supabase.from('order_photos').insert(photoRecords)

    // ── Payment details from env ──
    const paymentCBU = Deno.env.get('PAYMENT_CBU') || '0000007900204719749012'
    const paymentAlias = Deno.env.get('PAYMENT_ALIAS') || 'JEREMIASRIARTE1.UALA'
    const paymentBanco = Deno.env.get('PAYMENT_BANCO') || 'Uala'
    const paymentHolder = Deno.env.get('PAYMENT_HOLDER') || 'Jeremias Riarte Emanuel'

    // ── Format price ──
    const formatPrice = (n) => n.toLocaleString('es-AR')

    // ── Build response message ──
    const responseMessage =
      `¡Perfecto! Ya tomamos tu pedido 📸\n\n` +
      `📋 *Pedido: ${ticketCode}*\n` +
      `🎪 Evento: ${eventName}\n` +
      `📷 Fotos: ${photos.length}\n\n` +
      `*Te detallo los precios del evento:*\n` +
      `👉 Individual: $${formatPrice(pricePerPhoto)} c/u\n` +
      `🎁 *Pack completo:* $${formatPrice(pricePack)}\n\n` +
      `Llevas ${photos.length} foto${photos.length > 1 ? 's' : ''}.\n` +
      `💰 *Total a transferir: $${formatPrice(totalPrice)}*\n\n` +
      `💳 *Este es el CBU para hacer la transferencia:*\n\n` +
      `CBU: ${paymentCBU}\n` +
      `Alias: ${paymentAlias}\n` +
      `Banco: ${paymentBanco}\n` +
      `*Titular: ${paymentHolder}*\n\n` +
      `*Una vez que hagas la transferencia, por favor enviá el comprobante por este mismo chat. ¡Y ya seguimos!* 😊`

    // ── Send response to client ──
    await sendWhatsAppMessage(clientPhone, responseMessage)

    // ── Notify photographer ──
    const photographerPhone = Deno.env.get('PHOTOGRAPHER_PHONE')
    if (photographerPhone) {
      await sendWhatsAppMessage(
        photographerPhone,
        `📋 Nuevo pedido recibido\n\n` +
        `Ticket: ${ticketCode}\n` +
        `Cliente: ${clientPhone}\n` +
        `Evento: ${eventName}\n` +
        `Fotos: ${photos.join(', ')}\n` +
        `Total: $${formatPrice(totalPrice)}\n\n` +
        `Cuando confirmes el pago, respondé en el chat del cliente:\n` +
        `*Todo ok ${ticketCode}*\n\n` +
        `⚠️ Escribí SOLO eso, nada más.`
      )
    }

    return new Response(
      JSON.stringify({
        success: true,
        ticket_code: ticketCode,
        event_name: eventName,
        photos_count: photos.length,
        total_price: totalPrice,
        photos,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('process-order error:', error)
    
    // Attempt to log critical error
    try {
      if (Deno.env.get('SUPABASE_URL') && Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) {
        const sb = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))
        await sb.from('system_errors').insert({
          error_source: 'process-order (catch)',
          error_message: error.message,
          payload: { stack: error.stack }
        })
      }
    } catch (_) {}

    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
