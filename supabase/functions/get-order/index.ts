// Supabase Edge Function: get-order
// Public endpoint to fetch order data for the download page
// Only returns data for approved orders

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
    const url = new URL(req.url)
    const ticketCode = url.searchParams.get('ticket')

    if (!ticketCode) {
      return new Response(
        JSON.stringify({ error: 'Missing ticket parameter' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_ANON_KEY')
    )

    // 1. Fetch order
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('ticket_code', ticketCode.toUpperCase())
      .single()

    if (orderError || !order) {
      return new Response(
        JSON.stringify({ error: 'Order not found', status: 'not_found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 2. If not approved, return limited info
    if (order.status !== 'approved') {
      return new Response(
        JSON.stringify({
          ticket_code: order.ticket_code,
          event_name: order.event_name,
          status: order.status,
          photos: [],
          message: order.status === 'pending'
            ? 'El fotógrafo aún no aprobó este pedido'
            : 'Este pedido fue rechazado',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 3. Fetch photos for approved order
    const { data: photos, error: photosError } = await supabase
      .from('order_photos')
      .select('*')
      .eq('order_id', order.id)
      .order('created_at', { ascending: true })

    if (photosError) throw photosError

    // 4. Increment download view count
    await supabase
      .from('orders')
      .update({ download_count: (order.download_count || 0) + 1 })
      .eq('id', order.id)

    return new Response(
      JSON.stringify({
        ticket_code: order.ticket_code,
        event_name: order.event_name,
        status: order.status,
        created_at: order.created_at,
        approved_at: order.approved_at,
        photos: photos.map(p => ({
          id: p.id,
          name: p.photo_name,
          thumbnail: p.thumbnail_url,
          download_url: p.drive_download_url,
          file_size: p.file_size,
        })),
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
