import { useState, useRef } from 'react'
import { createClient } from '@supabase/supabase-js'
import { ClipboardCopy, Check, AlertTriangle, Loader2, ArrowLeft, Camera } from 'lucide-react'
import './QuickOrderPage.css'

// Admin client con service_role para crear orders
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_SERVICE_KEY
)

// Replicar lógica de parseo del process-order
const parseMessage = (raw) => {
  const cleanMsg = raw.replace(/\*/g, '').trim()
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
      if (!eventName && i > 0 && lines[i+1] && lines[i+1].startsWith('-')) {
        eventName = line.replace(/:$/, '').trim()
      }
    }
  }
  
  return { eventName, photos }
}

const generateTicketCode = () => {
  const num = Math.floor(1000 + Math.random() * 9000)
  return `PD-${num}`
}

const QuickOrderPage = () => {
  const [message, setMessage] = useState('')
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const textareaRef = useRef(null)

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText()
      setMessage(text)
      setError('')
      setResult(null)
    } catch {
      // Fallback: focus the textarea for manual paste
      textareaRef.current?.focus()
    }
  }

  const handleProcess = async () => {
    if (!message.trim()) {
      setError('Pegá el mensaje primero')
      return
    }

    setProcessing(true)
    setError('')
    setResult(null)

    try {
      const { eventName, photos } = parseMessage(message)

      if (!eventName || photos.length === 0) {
        setError(`No se pudo parsear el mensaje.\nEvento detectado: "${eventName || 'ninguno'}"\nFotos detectadas: ${photos.length}`)
        setProcessing(false)
        return
      }

      // Buscar evento en DB para obtener precios
      const { data: eventData } = await supabase
        .from('events')
        .select('price_per_photo, price_pack')
        .ilike('name', eventName)
        .limit(1)
        .single()

      const pricePerPhoto = eventData?.price_per_photo || 3000
      const pricePack = eventData?.price_pack || 15000
      const costIndividual = photos.length * pricePerPhoto
      const totalPrice = costIndividual > pricePack ? pricePack : costIndividual

      // ── Anti-duplicado: buscar si ya existe un pedido reciente con el mismo evento + mismas fotos ──
      const fiveMinAgo = new Date(Date.now() - 5 * 60000).toISOString()
      const { data: recentOrders } = await supabase
        .from('orders')
        .select('id, ticket_code, order_photos(photo_name)')
        .ilike('event_name', eventName)
        .gte('created_at', fiveMinAgo)
        .order('created_at', { ascending: false })
        .limit(5)

      // Verificar si alguno tiene exactamente las mismas fotos
      if (recentOrders && recentOrders.length > 0) {
        for (const existing of recentOrders) {
          const existingPhotos = (existing.order_photos || []).map(p => p.photo_name).sort()
          const newPhotos = [...photos].sort()
          if (JSON.stringify(existingPhotos) === JSON.stringify(newPhotos)) {
            // Ya existe este pedido exacto
            const galleryLink = `https://jerpro.vercel.app/${existing.ticket_code}`
            const formatPrice = (n) => n.toLocaleString('es-AR')
            setResult({
              ticketCode: existing.ticket_code,
              eventName,
              photos,
              foundPhotos: photos,
              missingPhotos: [],
              galleryLink,
              totalPrice: costIndividual > pricePack ? pricePack : costIndividual,
              pricePerPhoto,
              pricePack,
              isDuplicate: true,
              copyText: 
                `📸 *Pedido: ${existing.ticket_code}* (existente)\n` +
                `🎪 Evento: ${eventName}\n` +
                `📷 Fotos: ${photos.length}\n\n` +
                `💰 *Total: $${formatPrice(costIndividual > pricePack ? pricePack : costIndividual)}*\n\n` +
                `📥 *Galería de descarga:*\n${galleryLink}`,
            })
            setProcessing(false)
            return
          }
        }
      }

      const ticketCode = generateTicketCode()

      // Crear orden
      const { data: order, error: orderErr } = await supabase
        .from('orders')
        .insert({
          ticket_code: ticketCode,
          event_name: eventName,
          client_phone: 'web-quickorder',
          client_name: 'Web Quick Order',
          status: 'awaiting_payment',
          total_price: totalPrice,
        })
        .select()
        .single()

      if (orderErr) throw orderErr

      // Insertar fotos del pedido
      const photoRecords = photos.map(photoName => ({
        order_id: order.id,
        photo_name: photoName,
      }))
      await supabase.from('order_photos').insert(photoRecords)

      // Verificar qué fotos existen en storage
      const folderPath = eventName + '/'
      const { data: storageFiles } = await supabase.storage.from('photos').list(folderPath, {
        limit: 5000,
        sortBy: { column: 'name', order: 'asc' }
      })

      const existingFiles = (storageFiles || []).map(f => f.name.split('.')[0].toLowerCase())
      
      const foundPhotos = []
      const missingPhotos = []

      for (const photo of photos) {
        const photoBase = photo.toLowerCase()
        if (existingFiles.some(f => f === photoBase || f.includes(photoBase))) {
          foundPhotos.push(photo)
        } else {
          missingPhotos.push(photo)
        }
      }

      // Llamar a approve-order para resolver las fotos y marcar como delivered
      try {
        const approveRes = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/approve-order`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_SERVICE_KEY}`,
            },
            body: JSON.stringify({
              ticket_code: ticketCode,
              photographer_phone: 'web-quickorder',
            }),
          }
        )
        const approveData = await approveRes.json()
        console.log('Approve result:', approveData)
      } catch (approveErr) {
        console.warn('Approve failed (photos may not be ready):', approveErr)
      }

      const galleryLink = `https://jerpro.vercel.app/${ticketCode}`
      const formatPrice = (n) => n.toLocaleString('es-AR')

      setResult({
        ticketCode,
        eventName,
        photos,
        foundPhotos,
        missingPhotos,
        galleryLink,
        totalPrice,
        pricePerPhoto,
        pricePack,
        // Mensaje listo para copiar
        copyText: 
          `📸 *Pedido: ${ticketCode}*\n` +
          `🎪 Evento: ${eventName}\n` +
          `📷 Fotos: ${photos.length}\n\n` +
          `💰 *Total: $${formatPrice(totalPrice)}*\n` +
          `👉 Individual: $${formatPrice(pricePerPhoto)} c/u\n` +
          `🎁 Pack completo: $${formatPrice(pricePack)}\n\n` +
          `💳 *Datos para transferir:*\n` +
          `CBU: ${import.meta.env.VITE_PAYMENT_CBU}\n` +
          `Alias: ${import.meta.env.VITE_PAYMENT_ALIAS}\n` +
          `Banco: ${import.meta.env.VITE_PAYMENT_BANCO}\n` +
          `Titular: ${import.meta.env.VITE_PAYMENT_HOLDER}\n\n` +
          (missingPhotos.length > 0 ? `⚠️ Fotos no encontradas: ${missingPhotos.join(', ')}\n\n` : '') +
          `📥 *Galería de descarga:*\n${galleryLink}\n\n` +
          `Una vez que hagas la transferencia, enviá el comprobante. ¡Y ya seguimos! 😊`,
      })

    } catch (err) {
      setError(`Error: ${err.message}`)
    } finally {
      setProcessing(false)
    }
  }

  const handleCopy = async () => {
    if (!result) return
    try {
      await navigator.clipboard.writeText(result.copyText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback
      const ta = document.createElement('textarea')
      ta.value = result.copyText
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleCopyLink = async () => {
    if (!result) return
    await navigator.clipboard.writeText(result.galleryLink)
  }

  const handleReset = () => {
    setMessage('')
    setResult(null)
    setError('')
    setCopied(false)
  }

  return (
    <div className="qo-page">
      <div className="qo-bg-aura qo-bg-1" />
      <div className="qo-bg-aura qo-bg-2" />

      <div className="qo-container">
        <header className="qo-header">
          <Camera size={28} className="qo-icon" />
          <h1>JerPro — Pedido Rápido</h1>
          <p>Pegá el mensaje del cliente y obtené el link al instante</p>
        </header>

        {!result ? (
          <div className="qo-form">
            <textarea
              ref={textareaRef}
              className="qo-textarea"
              placeholder={'Pegá acá el mensaje del cliente...\n\nEjemplo:\nHola! Estoy en misfotos.click me interesan estas fotos:\n\n Ironman 70.3 San Juan:\n - JER_4907\n - COS02717\n\nSon en total:\n2 fotos.\nGracias!'}
              value={message}
              onChange={(e) => {
                setMessage(e.target.value)
                setError('')
              }}
              rows={10}
            />

            <div className="qo-actions">
              <button className="qo-btn-paste" onClick={handlePaste}>
                <ClipboardCopy size={18} />
                Pegar desde portapapeles
              </button>

              <button 
                className="qo-btn-process" 
                onClick={handleProcess}
                disabled={!message.trim() || processing}
              >
                {processing ? (
                  <><Loader2 size={18} className="qo-spin" /> Procesando...</>
                ) : (
                  '🚀 Procesar Pedido'
                )}
              </button>
            </div>

            {error && <div className="qo-error"><AlertTriangle size={16} /> {error}</div>}
          </div>
        ) : (
          <div className="qo-result">
            <div className="qo-result-header">
              <span className="qo-badge-success">✅ PEDIDO CREADO</span>
              <span className="qo-ticket">{result.ticketCode}</span>
            </div>

            <div className="qo-result-info">
              <div className="qo-info-row">
                <span>🎪 Evento</span>
                <strong>{result.eventName}</strong>
              </div>
              <div className="qo-info-row">
                <span>📷 Fotos</span>
                <strong>{result.photos.length}</strong>
              </div>
              <div className="qo-info-row">
                <span>💰 Total</span>
                <strong>${result.totalPrice.toLocaleString('es-AR')}</strong>
              </div>
            </div>

            {result.missingPhotos.length > 0 && (
              <div className="qo-warning">
                <AlertTriangle size={16} />
                <div>
                  <strong>Fotos no encontradas ({result.missingPhotos.length}):</strong>
                  <ul>
                    {result.missingPhotos.map(p => <li key={p}>{p}</li>)}
                  </ul>
                </div>
              </div>
            )}

            <div className="qo-link-box">
              <span className="qo-link-label">📥 Link de galería:</span>
              <a href={result.galleryLink} target="_blank" rel="noopener" className="qo-link">
                {result.galleryLink}
              </a>
              <button className="qo-btn-copy-link" onClick={handleCopyLink}>
                📋 Copiar link
              </button>
            </div>

            <button className="qo-btn-copy-all" onClick={handleCopy}>
              {copied ? (
                <><Check size={18} /> ¡Copiado!</>
              ) : (
                <><ClipboardCopy size={18} /> Copiar mensaje completo</>
              )}
            </button>

            <div className="qo-preview">
              <span className="qo-preview-label">Vista previa del mensaje:</span>
              <pre className="qo-preview-text">{result.copyText}</pre>
            </div>

            <button className="qo-btn-reset" onClick={handleReset}>
              <ArrowLeft size={16} /> Nuevo pedido
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default QuickOrderPage
