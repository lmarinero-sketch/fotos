import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import EmojiPicker from 'emoji-picker-react'
import './CRMPage.css'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_SERVICE_KEY
const supabase = createClient(supabaseUrl, supabaseKey)
const adminPassword = import.meta.env.VITE_ADMIN_PASSWORD

// ── Icons (inline SVG to avoid extra deps) ──
const SearchIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
const SendIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4z"/><path d="m22 2-11 11"/></svg>
const SmileIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
const PaperclipIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
const PackageIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>
const ExternalIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>
const MessageIcon = () => <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
const ImageIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>

// ── Helpers ──
const getInitials = (name) => {
  if (!name) return '?'
  const parts = name.trim().split(' ')
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase()
}

const formatTime = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now - d
  const diffDays = Math.floor(diffMs / 86400000)
  
  if (diffDays === 0) return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
  if (diffDays === 1) return 'Ayer'
  if (diffDays < 7) return d.toLocaleDateString('es-AR', { weekday: 'short' })
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
}

const formatMsgTime = (iso) => {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}

const formatDate = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const diffDays = Math.floor((now - d) / 86400000)
  if (diffDays === 0) return 'Hoy'
  if (diffDays === 1) return 'Ayer'
  return d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })
}

const formatPrice = (price) => {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(price)
}

// ═══════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════
export default function CRMPage() {
  // ── Auth ──
  const [isAuth, setIsAuth] = useState(false)
  const [password, setPassword] = useState('')

  // ── CRM State ──
  const [contacts, setContacts] = useState([])
  const [selectedContact, setSelectedContact] = useState(null)
  const [messages, setMessages] = useState([])
  const [orders, setOrders] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [showEmoji, setShowEmoji] = useState(false)
  const [sending, setSending] = useState(false)
  const [loadingContacts, setLoadingContacts] = useState(true)

  const chatEndRef = useRef(null)
  const fileInputRef = useRef(null)
  const inputRef = useRef(null)

  // ── Auth handler ──
  const handleLogin = (e) => {
    e.preventDefault()
    if (password === adminPassword) {
      setIsAuth(true)
    }
  }

  // ── Fetch contacts ──
  const fetchContacts = useCallback(async () => {
    const { data: msgs } = await supabase
      .from('chat_messages')
      .select('phone, name, body, created_at, direction, is_read')
      .order('created_at', { ascending: false })
      .limit(5000)

    if (!msgs) return

    const contactMap = new Map()
    msgs.forEach(msg => {
      if (!msg.phone || msg.phone === 'unknown') return
      if (!contactMap.has(msg.phone)) {
        contactMap.set(msg.phone, {
          phone: msg.phone,
          name: msg.name || msg.phone,
          lastMessage: msg.body || '📎 Adjunto',
          lastMessageTime: msg.created_at,
          unread: 0,
          hasOrder: false,
          orderStatus: null,
          ticketCode: null,
        })
      }
      // Update name if we get a better one
      if (msg.name && contactMap.get(msg.phone).name === msg.phone) {
        contactMap.get(msg.phone).name = msg.name
      }
      if (msg.direction === 'incoming' && !msg.is_read) {
        contactMap.get(msg.phone).unread++
      }
    })

    // Cross-reference with orders
    const { data: ordersData } = await supabase
      .from('orders')
      .select('client_phone, client_name, status, ticket_code')

    ordersData?.forEach(order => {
      const contact = contactMap.get(order.client_phone)
      if (contact) {
        contact.hasOrder = true
        contact.orderStatus = order.status
        contact.ticketCode = order.ticket_code
        if (order.client_name) contact.name = order.client_name
      }
    })

    setContacts(
      Array.from(contactMap.values()).sort((a, b) =>
        new Date(b.lastMessageTime) - new Date(a.lastMessageTime)
      )
    )
    setLoadingContacts(false)
  }, [])

  // ── Fetch messages for selected contact ──
  const fetchMessages = useCallback(async (phone) => {
    if (!phone) return

    const { data } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('phone', phone)
      .order('created_at', { ascending: true })
      .limit(500)

    setMessages(data || [])

    // Mark as read
    await supabase
      .from('chat_messages')
      .update({ is_read: true })
      .eq('phone', phone)
      .eq('direction', 'incoming')
      .eq('is_read', false)
  }, [])

  // ── Fetch orders for selected contact ──
  const fetchOrders = useCallback(async (phone) => {
    if (!phone) return

    const { data } = await supabase
      .from('orders')
      .select('*, order_photos(*)')
      .eq('client_phone', phone)
      .order('created_at', { ascending: false })

    setOrders(data || [])
  }, [])

  // ── Select contact ──
  const selectContact = useCallback(async (contact) => {
    setSelectedContact(contact)
    setShowEmoji(false)
    fetchMessages(contact.phone)
    fetchOrders(contact.phone)
    // Update unread in local state
    setContacts(prev => prev.map(c =>
      c.phone === contact.phone ? { ...c, unread: 0 } : c
    ))
  }, [fetchMessages, fetchOrders])

  // ── Send message ──
  const handleSend = async () => {
    if (!newMessage.trim() || !selectedContact || sending) return
    setSending(true)

    const text = newMessage.trim()
    
    // Optimistic update
    const optimisticMsg = {
      id: crypto.randomUUID(),
      phone: selectedContact.phone,
      direction: 'outgoing',
      body: text,
      created_at: new Date().toISOString(),
      _optimistic: true
    }
    setMessages(prev => [...prev, optimisticMsg])
    setNewMessage('')

    try {
      await fetch(`${supabaseUrl}/functions/v1/send-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: selectedContact.phone,
          message: text
        })
      })
    } catch (_) { /* fail silently, message was stored optimistically */ }

    setSending(false)
    inputRef.current?.focus()
  }

  // ── Send image ──
  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !selectedContact) return

    setSending(true)

    // Upload to Supabase Storage
    const ext = file.name.split('.').pop()
    const fileName = `crm_${Date.now()}.${ext}`
    const { data: uploadData, error } = await supabase.storage
      .from('photos')
      .upload(`crm-uploads/${fileName}`, file, { cacheControl: '3600', upsert: true })

    if (error) {
      console.error('Upload error:', error)
      setSending(false)
      return
    }

    const { data: urlData } = supabase.storage
      .from('photos')
      .getPublicUrl(`crm-uploads/${fileName}`)

    const mediaUrl = urlData.publicUrl

    // Optimistic update
    const optimisticMsg = {
      id: crypto.randomUUID(),
      phone: selectedContact.phone,
      direction: 'outgoing',
      body: '📷 Imagen',
      media_url: mediaUrl,
      created_at: new Date().toISOString(),
      _optimistic: true
    }
    setMessages(prev => [...prev, optimisticMsg])

    try {
      await fetch(`${supabaseUrl}/functions/v1/send-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: selectedContact.phone,
          message: '📷',
          mediaUrl: mediaUrl
        })
      })
    } catch (_) {}

    setSending(false)
    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // ── Emoji select ──
  const onEmojiClick = (emojiData) => {
    setNewMessage(prev => prev + emojiData.emoji)
    inputRef.current?.focus()
  }

  // ── Scroll to bottom ──
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Initial load ──
  useEffect(() => {
    if (isAuth) fetchContacts()
  }, [isAuth, fetchContacts])

  // ── Polling every 5s for new messages ──
  useEffect(() => {
    if (!isAuth) return
    const interval = setInterval(() => {
      fetchContacts()
      if (selectedContact) fetchMessages(selectedContact.phone)
    }, 5000)
    return () => clearInterval(interval)
  }, [isAuth, selectedContact, fetchContacts, fetchMessages])

  // ── Keyboard shortcut: Enter to send ──
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // ── Filter contacts ──
  const filteredContacts = contacts.filter(c => {
    if (!searchTerm) return true
    const term = searchTerm.toLowerCase()
    return c.name?.toLowerCase().includes(term) || c.phone?.includes(term) || c.ticketCode?.toLowerCase().includes(term)
  })

  // ── Group messages by date ──
  const groupedMessages = []
  let lastDate = null
  messages.forEach(msg => {
    const date = msg.created_at?.slice(0, 10)
    if (date !== lastDate) {
      groupedMessages.push({ type: 'date', date: msg.created_at })
      lastDate = date
    }
    groupedMessages.push({ type: 'msg', ...msg })
  })

  // ═════════════════════════════════════
  // AUTH SCREEN
  // ═════════════════════════════════════
  if (!isAuth) {
    return (
      <div className="crm-auth">
        <form className="crm-auth-card" onSubmit={handleLogin}>
          <h1>💬 CRM Chat</h1>
          <p className="auth-subtitle">Ingresá la contraseña del panel</p>
          <input
            type="password"
            placeholder="Contraseña"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoFocus
          />
          <button type="submit">Ingresar</button>
        </form>
      </div>
    )
  }

  // ═════════════════════════════════════
  // MAIN CRM UI
  // ═════════════════════════════════════
  return (
    <div className="crm-container">
      {/* ── LEFT: Contacts ── */}
      <aside className="crm-contacts">
        <div className="crm-contacts-header">
          <h2>💬 Chats</h2>
          <div className="crm-search-box">
            <SearchIcon />
            <input
              type="text"
              placeholder="Buscar cliente o teléfono..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        <div className="crm-contacts-list">
          {loadingContacts ? (
            <div style={{ textAlign: 'center', padding: '32px', color: 'var(--crm-text-muted)' }}>
              Cargando contactos...
            </div>
          ) : filteredContacts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px', color: 'var(--crm-text-muted)' }}>
              {searchTerm ? 'Sin resultados' : 'No hay conversaciones aún'}
            </div>
          ) : filteredContacts.map(contact => (
            <div
              key={contact.phone}
              className={`crm-contact-item ${selectedContact?.phone === contact.phone ? 'active' : ''}`}
              onClick={() => selectContact(contact)}
            >
              <div className="crm-contact-avatar">{getInitials(contact.name)}</div>
              <div className="crm-contact-info">
                <div className="crm-contact-name">
                  {contact.name}
                  {contact.hasOrder && (
                    <span className={`crm-order-badge ${contact.orderStatus === 'delivered' ? 'delivered' : 'pending'}`}
                      style={{ marginLeft: 8 }}>
                      {contact.orderStatus === 'delivered' ? '✅' : '⏳'}
                    </span>
                  )}
                </div>
                <div className="crm-contact-preview">
                  {contact.lastMessage?.slice(0, 50)}
                </div>
              </div>
              <div className="crm-contact-meta">
                <span className="crm-contact-time">{formatTime(contact.lastMessageTime)}</span>
                {contact.unread > 0 && (
                  <span className="crm-contact-badge">{contact.unread}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* ── CENTER: Chat ── */}
      <main className="crm-chat">
        {!selectedContact ? (
          <div className="crm-chat-empty">
            <MessageIcon />
            <p>Seleccioná un chat para empezar</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="crm-chat-header">
              <div className="crm-contact-avatar" style={{ width: 40, height: 40, fontSize: 14 }}>
                {getInitials(selectedContact.name)}
              </div>
              <div className="crm-chat-header-info">
                <h3>{selectedContact.name}</h3>
                <span>{selectedContact.phone}</span>
              </div>
            </div>

            {/* Messages */}
            <div className="crm-messages">
              {groupedMessages.map((item, i) => {
                if (item.type === 'date') {
                  return (
                    <div key={`date-${i}`} className="crm-msg-date-divider">
                      <span>{formatDate(item.date)}</span>
                    </div>
                  )
                }
                return (
                  <div key={item.id || i} className={`crm-msg ${item.direction}`}>
                    {item.media_url && (
                      <img
                        src={item.media_url}
                        className="crm-msg-media"
                        alt="adjunto"
                        onClick={() => window.open(item.media_url, '_blank')}
                        loading="lazy"
                      />
                    )}
                    {item.body && <div className="crm-msg-body">{item.body}</div>}
                    <div className="crm-msg-time">{formatMsgTime(item.created_at)}</div>
                  </div>
                )
              })}
              <div ref={chatEndRef} />
            </div>

            {/* Input */}
            <div className="crm-input-area">
              {showEmoji && (
                <div className="crm-emoji-picker">
                  <EmojiPicker
                    onEmojiClick={onEmojiClick}
                    theme="dark"
                    height={350}
                    width={320}
                    searchPlaceholder="Buscar emoji..."
                    previewConfig={{ showPreview: false }}
                  />
                </div>
              )}
              <div className="crm-input-actions">
                <button
                  className={`crm-input-btn ${showEmoji ? 'active' : ''}`}
                  onClick={() => setShowEmoji(!showEmoji)}
                  title="Emojis"
                >
                  <SmileIcon />
                </button>
                <button
                  className="crm-input-btn"
                  onClick={() => fileInputRef.current?.click()}
                  title="Adjuntar imagen"
                >
                  <PaperclipIcon />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={handleImageUpload}
                />
              </div>
              <textarea
                ref={inputRef}
                className="crm-text-input"
                placeholder="Escribir mensaje..."
                value={newMessage}
                onChange={e => setNewMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => setShowEmoji(false)}
                rows={1}
              />
              <button
                className="crm-send-btn"
                onClick={handleSend}
                disabled={!newMessage.trim() || sending}
                title="Enviar"
              >
                <SendIcon />
              </button>
            </div>
          </>
        )}
      </main>

      {/* ── RIGHT: Client Info ── */}
      <aside className="crm-info">
        {!selectedContact ? (
          <div className="crm-info-empty">
            <PackageIcon />
            <p style={{ fontSize: 13 }}>Info del cliente aparecerá aquí</p>
          </div>
        ) : (
          <>
            {/* Contact header */}
            <div className="crm-info-header">
              <div className="crm-info-avatar">{getInitials(selectedContact.name)}</div>
              <h3>{selectedContact.name}</h3>
              <span className="crm-info-phone">{selectedContact.phone}</span>
            </div>

            {/* Orders */}
            {orders.length > 0 && (
              <div className="crm-info-section">
                <h4><PackageIcon /> Pedidos ({orders.length})</h4>
                {orders.map(order => (
                  <div key={order.id} className="crm-order-card">
                    <div className="crm-order-row">
                      <span className="crm-order-ticket">{order.ticket_code}</span>
                      <span className={`crm-order-status ${order.status}`}>{
                        order.status === 'delivered' ? 'Entregado' :
                        order.status === 'sending' ? 'Enviando' :
                        order.status === 'awaiting_payment' ? 'Pendiente' :
                        order.status
                      }</span>
                    </div>
                    <div className="crm-order-detail">
                      Evento: <strong>{order.event_name}</strong>
                    </div>
                    <div className="crm-order-detail">
                      Total: <strong>{formatPrice(order.total_price)}</strong>
                    </div>
                    <div className="crm-order-detail">
                      Fotos: <strong>{order.order_photos?.length || 0}</strong>
                    </div>
                    <div className="crm-order-detail">
                      Fecha: <strong>{new Date(order.created_at).toLocaleDateString('es-AR')}</strong>
                    </div>

                    {/* Gallery link */}
                    <a
                      href={`/${order.ticket_code}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="crm-order-link"
                    >
                      <ExternalIcon /> Ver galería del cliente
                    </a>

                    {/* Photo thumbnails */}
                    {order.order_photos?.length > 0 && (
                      <div className="crm-photos-grid">
                        {order.order_photos.slice(0, 9).map(photo => (
                          <div key={photo.id} className="crm-photo-thumb">
                            {photo.storage_url ? (
                              <img
                                src={photo.storage_url}
                                alt={photo.photo_name}
                                loading="lazy"
                                onClick={() => window.open(photo.storage_url, '_blank')}
                              />
                            ) : (
                              <div style={{
                                width: '100%',
                                height: '100%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                background: 'rgba(255,255,255,0.03)'
                              }}>
                                <ImageIcon />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {order.order_photos?.length > 9 && (
                      <div style={{ color: 'var(--crm-text-muted)', fontSize: 11, textAlign: 'center', marginTop: 6 }}>
                        +{order.order_photos.length - 9} fotos más
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* No orders */}
            {orders.length === 0 && (
              <div className="crm-info-section">
                <div style={{ color: 'var(--crm-text-muted)', fontSize: 13, textAlign: 'center', padding: 20 }}>
                  Este cliente no tiene pedidos
                </div>
              </div>
            )}
          </>
        )}
      </aside>
    </div>
  )
}
