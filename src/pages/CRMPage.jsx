import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import EmojiPicker from 'emoji-picker-react'
import './CRMPage.css'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_SERVICE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

// ── Icons (inline SVG) ──
const SearchIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
const SendIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4z"/><path d="m22 2-11 11"/></svg>
const SmileIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
const PaperclipIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
const PackageIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>
const ExternalIcon = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>
const MsgIcon = () => <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>

// ── Helpers ──
const getInitials = (name) => {
  if (!name) return '?'
  const p = name.trim().split(' ')
  return p.length >= 2 ? (p[0][0] + p[p.length - 1][0]).toUpperCase() : name.slice(0, 2).toUpperCase()
}

const formatTime = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const diff = Math.floor((now - d) / 86400000)
  if (diff === 0) return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
  if (diff === 1) return 'Ayer'
  if (diff < 7) return d.toLocaleDateString('es-AR', { weekday: 'short' })
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
}

const formatMsgTime = (iso) => !iso ? '' : new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })

const formatDate = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  const diff = Math.floor((new Date() - d) / 86400000)
  if (diff === 0) return 'Hoy'
  if (diff === 1) return 'Ayer'
  return d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })
}

const formatPrice = (p) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(p)

// ═══════════════════════════════════════
// CRM CHAT COMPONENT (embeddable)
// ═══════════════════════════════════════
export default function CRMChat() {
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

  // ── Fetch contacts ──
  const fetchContacts = useCallback(async () => {
    const { data: msgs } = await supabase
      .from('chat_messages')
      .select('phone, name, body, created_at, direction, is_read')
      .order('created_at', { ascending: false })
      .limit(5000)

    if (!msgs) return

    const map = new Map()
    msgs.forEach(msg => {
      if (!msg.phone || msg.phone === 'unknown') return
      if (!map.has(msg.phone)) {
        map.set(msg.phone, {
          phone: msg.phone, name: msg.name || msg.phone,
          lastMessage: msg.body || '📎 Adjunto',
          lastMessageTime: msg.created_at,
          unread: 0, hasOrder: false, orderStatus: null, ticketCode: null,
        })
      }
      if (msg.name && map.get(msg.phone).name === msg.phone) map.get(msg.phone).name = msg.name
      if (msg.direction === 'incoming' && !msg.is_read) map.get(msg.phone).unread++
    })

    const { data: ordersData } = await supabase.from('orders').select('client_phone, client_name, status, ticket_code')
    ordersData?.forEach(o => {
      const c = map.get(o.client_phone)
      if (c) { c.hasOrder = true; c.orderStatus = o.status; c.ticketCode = o.ticket_code; if (o.client_name) c.name = o.client_name }
    })

    setContacts(Array.from(map.values()).sort((a, b) => new Date(b.lastMessageTime) - new Date(a.lastMessageTime)))
    setLoadingContacts(false)
  }, [])

  // ── Fetch messages ──
  const fetchMessages = useCallback(async (phone) => {
    if (!phone) return
    const { data } = await supabase.from('chat_messages').select('*').eq('phone', phone).order('created_at', { ascending: true }).limit(500)
    setMessages(data || [])
    await supabase.from('chat_messages').update({ is_read: true }).eq('phone', phone).eq('direction', 'incoming').eq('is_read', false)
  }, [])

  // ── Fetch orders ──
  const fetchOrders = useCallback(async (phone) => {
    if (!phone) return
    const { data } = await supabase.from('orders').select('*, order_photos(*)').eq('client_phone', phone).order('created_at', { ascending: false })
    setOrders(data || [])
  }, [])

  // ── Select contact ──
  const selectContact = useCallback(async (contact) => {
    setSelectedContact(contact)
    setShowEmoji(false)
    fetchMessages(contact.phone)
    fetchOrders(contact.phone)
    setContacts(prev => prev.map(c => c.phone === contact.phone ? { ...c, unread: 0 } : c))
  }, [fetchMessages, fetchOrders])

  // ── Send message ──
  const handleSend = async () => {
    if (!newMessage.trim() || !selectedContact || sending) return
    setSending(true)
    const text = newMessage.trim()
    setMessages(prev => [...prev, { id: crypto.randomUUID(), phone: selectedContact.phone, direction: 'outgoing', body: text, created_at: new Date().toISOString(), _opt: true }])
    setNewMessage('')
    try {
      await fetch(`${supabaseUrl}/functions/v1/send-message`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: selectedContact.phone, message: text }) })
    } catch (_) {}
    setSending(false)
    inputRef.current?.focus()
  }

  // ── Send image ──
  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !selectedContact) return
    setSending(true)
    const ext = file.name.split('.').pop()
    const fileName = `crm_${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('photos').upload(`crm-uploads/${fileName}`, file, { cacheControl: '3600', upsert: true })
    if (error) { setSending(false); return }
    const { data: urlData } = supabase.storage.from('photos').getPublicUrl(`crm-uploads/${fileName}`)
    const mediaUrl = urlData.publicUrl
    setMessages(prev => [...prev, { id: crypto.randomUUID(), phone: selectedContact.phone, direction: 'outgoing', body: '📷 Imagen', media_url: mediaUrl, created_at: new Date().toISOString(), _opt: true }])
    try {
      await fetch(`${supabaseUrl}/functions/v1/send-message`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: selectedContact.phone, message: '📷', mediaUrl }) })
    } catch (_) {}
    setSending(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const onEmojiClick = (d) => { setNewMessage(p => p + d.emoji); inputRef.current?.focus() }

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])
  useEffect(() => { fetchContacts() }, [fetchContacts])
  useEffect(() => {
    const iv = setInterval(() => { fetchContacts(); if (selectedContact) fetchMessages(selectedContact.phone) }, 5000)
    return () => clearInterval(iv)
  }, [selectedContact, fetchContacts, fetchMessages])

  const handleKeyDown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }

  const filtered = contacts.filter(c => {
    if (!searchTerm) return true
    const t = searchTerm.toLowerCase()
    return c.name?.toLowerCase().includes(t) || c.phone?.includes(t) || c.ticketCode?.toLowerCase().includes(t)
  })

  const grouped = []
  let lastDate = null
  messages.forEach(msg => {
    const date = msg.created_at?.slice(0, 10)
    if (date !== lastDate) { grouped.push({ type: 'date', date: msg.created_at }); lastDate = date }
    grouped.push({ type: 'msg', ...msg })
  })

  // ═══════════════════════════
  // RENDER
  // ═══════════════════════════
  return (
    <div className="crm-wrapper">
      {/* ── LEFT: Contacts ── */}
      <aside className="crm-contacts">
        <div className="crm-contacts-header">
          <h2><MsgIcon /> Chats</h2>
          <div className="crm-search-box">
            <SearchIcon />
            <input type="text" placeholder="Buscar cliente..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>
        </div>
        <div className="crm-contacts-list">
          {loadingContacts ? (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)', fontSize: '0.8rem' }}>Cargando...</div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)', fontSize: '0.8rem' }}>{searchTerm ? 'Sin resultados' : 'No hay chats'}</div>
          ) : filtered.map(c => (
            <div key={c.phone} className={`crm-contact-item ${selectedContact?.phone === c.phone ? 'active' : ''}`} onClick={() => selectContact(c)}>
              <div className="crm-contact-avatar">{getInitials(c.name)}</div>
              <div className="crm-contact-info">
                <div className="crm-contact-name">
                  {c.name}
                  {c.hasOrder && <span className={`crm-order-indicator ${c.orderStatus === 'delivered' ? 'delivered' : 'pending'}`} style={{ marginLeft: 6 }}>{c.orderStatus === 'delivered' ? '✅' : '⏳'}</span>}
                </div>
                <div className="crm-contact-preview">{c.lastMessage?.slice(0, 45)}</div>
              </div>
              <div className="crm-contact-meta">
                <span className="crm-contact-time">{formatTime(c.lastMessageTime)}</span>
                {c.unread > 0 && <span className="crm-contact-badge">{c.unread}</span>}
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* ── CENTER: Chat ── */}
      <main className="crm-chat">
        {!selectedContact ? (
          <div className="crm-chat-empty"><MsgIcon /><p>Seleccioná un chat</p></div>
        ) : (
          <>
            <div className="crm-chat-header">
              <div className="crm-contact-avatar" style={{ width: 36, height: 36, fontSize: 12 }}>{getInitials(selectedContact.name)}</div>
              <div className="crm-chat-header-info">
                <h3>{selectedContact.name}</h3>
                <span>{selectedContact.phone}</span>
              </div>
            </div>

            <div className="crm-messages">
              {grouped.map((item, i) => {
                if (item.type === 'date') return <div key={`d-${i}`} className="crm-msg-date-divider"><span>{formatDate(item.date)}</span></div>
                return (
                  <div key={item.id || i} className={`crm-msg ${item.direction}`}>
                    {item.media_url && <img src={item.media_url} className="crm-msg-media" alt="" onClick={() => window.open(item.media_url, '_blank')} loading="lazy" />}
                    {item.body && <div className="crm-msg-body">{item.body}</div>}
                    <div className="crm-msg-time">{formatMsgTime(item.created_at)}</div>
                  </div>
                )
              })}
              <div ref={chatEndRef} />
            </div>

            <div className="crm-input-area">
              {showEmoji && <div className="crm-emoji-picker"><EmojiPicker onEmojiClick={onEmojiClick} theme="dark" height={320} width={300} searchPlaceholder="Buscar..." previewConfig={{ showPreview: false }} /></div>}
              <div className="crm-input-actions">
                <button className={`crm-input-btn ${showEmoji ? 'active' : ''}`} onClick={() => setShowEmoji(!showEmoji)}><SmileIcon /></button>
                <button className="crm-input-btn" onClick={() => fileInputRef.current?.click()}><PaperclipIcon /></button>
                <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageUpload} />
              </div>
              <textarea ref={inputRef} className="crm-text-input" placeholder="Escribir mensaje..." value={newMessage} onChange={e => setNewMessage(e.target.value)} onKeyDown={handleKeyDown} onFocus={() => setShowEmoji(false)} rows={1} />
              <button className="crm-send-btn" onClick={handleSend} disabled={!newMessage.trim() || sending}><SendIcon /></button>
            </div>
          </>
        )}
      </main>

      {/* ── RIGHT: Client Info ── */}
      <aside className="crm-info">
        {!selectedContact ? (
          <div className="crm-info-empty"><PackageIcon /><p style={{ fontSize: '0.75rem' }}>Info del cliente</p></div>
        ) : (
          <>
            <div className="crm-info-header">
              <div className="crm-info-avatar">{getInitials(selectedContact.name)}</div>
              <h3>{selectedContact.name}</h3>
              <span className="crm-info-phone">{selectedContact.phone}</span>
            </div>

            {orders.length > 0 && (
              <div className="crm-info-section">
                <h4><PackageIcon /> Pedidos ({orders.length})</h4>
                {orders.map(order => (
                  <div key={order.id} className="crm-order-card">
                    <div className="crm-order-row">
                      <span className="crm-order-ticket">{order.ticket_code}</span>
                      <span className={`crm-order-status ${order.status}`}>{order.status === 'delivered' ? 'Entregado' : order.status === 'sending' ? 'Enviando' : 'Pendiente'}</span>
                    </div>
                    <div className="crm-order-detail">Evento: <strong>{order.event_name}</strong></div>
                    <div className="crm-order-detail">Total: <strong>{formatPrice(order.total_price)}</strong></div>
                    <div className="crm-order-detail">Fotos: <strong>{order.order_photos?.length || 0}</strong></div>
                    <div className="crm-order-detail">Fecha: <strong>{new Date(order.created_at).toLocaleDateString('es-AR')}</strong></div>
                    <a href={`/${order.ticket_code}`} target="_blank" rel="noopener noreferrer" className="crm-order-link"><ExternalIcon /> Ver galería</a>
                    {order.order_photos?.length > 0 && (
                      <div className="crm-photos-grid">
                        {order.order_photos.slice(0, 9).map(p => (
                          <div key={p.id} className="crm-photo-thumb">
                            {p.storage_url ? <img src={p.storage_url} alt={p.photo_name} loading="lazy" onClick={() => window.open(p.storage_url, '_blank')} /> : <div style={{ width: '100%', height: '100%', background: 'var(--bg-container-low)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 10 }}>📷</div>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {orders.length === 0 && (
              <div className="crm-info-section">
                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', textAlign: 'center', padding: 20 }}>Sin pedidos</div>
              </div>
            )}
          </>
        )}
      </aside>
    </div>
  )
}
