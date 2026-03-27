// Supabase Edge Function: process-order
// Recibe el mensaje RAW del cliente desde BuilderBot
// Parsea: evento, fotos, y genera la respuesta con datos de pago
//
// Trigger: mensaje que empieza con "Hola! Estoy en misfotos.click"
//
// Ejemplo de mensaje entrante:
// *Hola! Estoy en misfotos.click me interesan estas fotos:*
//
//  *Top Man Mendoza:*
//  - DSC_3457
//  - DSC_3458
//  - DSC_3459
//
// *Son en total:*
// 3 fotos.
// *Gracias!*

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── BuilderBot Cloud API ──
const sendWhatsAppMessage = async (phone: string, content: string, mediaUrl?: string) => {
  const botId = Deno.env.get('BUILDERBOT_BOT_ID')
  const apiKey = Deno.env.get('BUILDERBOT_API_KEY')

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
  // Remove WhatsApp bold markers (*) for parsing
  const msg = rawMessage.trim()

  // Extract event name: between "*EventName:*" pattern
  // Look for a line like " *Top Man Mendoza:*"
  const eventMatch = msg.match(/\*([^*]+?):\*\s*\n/g)
  let eventName = ''

  if (eventMatch) {
    // First match after the intro line is the event name
    for (const match of eventMatch) {
      const cleaned = match.replace(/\*/g, '').replace(':', '').trim()
      if (cleaned.toLowerCase() !== 'son en total' &&
          !cleaned.toLowerCase().includes('misfotos') &&
          !cleaned.toLowerCase().includes('gracias')) {
        eventName = cleaned
        break
      }
    }
  }

  // Extract photo names: lines starting with " - " or "- "
  const photoLines = msg.match(/^\s*-\s+(.+)$/gm) || []
  const photos = photoLines.map(line =>
    line.replace(/^\s*-\s+/, '').replace(/\*/g, '').trim()
  ).filter(p => p.length > 0)

  return { eventName, photos }
}

// ── Generate ticket code (4 dígitos, fácil de escribir) ──
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

    // BuilderBot webhook formats:
    // INCOMING: { eventName: "message.incoming", data: { body: "...", name: "Leifer", from: "3400000" } }
    // OUTGOING: { eventName: "message.outgoing", data: { answer: "...", from: "3400000" } }
    const isOutgoing = body.eventName === 'message.outgoing'
    const rawMessage = body.data?.body || body.data?.answer || body.message || ''
    const clientPhone = body.data?.from || body.phone || ''
    const clientName = body.data?.name || ''
    const cleanMsg = rawMessage.replace(/\*/g, '').trim()

    // ── ROUTER: Detect message type ──

    // 1) "Todo ok PD-XXXX" → Approve order (ONLY if the entire message is just this)
    const approveMatch = cleanMsg.match(/^todo\s+ok\s+(PD-\d{4})$/i)
    if (approveMatch) {
      const ticketCode = approveMatch[1].toUpperCase()
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!

      // Call approve-order edge function internally
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
      const approveResult = await approveRes.json()
      return new Response(
        JSON.stringify({ routed: 'approve-order', ticket_code: ticketCode, ...approveResult }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 2) "Hola! Estoy en misfotos.click..." → New order
    const triggerPhrase = 'Hola! Estoy en misfotos.click'
    if (!cleanMsg.startsWith(triggerPhrase)) {
      return new Response(
        JSON.stringify({ skip: true, reason: 'Message does not match any trigger' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!clientPhone) {
      return new Response(
        JSON.stringify({ error: 'Missing client phone number' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ── Supabase ──
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    )

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
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
