import { useState, useRef } from 'react'
import { ClipboardCopy, Check, AlertTriangle, Loader2, ArrowLeft, Zap, Clipboard } from 'lucide-react'
import './QuickOrderPage.css'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL

// ── Parse the misfotos.click message ──
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

const QuickOrderPage = () => {
  const [message, setMessage] = useState('')
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)
  const textareaRef = useRef(null)
  const lastProcessTime = useRef(0)

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText()
      setMessage(text)
      setError('')
      setResult(null)
    } catch {
      textareaRef.current?.focus()
    }
  }

  const handleProcess = async () => {
    if (!message.trim()) {
      setError('Pegá el mensaje primero')
      return
    }

    // Anti-spam: 3 seconds cooldown
    const now = Date.now()
    if (now - lastProcessTime.current < 3000) {
      setError('Esperá unos segundos antes de procesar otro pedido')
      return
    }
    lastProcessTime.current = now

    setProcessing(true)
    setError('')
    setResult(null)

    try {
      // Preview del parseo antes de enviar
      const { eventName, photos } = parseMessage(message)

      if (!eventName || photos.length === 0) {
        setError(`No se pudo parsear el mensaje.\nEvento: "${eventName || '—'}"\nFotos: ${photos.length}`)
        setProcessing(false)
        return
      }

      // Llamar a process-order con un webhook simulado
      const res = await fetch(`${SUPABASE_URL}/functions/v1/process-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventName: 'message.incoming',
          data: {
            body: message,
            from: `web-quick-${Date.now()}`,
            name: 'Pedido Rápido Web',
          }
        }),
      })

      const data = await res.json()
      
      if (data.skip && data.reason === 'Duplicate order detected') {
        // Pedido duplicado: usar el ticket existente
        const galleryLink = `https://jerpro.vercel.app/${data.existing_ticket}`
        setResult({
          ticketCode: data.existing_ticket,
          eventName,
          photos,
          missingPhotos: [],
          galleryLink,
          isDuplicate: true,
          copyText: `📥 *Galería:*\n${galleryLink}`,
        })
        setProcessing(false)
        return
      }

      if (data.error) {
        setError(`Error del servidor: ${data.error}`)
        setProcessing(false)
        return
      }

      // Extraer ticket_code de la respuesta
      const ticketCode = data.ticket_code || data.order?.ticket_code
      if (!ticketCode) {
        setError('No se pudo obtener el código del pedido')
        setProcessing(false)
        return
      }

      // Ahora llamar approve-order para resolver las fotos
      let approveData = {}
      try {
        const approveRes = await fetch(`${SUPABASE_URL}/functions/v1/approve-order`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ticket_code: ticketCode,
            photographer_phone: 'web-quickorder',
          }),
        })
        approveData = await approveRes.json()
      } catch (_) {
        console.warn('Approve failed silently')
      }

      const galleryLink = `https://jerpro.vercel.app/${ticketCode}`
      const missingCount = approveData.missing_photos || 0
      const totalPhotos = approveData.photos_resolved || photos.length

      // Datos de pago desde env
      const paymentCBU = import.meta.env.VITE_PAYMENT_CBU || ''
      const paymentAlias = import.meta.env.VITE_PAYMENT_ALIAS || ''
      const paymentBanco = import.meta.env.VITE_PAYMENT_BANCO || ''
      const paymentHolder = import.meta.env.VITE_PAYMENT_HOLDER || ''

      const formatPrice = (n) => Number(n).toLocaleString('es-AR')
      const totalPrice = data.total_price || 0
      const pricePerPhoto = data.price_per_photo || 0
      const pricePack = data.price_pack || 0

      const copyText = 
        `¡Perfecto! Ya tomamos tu pedido 📸\n\n` +
        `📋 *Pedido: ${ticketCode}*\n` +
        `🎪 Evento: ${eventName}\n` +
        `📷 Fotos: ${photos.length}\n\n` +
        `💰 *Total a transferir: $${formatPrice(totalPrice)}*\n` +
        `👉 Individual: $${formatPrice(pricePerPhoto)} c/u\n` +
        `🎁 Pack completo: $${formatPrice(pricePack)}\n\n` +
        `💳 *Datos para transferir:*\n` +
        `CBU: ${paymentCBU}\n` +
        `Alias: ${paymentAlias}\n` +
        `Banco: ${paymentBanco}\n` +
        `Titular: ${paymentHolder}\n\n` +
        (missingCount > 0 ? `⚠️ ${missingCount} foto(s) no encontradas en el storage.\n\n` : '') +
        `📥 *Galería de descarga:*\n${galleryLink}\n\n` +
        `Una vez que hagas la transferencia, enviá el comprobante. ¡Y ya seguimos! 😊`

      setResult({
        ticketCode,
        eventName,
        photos,
        totalPhotos,
        missingCount,
        galleryLink,
        totalPrice,
        copyText,
        isDuplicate: false,
        messageSent: approveData.message_sent || false,
      })

    } catch (err) {
      setError(`Error: ${err.message}`)
    } finally {
      setProcessing(false)
    }
  }

  const handleCopy = async (text, setter) => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    setter(true)
    setTimeout(() => setter(false), 2000)
  }

  const handleReset = () => {
    setMessage('')
    setResult(null)
    setError('')
    setCopied(false)
    setCopiedLink(false)
  }

  return (
    <div className="qo-page">
      {/* Background auras */}
      <div className="qo-aura qo-aura-1" />
      <div className="qo-aura qo-aura-2" />

      <div className="qo-container">
        {/* Header */}
        <header className="qo-header">
          <div className="qo-logo">
            <Zap size={24} />
          </div>
          <h1 className="qo-title">Pedido Rápido</h1>
          <p className="qo-subtitle">Pegá el mensaje · Obtené el link</p>
        </header>

        {!result ? (
          <div className="qo-form">
            {/* Textarea */}
            <div className="qo-input-wrap">
              <textarea
                ref={textareaRef}
                className="qo-textarea"
                placeholder="Pegá acá el mensaje del cliente..."
                value={message}
                onChange={(e) => { setMessage(e.target.value); setError('') }}
                rows={8}
                spellCheck={false}
              />
              {!message && (
                <div className="qo-placeholder-hint">
                  Formato esperado:<br/>
                  Hola! Estoy en misfotos.click...<br/>
                  Evento:<br/>
                  - FOTO_001<br/>
                  - FOTO_002
                </div>
              )}
            </div>

            {/* Actions */}
            <button className="qo-btn qo-btn-paste" onClick={handlePaste}>
              <Clipboard size={16} />
              <span>Pegar del portapapeles</span>
            </button>

            <button 
              className="qo-btn qo-btn-primary" 
              onClick={handleProcess}
              disabled={!message.trim() || processing}
            >
              {processing ? (
                <><Loader2 size={18} className="qo-spin" /> Procesando...</>
              ) : (
                <><Zap size={18} /> Procesar Pedido</>
              )}
            </button>

            {/* Parse preview */}
            {message.trim() && (() => {
              const { eventName, photos } = parseMessage(message)
              return (
                <div className="qo-parse-preview">
                  <span className={eventName ? 'qo-pp-ok' : 'qo-pp-err'}>
                    {eventName ? `🎪 ${eventName}` : '⚠️ Sin evento'}
                  </span>
                  <span className={photos.length > 0 ? 'qo-pp-ok' : 'qo-pp-err'}>
                    📷 {photos.length} foto{photos.length !== 1 ? 's' : ''}
                  </span>
                </div>
              )
            })()}

            {error && (
              <div className="qo-alert qo-alert-error">
                <AlertTriangle size={15} />
                <span>{error}</span>
              </div>
            )}
          </div>
        ) : (
          /* ═══ RESULT ═══ */
          <div className="qo-result">
            {result.isDuplicate && (
              <div className="qo-alert qo-alert-info">
                ℹ️ Pedido existente recuperado
              </div>
            )}

            <div className="qo-card qo-card-success">
              <div className="qo-card-badge">✅ CREADO</div>
              <div className="qo-card-ticket">{result.ticketCode}</div>
            </div>

            <div className="qo-card qo-card-info">
              <div className="qo-row">
                <span className="qo-label">Evento</span>
                <span className="qo-value">{result.eventName}</span>
              </div>
              <div className="qo-divider" />
              <div className="qo-row">
                <span className="qo-label">Fotos</span>
                <span className="qo-value">{result.photos.length}</span>
              </div>
              {result.totalPrice > 0 && (
                <>
                  <div className="qo-divider" />
                  <div className="qo-row">
                    <span className="qo-label">Total</span>
                    <span className="qo-value qo-value-price">${Number(result.totalPrice).toLocaleString('es-AR')}</span>
                  </div>
                </>
              )}
            </div>

            {result.missingCount > 0 && (
              <div className="qo-alert qo-alert-warn">
                <AlertTriangle size={15} />
                <span>{result.missingCount} foto(s) no encontradas en storage</span>
              </div>
            )}

            {/* Gallery link */}
            <div className="qo-card qo-card-link">
              <span className="qo-link-label">Galería de descarga</span>
              <a href={result.galleryLink} target="_blank" rel="noopener noreferrer" className="qo-gallery-link">
                {result.galleryLink}
              </a>
              <button 
                className="qo-btn qo-btn-sm" 
                onClick={() => handleCopy(result.galleryLink, setCopiedLink)}
              >
                {copiedLink ? <><Check size={14} /> Copiado</> : <><ClipboardCopy size={14} /> Copiar link</>}
              </button>
            </div>

            {/* Copy full message */}
            <button 
              className="qo-btn qo-btn-primary" 
              onClick={() => handleCopy(result.copyText, setCopied)}
            >
              {copied ? (
                <><Check size={18} /> ¡Mensaje copiado!</>
              ) : (
                <><ClipboardCopy size={18} /> Copiar mensaje completo</>
              )}
            </button>

            {/* Preview */}
            <details className="qo-details">
              <summary>Ver mensaje completo</summary>
              <pre className="qo-pre">{result.copyText}</pre>
            </details>

            <button className="qo-btn qo-btn-ghost" onClick={handleReset}>
              <ArrowLeft size={15} /> Nuevo pedido
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default QuickOrderPage
