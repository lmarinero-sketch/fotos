// Supabase Edge Function: receive-payment
// PASO 3: Cliente envía comprobante de pago
// Actualiza el estado y reenvía al fotógrafo

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const sendWhatsAppMessage = async (phone, content, mediaUrl = null) => {
  const botId = Deno.env.get('BUILDERBOT_BOT_ID')
  const apiKey = Deno.env.get('BUILDERBOT_API_KEY')

  const body = {
    messages: { content, ...(mediaUrl ? { mediaUrl } : {}) },
    number: phone,
    checkIfExists: false,
  }

  await fetch(
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
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { ticket_code, client_phone, receipt_url } = await req.json()

    if (!ticket_code || !client_phone) {
      return new Response(
        JSON.stringify({ error: 'Faltan campos: ticket_code, client_phone' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    )

    // 1. Find order
    const { data: order, error: findError } = await supabase
      .from('orders')
      .select('*')
      .eq('ticket_code', ticket_code.toUpperCase())
      .eq('client_phone', client_phone)
      .single()

    if (findError || !order) {
      return new Response(
        JSON.stringify({ error: `Order ${ticket_code} not found for this phone` }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 2. Count photos in order
    const { count } = await supabase
      .from('order_photos')
      .select('*', { count: 'exact', head: true })
      .eq('order_id', order.id)

    // 3. Update status
    await supabase
      .from('orders')
      .update({
        status: 'payment_received',
        receipt_url: receipt_url || null,
      })
      .eq('id', order.id)

    // 4. Notify photographer with order details + receipt
    const photographerPhone = order.photographer_phone || Deno.env.get('PHOTOGRAPHER_PHONE')

    const photographerMsg =
      `💰 Nuevo pago recibido\n\n` +
      `Pedido: ${ticket_code}\n` +
      `Cliente: ${client_phone}\n` +
      `Evento: ${order.event_name}\n` +
      `Fotos: ${count}\n` +
      `Monto: $${(order.total_price || 0).toLocaleString('es-AR')}\n\n` +
      `Para enviar las fotos, respondé:\n` +
      `Todo ok ${ticket_code}`

    if (receipt_url) {
      // Send receipt as media
      await sendWhatsAppMessage(photographerPhone, photographerMsg, receipt_url)
    } else {
      await sendWhatsAppMessage(photographerPhone, photographerMsg)
    }

    // 5. Confirm to client
    await sendWhatsAppMessage(
      client_phone,
      `✅ ¡Recibimos tu comprobante!\n\n` +
      `Pedido: ${ticket_code}\n` +
      `Te avisamos cuando el fotógrafo confirme y tus fotos estén listas. 📸`
    )

    return new Response(
      JSON.stringify({
        success: true,
        ticket_code,
        status: 'payment_received',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
