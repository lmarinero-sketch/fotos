import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import {
  Upload, FolderPlus, Image, Check, AlertCircle,
  Loader2, X, LogOut, Plus, ChevronRight, Camera, Trash2, ArrowLeft,
  ShoppingCart, Send, BarChart3, AlertTriangle, TrendingUp, Bug
} from 'lucide-react'
import './PhotographerPanel.css'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

// Sanitize filenames for Supabase Storage (no accents, no special chars)
const sanitizeFileName = (name) => {
  return name
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/\s+/g, '_')                             // Spaces → underscores
    .replace(/[()\[\]{}]/g, '')                        // Remove brackets
    .replace(/[^a-zA-Z0-9._-]/g, '')                   // Keep only safe chars
    .toLowerCase()
}

const sanitizeSlug = (name) => {
  return name
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .toLowerCase()
}

const PhotographerPanel = () => {
  // Auth state
  const [session, setSession] = useState(null)
  const [authMode, setAuthMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState('')

  // App state
  const [view, setView] = useState('events') // 'events' | 'workspace'
  const [panelTab, setPanelTab] = useState('upload') // 'upload' | 'orders'
  const [dashboardTab, setDashboardTab] = useState('events') // 'events' | 'metrics' | 'errors'
  const [events, setEvents] = useState([])
  const [globalMetrics, setGlobalMetrics] = useState([])
  const [systemErrors, setSystemErrors] = useState([])
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [newEventName, setNewEventName] = useState('')
  const [pricePerPhoto, setPricePerPhoto] = useState('3000')
  const [packPrice, setPackPrice] = useState('15000')
  const [creatingEvent, setCreatingEvent] = useState(false)
  const [showNewEvent, setShowNewEvent] = useState(false)

  // Orders State
  const [eventOrders, setEventOrders] = useState([])
  const [expandedOrder, setExpandedOrder] = useState(null)
  const [resendingOrder, setResendingOrder] = useState(null)

  // Upload state
  const [files, setFiles] = useState([])
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState({})
  const [uploadComplete, setUploadComplete] = useState(false)
  const [eventPhotos, setEventPhotos] = useState([])

  // Check session on mount
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setSession(session)
    })
    return () => subscription.unsubscribe()
  }, [])

  // Load events and metrics when authenticated
  useEffect(() => {
    if (session) {
      loadEvents()
      loadDashboardData()
    }
  }, [session])

  // ── Auth ──
  const handleAuth = async (e) => {
    e.preventDefault()
    setAuthLoading(true)
    setAuthError('')

    try {
      if (authMode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      } else {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        setAuthError('✅ Revisá tu email para confirmar la cuenta')
        setAuthMode('login')
      }
    } catch (err) {
      setAuthError(err.message)
    }
    setAuthLoading(false)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setSession(null)
    setView('events')
  }

  // ── Events ──
  const loadEvents = async () => {
    const { data } = await supabase
      .from('events')
      .select('*')
      .order('created_at', { ascending: false })

    setEvents(data || [])
  }

  const loadDashboardData = async () => {
    // Orders / Sales data
    const { data: sales } = await supabase
      .from('orders')
      .select('event_name, total_price, status')
      
    // Errors data
    const { data: errorsList } = await supabase
      .from('system_errors')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(30)
      
    setGlobalMetrics(sales || [])
    setSystemErrors(errorsList || [])
  }

  const createEvent = async () => {
    if (!newEventName.trim()) return
    setCreatingEvent(true)

    const slug = sanitizeSlug(newEventName.trim())

    const { data, error } = await supabase
      .from('events')
      .insert({
        name: newEventName.trim(),
        slug,
        photographer_id: session.user.id,
        price_per_photo: parseInt(pricePerPhoto, 10) || 3000,
        price_pack: parseInt(packPrice, 10) || 15000,
      })
      .select()
      .single()

    if (!error && data) {
      setEvents(prev => [data, ...prev])
      setNewEventName('')
      setPricePerPhoto('3000')
      setPackPrice('15000')
      setShowNewEvent(false)
      // Auto-select and go to workspace
      setSelectedEvent(data)
      setView('workspace')
      setPanelTab('upload')
      loadEventPhotos(data.slug)
      loadEventOrders(data.name)
    }
    setCreatingEvent(false)
  }

  const deleteEvent = async (event, e) => {
    e.stopPropagation()
    if (!confirm(`¿Eliminar "${event.name}" y todas sus fotos?`)) return

    // Delete storage files
    const { data: files } = await supabase.storage
      .from('photos')
      .list(`events/${event.slug}`)

    if (files?.length > 0) {
      const filePaths = files.map(f => `events/${event.slug}/${f.name}`)
      await supabase.storage.from('photos').remove(filePaths)
    }

    // Delete DB record
    await supabase.from('events').delete().eq('id', event.id)
    setEvents(prev => prev.filter(ev => ev.id !== event.id))
  }

  const selectEvent = async (event) => {
    setSelectedEvent(event)
    setView('workspace')
    setPanelTab('upload')
    await loadEventPhotos(event.slug)
    await loadEventOrders(event.name)
  }

  // ── Orders ──
  const loadEventOrders = async (eventName) => {
    const { data } = await supabase
      .from('orders')
      .select('*, order_photos(*)')
      .ilike('event_name', eventName)
      .order('created_at', { ascending: false })
    setEventOrders(data || [])
  }

  const resendOrder = async (order, e) => {
    e.stopPropagation()
    setResendingOrder(order.id)
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/approve-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket_code: order.ticket_code })
      })
      if (!res.ok) throw new Error('Error de red')
      alert('Imágenes reenviadas con éxito')
    } catch (error) {
      alert('Hubo un error al reenviar: ' + error.message)
    } finally {
      setResendingOrder(null)
    }
  }

  // ── Photos ──
  const loadEventPhotos = async (slug) => {
    const { data } = await supabase.storage
      .from('photos')
      .list(`events/${slug}`, { limit: 500, sortBy: { column: 'name', order: 'asc' } })

    setEventPhotos(data?.filter(f => f.name !== '.emptyFolderPlaceholder') || [])
  }

  const handleFileSelect = useCallback((e) => {
    const selected = Array.from(e.target.files || [])
    const images = selected.filter(f => f.type.startsWith('image/'))
    setFiles(prev => [...prev, ...images])
    setUploadComplete(false)
  }, [])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    e.currentTarget.classList.remove('drag-over')
    const dropped = Array.from(e.dataTransfer.files)
    const images = dropped.filter(f => f.type.startsWith('image/'))
    setFiles(prev => [...prev, ...images])
    setUploadComplete(false)
  }, [])

  const removeFile = (index) => {
    setFiles(prev => prev.filter((_, i) => i !== index))
  }

  const handleUpload = async () => {
    if (files.length === 0 || !selectedEvent) return
    setUploading(true)
    setUploadComplete(false)

    const folderPath = `events/${selectedEvent.slug}`
    let successCount = 0

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const safeName = sanitizeFileName(file.name)
      const filePath = `${folderPath}/${safeName}`

      setUploadProgress(prev => ({ ...prev, [i]: 'uploading' }))

      const { error } = await supabase.storage
        .from('photos')
        .upload(filePath, file, { cacheControl: '3600', upsert: true })

      if (!error) {
        successCount++
        setUploadProgress(prev => ({ ...prev, [i]: 'done' }))
      } else {
        console.error(`Upload failed: ${file.name}`, error)
        setUploadProgress(prev => ({ ...prev, [i]: 'error' }))
      }
    }

    // Update event photo count
    await supabase
      .from('events')
      .update({ photo_count: (selectedEvent.photo_count || 0) + successCount })
      .eq('id', selectedEvent.id)

    setSelectedEvent(prev => ({
      ...prev,
      photo_count: (prev.photo_count || 0) + successCount,
    }))

    setUploading(false)
    setUploadComplete(true)

    // Reload photos
    await loadEventPhotos(selectedEvent.slug)

    // Clear form after delay
    setTimeout(() => {
      setFiles([])
      setUploadProgress({})
    }, 2000)
  }

  const deletePhoto = async (photo) => {
    const filePath = `events/${selectedEvent.slug}/${photo.name}`
    await supabase.storage.from('photos').remove([filePath])
    setEventPhotos(prev => prev.filter(p => p.name !== photo.name))

    await supabase
      .from('events')
      .update({ photo_count: Math.max(0, (selectedEvent.photo_count || 1) - 1) })
      .eq('id', selectedEvent.id)
  }

  const formatSize = (bytes) => {
    if (!bytes) return ''
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const totalSize = files.reduce((acc, f) => acc + f.size, 0)

  // ────────────────────────────────
  // LOGIN SCREEN
  // ────────────────────────────────
  if (!session) {
    return (
      <div className="panel-container">
        <div className="panel-login">
          <img src="/logo_creadores_jerpro.png" alt="JERPRO" className="panel-login-logo" />
          <h1>JERPRO</h1>
          <p>Panel del fotógrafo</p>
          <form onSubmit={handleAuth} className="login-form">
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="login-input"
              autoFocus
            />
            <input
              type="password"
              placeholder="Contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="login-input"
            />
            <button type="submit" className="login-btn" disabled={authLoading}>
              {authLoading ? <Loader2 size={18} className="spin" /> : (authMode === 'login' ? 'Ingresar' : 'Registrarse')}
            </button>
            <button
              type="button"
              className="login-toggle"
              onClick={() => { setAuthMode(authMode === 'login' ? 'signup' : 'login'); setAuthError('') }}
            >
              {authMode === 'login' ? '¿No tenés cuenta? Registrate' : '¿Ya tenés cuenta? Ingresá'}
            </button>
            {authError && <p className={`login-error ${authError.startsWith('✅') ? 'success' : ''}`}>{authError}</p>}
          </form>
        </div>
      </div>
    )
  }

  // ────────────────────────────────
  // EVENTS LIST
  // ────────────────────────────────
  if (view === 'events') {
    return (
      <div className="panel-container">
        <header className="panel-header dashboard-header">
          <div className="panel-brand">
            <img src="/logo_creadores_jerpro.png" alt="JERPRO" className="brand-logo" />
            <span className="brand-tag">Fotógrafo Central</span>
          </div>
          <div className="event-tabs">
            <button className={`tab-btn ${dashboardTab === 'events' ? 'active' : ''}`} onClick={() => setDashboardTab('events')}>
              <Camera size={14} /> Eventos
            </button>
            <button className={`tab-btn ${dashboardTab === 'metrics' ? 'active' : ''}`} onClick={() => setDashboardTab('metrics')}>
              <BarChart3 size={14} /> Métricas
            </button>
            <button className={`tab-btn ${dashboardTab === 'errors' ? 'active' : ''}`} onClick={() => setDashboardTab('errors')}>
              <Bug size={14} /> Errores
            </button>
          </div>
          <button className="btn-logout" onClick={handleLogout} aria-label="Cerrar sesión">
            <LogOut size={18} />
          </button>
        </header>

        <main className="panel-main">
          {dashboardTab === 'events' && (
            <div className="panel-card">
              <div className="card-header">
                <h2><Camera size={22} /> Mis Eventos</h2>
                <button className="btn-ghost" onClick={() => setShowNewEvent(!showNewEvent)}>
                  <Plus size={18} />
                  Nuevo evento
                </button>
              </div>

              {/* New Event Form */}
              {showNewEvent && (
              <div className="new-event-form">
                <input
                  type="text"
                  placeholder="Nombre del evento (ej: Boda Ana y Carlos)"
                  value={newEventName}
                  onChange={(e) => setNewEventName(e.target.value)}
                  className="field-input"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && createEvent()}
                />
                <div className="new-event-prices">
                  <input
                    type="number"
                    placeholder="Precio por foto (ej: 5000)"
                    value={pricePerPhoto}
                    onChange={(e) => setPricePerPhoto(e.target.value)}
                    className="field-input"
                    min="0"
                  />
                  <input
                    type="number"
                    placeholder="Precio por pack (ej: 15000)"
                    value={packPrice}
                    onChange={(e) => setPackPrice(e.target.value)}
                    className="field-input"
                    min="0"
                  />
                </div>
                <div className="new-event-actions">
                  <button className="btn-cancel" onClick={() => { setShowNewEvent(false); setNewEventName('') }}>
                    Cancelar
                  </button>
                  <button className="btn-create" onClick={createEvent} disabled={creatingEvent || !newEventName.trim()}>
                    {creatingEvent ? <Loader2 size={16} className="spin" /> : <FolderPlus size={16} />}
                    Crear evento
                  </button>
                </div>
              </div>
            )}

            {/* Event List */}
            {events.length === 0 ? (
              <div className="empty-state">
                <Camera size={48} />
                <p>No tenés eventos aún</p>
                <p className="empty-hint">Creá tu primer evento y subí las fotos</p>
              </div>
            ) : (
              <div className="event-list">
                {events.map(event => (
                  <div key={event.id} className="event-item" onClick={() => selectEvent(event)}>
                    <div className="event-icon">
                      <FolderPlus size={20} />
                    </div>
                    <div className="event-info">
                      <span className="event-name">{event.name}</span>
                      <span className="event-meta">
                        {event.photo_count || 0} fotos · {new Date(event.created_at).toLocaleDateString('es-AR')}
                      </span>
                    </div>
                    <div className="event-actions">
                      <button
                        className="btn-icon-danger"
                        onClick={(e) => deleteEvent(event, e)}
                        aria-label="Eliminar evento"
                      >
                        <Trash2 size={16} />
                      </button>
                      <ChevronRight size={18} className="event-chevron" />
                    </div>
                  </div>
                ))}
              </div>
            )}
            </div>
          )}

          {/* ── METRICS TAB ── */}
          {dashboardTab === 'metrics' && (() => {
            const deliveredRevenue = globalMetrics.filter(m => m.status === 'delivered').reduce((a, b) => a + (b.total_price || 0), 0)
            const potentialRevenue = globalMetrics.filter(m => m.status === 'awaiting_payment').reduce((a, b) => a + (b.total_price || 0), 0)
            const revenueByEvent = globalMetrics.filter(m => m.status === 'delivered').reduce((acc, o) => {
              acc[o.event_name] = (acc[o.event_name] || 0) + (o.total_price || 0)
              return acc
            }, {})
            const topEventsObj = Object.entries(revenueByEvent).sort((a,b) => b[1] - a[1]).slice(0, 5)

            return (
              <div className="panel-card">
                <h2><TrendingUp size={22} /> Tablero de Ventas</h2>
                <div className="metrics-grid">
                  <div className="metric-box success">
                    <span>Recaudación Total (Cobrado)</span>
                    <h3>${deliveredRevenue.toLocaleString('es-AR')}</h3>
                  </div>
                  <div className="metric-box pending">
                    <span>Ventas Pendientes (Sin abonar)</span>
                    <h3>${potentialRevenue.toLocaleString('es-AR')}</h3>
                  </div>
                </div>

                <div className="top-events-section">
                  <h3>🏆 Eventos más rentables</h3>
                  {topEventsObj.length === 0 ? (
                    <p className="empty-state-text">No hay suficientes datos de ventas procesadas.</p>
                  ) : (
                    <div className="top-events-list">
                      {topEventsObj.map(([evtName, amount], i) => (
                        <div key={evtName} className="top-event-item">
                          <span className="rank-badge">#{i+1}</span>
                          <span className="evt-name">{evtName}</span>
                          <span className="evt-revenue">${amount.toLocaleString('es-AR')}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })()}

          {/* ── ERRORS TAB ── */}
          {dashboardTab === 'errors' && (
            <div className="panel-card">
              <h2><AlertTriangle size={22} className="status-error" /> Registro de Errores (Logs)</h2>
              {systemErrors.length === 0 ? (
                <div className="empty-state">
                  <Check size={48} className="status-success" />
                  <p>Sistemas operativos. Todo verde.</p>
                </div>
              ) : (
                <div className="error-log-list">
                  {systemErrors.map(err => (
                    <div key={err.id} className="error-card">
                      <div className="error-header">
                        <span className="error-date">{new Date(err.created_at).toLocaleString('es-AR')}</span>
                        <span className="error-source badge-error">{err.error_source}</span>
                      </div>
                      <p className="error-message">{err.error_message}</p>
                      {err.payload && (
                        <pre className="error-payload">{JSON.stringify(err.payload, null, 2)}</pre>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    )
  }

  // ────────────────────────────────
  // UPLOAD VIEW
  // ────────────────────────────────
  return (
    <div className="panel-container">
      <header className="panel-header">
        <button className="btn-back" onClick={() => { setView('events'); setFiles([]); setUploadProgress({}) }}>
          <ArrowLeft size={18} />
        </button>
        <div className="panel-brand">
          <span className="event-title-header">{selectedEvent?.name}</span>
          <span className="brand-tag">{selectedEvent?.photo_count || 0} fotos</span>
        </div>
        <div className="event-tabs">
          <button className={`tab-btn ${panelTab === 'upload' ? 'active' : ''}`} onClick={() => setPanelTab('upload')}>
            Subir Fotos
          </button>
          <button className={`tab-btn ${panelTab === 'orders' ? 'active' : ''}`} onClick={() => setPanelTab('orders')}>
            Ventas / Tickets
          </button>
        </div>
        <button className="btn-logout" onClick={handleLogout}>
          <LogOut size={18} />
        </button>
      </header>

      <main className="panel-main">
        {panelTab === 'orders' ? (
          <div className="panel-card">
            <h2><ShoppingCart size={22} /> Tickets Vendidos</h2>
            {eventOrders.length === 0 ? (
              <p className="no-orders text-disabled">Aún no hay ventas para este evento.</p>
            ) : (
              <div className="orders-list">
                {eventOrders.map(o => (
                  <div key={o.id} className={`order-card ${expandedOrder === o.id ? 'expanded' : ''}`} onClick={() => setExpandedOrder(expandedOrder === o.id ? null : o.id)}>
                    <div className="order-header">
                      <span className="order-date">{new Date(o.created_at).toLocaleDateString('es-AR')}</span>
                      <span className="order-ticket badge-cyan">{o.ticket_code}</span>
                      <span className="order-name">{o.client_name || o.client_phone}</span>
                      <span className={`order-status ${o.status}`}>{o.status === 'delivered' ? 'Entregado' : 'Abonos/Pendiente'}</span>
                    </div>
                    {expandedOrder === o.id && (
                      <div className="order-details-pane">
                        <div className="order-meta-info">
                          <p><strong>📱 Teléfono:</strong> {o.client_phone}</p>
                          <p><strong>💰 Total:</strong> ${o.total_price}</p>
                        </div>
                        <div className="order-photos-container">
                          <strong>📸 Fotos seleccionadas:</strong>
                          <div className="photo-badges">
                            {o.order_photos?.map(p => (
                              <span key={p.id} className="mini-photo-badge">{p.photo_name}</span>
                            ))}
                          </div>
                        </div>
                        <div className="order-actions">
                          <button className="btn-resend" onClick={(e) => resendOrder(o, e)} disabled={resendingOrder === o.id}>
                            {resendingOrder === o.id ? <Loader2 size={16} className="spin" /> : <Send size={16} />}
                            Enviar fotos de nuevo
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="panel-card">
            <div className="upload-header-row">
              <h2><Upload size={22} /> Subir fotos</h2>
              <div className="upload-actions-row">
                <button className="btn-ghost" onClick={() => !uploading && document.getElementById('file-input').click()}>
                  <Image size={16} /> Sumar Fotos
                </button>
                <button className="btn-ghost" onClick={() => !uploading && document.getElementById('folder-input').click()}>
                  <FolderPlus size={16} /> Subir Carpeta
                </button>
              </div>
            </div>

            {/* Drop Zone */}
            <div
              className={`drop-zone ${files.length > 0 ? 'has-files' : ''}`}
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('drag-over') }}
              onDragLeave={(e) => e.currentTarget.classList.remove('drag-over')}
              onClick={() => !uploading && document.getElementById('folder-input').click()}
            >
              <input
                id="file-input"
                type="file"
                multiple
                accept="image/*"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
                disabled={uploading}
              />
              <input
                id="folder-input"
                type="file"
                webkitdirectory="true"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
                disabled={uploading}
              />
              {files.length === 0 ? (
                <>
                  <Upload size={32} className="drop-icon" />
                  <p className="drop-text">Arrastrá fotos acá o hacé click</p>
                  <p className="drop-hint">JPG, PNG, WebP — Hasta 50MB por foto</p>
                </>
              ) : (
                <>
                  <Image size={24} className="drop-icon" />
                  <p className="drop-text">
                    {files.length} foto{files.length > 1 ? 's' : ''} · {formatSize(totalSize)}
                  </p>
                  <p className="drop-hint">Click para agregar más</p>
                </>
              )}
            </div>

            {/* Global Progress Dashboard */}
            {files.length > 0 && (
              <div className="global-upload-dashboard">
                {(() => {
                  const doneCount = Object.values(uploadProgress).filter(s => s === 'done').length
                  const errorCount = Object.values(uploadProgress).filter(s => s === 'error').length
                  const total = files.length
                  const isFinished = uploadComplete && total > 0 && !uploading
                  const percent = (uploading || isFinished) ? Math.round(((doneCount + errorCount) / total) * 100) : 0
                  
                  return (
                    <div className="global-progress">
                      <div className="global-progress-header">
                        <span className="status-badge">
                          {isFinished ? '✅ Carga Finalizada' : uploading ? '🚀 Subiendo al servidor...' : 'Pausado / En Espera'}
                        </span>
                        {(uploading || isFinished) && <span className="mono text-cyan">Progreso: {percent}%</span>}
                      </div>
                      
                      <div className="global-bar-bg">
                        <div className={`global-bar-fill ${isFinished ? 'finished' : ''}`} style={{ width: `${percent}%` }} />
                      </div>

                      <div className="global-stats mono">
                        <span>Total: {total}</span>
                        <span className="status-success">Subidas: {doneCount}</span>
                        {errorCount > 0 && <span className="status-error">Errores: {errorCount}</span>}
                      </div>

                      {!uploading && !uploadComplete && (
                        <button className="btn-primary start-upload-btn" onClick={handleUpload}>
                          Comenzar Carga Mágica ({total} archivos)
                        </button>
                      )}
                    </div>
                  )
                })()}
              </div>
            )}

            {/* Files to upload */}
            {files.length > 0 && (
              <div className="file-list">
                {files.map((file, index) => {
                  const status = uploadProgress[index]
                  return (
                    <div key={index} className={`file-item ${status || ''}`}>
                      <div className="file-thumb">
                        <img src={URL.createObjectURL(file)} alt={file.name} />
                      </div>
                      <div className="file-info">
                        <span className="file-name">{file.name}</span>
                        <span className="file-size">{formatSize(file.size)}</span>
                        {status === 'uploading' && (
                          <div className="cyber-progress-bar">
                            <div className="cyber-progress-fill" />
                          </div>
                        )}
                      </div>
                      <div className="file-status">
                        {status === 'uploading' && <Loader2 size={16} className="spin" />}
                        {status === 'done' && <Check size={16} className="status-success" />}
                        {status === 'error' && <AlertCircle size={16} className="status-error" />}
                        {!status && !uploading && (
                          <button className="file-remove" onClick={(e) => { e.stopPropagation(); removeFile(index) }}>
                            <X size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Upload Complete */}
            {uploadComplete && (
              <div className="upload-summary success">
                <Check size={18} />
                <span>¡Fotos subidas correctamente! ✨</span>
              </div>
            )}

            {/* Upload Button */}
            {files.length > 0 && (
              <button
                className="btn-upload"
                onClick={handleUpload}
                disabled={uploading || files.length === 0}
              >
                {uploading ? (
                  <><Loader2 size={18} className="spin" /> Subiendo...</>
                ) : (
                  <><Upload size={18} /> Subir {files.length} foto{files.length > 1 ? 's' : ''}</>
                )}
              </button>
            )}

            {/* Existing Photos Grid */}
            {eventPhotos.length > 0 && (
              <>
                <div className="section-divider">
                  <span>Fotos subidas ({eventPhotos.length})</span>
                </div>
                <div className="photos-grid">
                  {eventPhotos.map((photo) => {
                    const publicUrl = `${supabaseUrl}/storage/v1/object/public/photos/events/${selectedEvent.slug}/${photo.name}`
                    return (
                      <div key={photo.name} className="photo-card">
                        <img src={publicUrl} alt={photo.name} loading="lazy" />
                        <div className="photo-overlay">
                          <span className="photo-name-label">{photo.name}</span>
                          <button
                            className="photo-delete"
                            onClick={() => deletePhoto(photo)}
                            aria-label="Eliminar foto"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  )
}

export default PhotographerPanel
