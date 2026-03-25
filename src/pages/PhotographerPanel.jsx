import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import {
  Upload, FolderPlus, Image, Check, AlertCircle,
  Loader2, X, LogOut, Plus, ChevronRight, Camera, Trash2, ArrowLeft
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
  const [view, setView] = useState('events') // 'events' | 'upload'
  const [events, setEvents] = useState([])
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [newEventName, setNewEventName] = useState('')
  const [creatingEvent, setCreatingEvent] = useState(false)
  const [showNewEvent, setShowNewEvent] = useState(false)

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

  // Load events when authenticated
  useEffect(() => {
    if (session) loadEvents()
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
      })
      .select()
      .single()

    if (!error && data) {
      setEvents(prev => [data, ...prev])
      setNewEventName('')
      setShowNewEvent(false)
      // Auto-select and go to upload
      setSelectedEvent(data)
      setView('upload')
      loadEventPhotos(data.slug)
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
    setView('upload')
    await loadEventPhotos(event.slug)
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
        <header className="panel-header">
          <div className="panel-brand">
            <img src="/logo_creadores_jerpro.png" alt="JERPRO" className="brand-logo" />
            <span className="brand-tag">Fotógrafo</span>
          </div>
          <button className="btn-logout" onClick={handleLogout} aria-label="Cerrar sesión">
            <LogOut size={18} />
          </button>
        </header>

        <main className="panel-main">
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
        <button className="btn-logout" onClick={handleLogout}>
          <LogOut size={18} />
        </button>
      </header>

      <main className="panel-main">
        <div className="panel-card">
          <h2><Upload size={22} /> Subir fotos</h2>

          {/* Drop Zone */}
          <div
            className={`drop-zone ${files.length > 0 ? 'has-files' : ''}`}
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('drag-over') }}
            onDragLeave={(e) => e.currentTarget.classList.remove('drag-over')}
            onClick={() => !uploading && document.getElementById('file-input').click()}
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
      </main>
    </div>
  )
}

export default PhotographerPanel
