// Supabase Edge Function: send-message
// Envía un mensaje de WhatsApp a través de BuilderBot Cloud API
// Usado por el CRM para enviar mensajes desde el panel

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { phone, message, mediaUrl } = await req.json()

    if (!phone || !message) {
      return new Response(
        JSON.stringify({ error: 'Missing phone or message' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const botId = Deno.env.get('BUILDERBOT_BOT_ID')
    const apiKey = Deno.env.get('BUILDERBOT_API_KEY')

    const messages = { content: message }
    if (mediaUrl) messages.mediaUrl = mediaUrl

    const res = await fetch(
      `https://app.builderbot.cloud/api/v2/${botId}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-builderbot': apiKey,
        },
        body: JSON.stringify({
          messages,
          number: phone,
          checkIfExists: false,
        }),
      }
    )

    return new Response(
      JSON.stringify({ success: res.ok }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
