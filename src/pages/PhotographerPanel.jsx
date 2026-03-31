import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import {
  Upload, FolderPlus, Image, Check, AlertCircle,
  Loader2, X, LogOut, Plus, ChevronRight, Camera, Trash2, ArrowLeft,
  ShoppingCart, Send, BarChart3, AlertTriangle, TrendingUp, Bug, Menu, MessageCircle
} from 'lucide-react'
import CRMChat from './CRMPage'
import './PhotographerPanel.css'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const geminiApiKey = import.meta.env.VITE_GEMINI_API_KEY
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

// ── Helpers para Gemini y Watermark ──

const fileToBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = () => resolve(reader.result.split(',')[1]);
  reader.onerror = error => reject(error);
});

const detectBibNumber = async (file, apiKey) => {
  if (!apiKey) return null;
  try {
    const base64Image = await fileToBase64(file);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const payload = {
      contents: [{
        parts: [
          { text: "Actúa como un OCR experto. Lee el DORSAL o PLACA del participante. IMPORTANTE: En la placa suele haber un número enorme (ej: categoría) y números más pequeños al lado o abajo. DEBES JUNTARLOS TODOS de izquierda a derecha o de arriba abajo. Por ejemplo, si ves un '4' muy grande y al lado '18' más chico, tu respuesta exacta debe ser '418'. Si ves '1089', responde '1089'. Responde ÚNICAMENTE con la cifra numérica completa final unida y nada más. Si no hay placa, responde NONE." },
          { inlineData: { mimeType: file.type, data: base64Image } }
        ]
      }],
      safetySettings: [
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
      ],
      generationConfig: { temperature: 0.1, maxOutputTokens: 40 }
    };

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    console.log("🔍 Data Interna Gemini:", JSON.stringify(data).substring(0, 300));
    
    if (!response.ok) {
      console.error("API Gemini Error:", data);
      return null;
    }

    const textResult = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
    console.log("🤖 Gemini vió exactamente esto:", textResult);

    
    const cleaned = textResult.replace(/['"]/g, '').trim();
    if (cleaned.toUpperCase().includes('NONE') || !cleaned) {
      return null;
    }
    
    // Si Gemini responde "1,089" o "1.089", extraemos todos los números juntos: "1089"
    const digitsOnly = cleaned.match(/\d+/g);
    if (digitsOnly) {
      return digitsOnly.join('');
    }
    return cleaned;
  } catch (error) {
    console.error("Gemini Vision Error:", error);
    return null;
  }
};

const generateWatermark = (file) => new Promise((resolve, reject) => {
  const img = new window.Image();
  const url = URL.createObjectURL(file);
  
  img.onload = () => {
    URL.revokeObjectURL(url);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    // Target thumbnail width
    const MAX_WIDTH = 1200;
    let width = img.width;
    let height = img.height;
    
    if (width > MAX_WIDTH) {
      height = Math.round((height * MAX_WIDTH) / width);
      width = MAX_WIDTH;
    }
    
    canvas.width = width;
    canvas.height = height;
    
    ctx.drawImage(img, 0, 0, width, height);
    
    // Obscure layer for premium feel (cyber aesthetic)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.fillRect(0, 0, width, height);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Diagonal repetitive pattern
    ctx.translate(width / 2, height / 2);
    ctx.rotate(-Math.PI / 6);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.font = `bold ${width / 12}px Inter, sans-serif`;
    
    const text = "JERPRO";
    for (let i = -3; i <= 3; i++) {
      for (let j = -3; j <= 3; j++) {
        ctx.fillText(text, i * (width/2), j * (height/3));
      }
    }
    
    // Center main huge watermark in teal/green color
    // Reset rotation and translate
    ctx.setTransform(1, 0, 0, 1, 0, 0); 
    ctx.translate(width/2, height/2);
    ctx.fillStyle = 'rgba(0, 255, 136, 0.6)'; // Neon green/teal matching theme
    ctx.font = `900 ${width / 5}px Inter, sans-serif`;
    
    // Stroke effect
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.strokeText("JERPRO", 0, 0);
    ctx.fillText("JERPRO", 0, 0);

    // Subtitle
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.font = `bold ${width / 25}px Inter, sans-serif`;
    ctx.fillText("VISTA PREVIA DE COMPRA", 0, (width / 5) * 0.6);

    canvas.toBlob((blob) => {
      resolve({ blob, width: img.width, height: img.height });
    }, 'image/webp', 0.85);
  };
  
  img.onerror = () => reject(new Error('Failed to load image for watermarking'));
  img.src = url;
});

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
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
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

    // Auto-sync photo count using the true count from 'fotos' table
    if (data && data.length > 0) {
      setTimeout(async () => {
        const updated = [...data]
        let changed = false
        for (let idx = 0; idx < updated.length; idx++) {
          const ev = updated[idx]
          const { count, error } = await supabase
            .from('fotos')
            .select('*', { count: 'exact', head: true })
            .eq('event_id', ev.id)
            
          if (!error && count !== null && ev.photo_count !== count) {
            await supabase.from('events').update({ photo_count: count }).eq('id', ev.id)
            updated[idx].photo_count = count
            changed = true
          }
        }
        if (changed) setEvents(updated)
      }, 500)
    }

    setEvents(data || [])
  }

  const loadDashboardData = async () => {
    // Orders / Sales data with order_photos mapped
    const { data: sales } = await supabase
      .from('orders')
      .select('*, order_photos(*)')
      .order('created_at', { ascending: false })
      
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
      .list(`events/${slug}`, { limit: 10, sortBy: { column: 'name', order: 'asc' } })

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

    // BATCH PROCESSING (Concurrency = 4) to speed up huge uploads
    const BATCH_SIZE = 4;
    for (let batchStart = 0; batchStart < files.length; batchStart += BATCH_SIZE) {
      const batch = files.slice(batchStart, batchStart + BATCH_SIZE);
      
      await Promise.all(batch.map(async (file, indexInBatch) => {
        const i = batchStart + indexInBatch;
        const safeName = sanitizeFileName(file.name)
        const filePath = `${folderPath}/${safeName}`
        const baseName = safeName.replace(/\.[^/.]+$/, "")
        const thumbName = `thumb_${baseName}.webp`
        const thumbPath = `${folderPath}/${thumbName}`

        setUploadProgress(prev => ({ ...prev, [i]: 'uploading' }))

        try {
          // 1. Detección de número de corredor usando Gemini
          let bibNumber = null;
          if (geminiApiKey) {
            try {
              bibNumber = await detectBibNumber(file, geminiApiKey);
              console.log(`📸 Procesando ${file.name} - Dorsal detectado:`, bibNumber || 'Ninguno');
            } catch (geminiError) {
              console.warn(`[Aviso] Detección de Gemini fallida para ${file.name}.`, geminiError);
            }
          }

          // 2. Se quita generación de Watermark a pedido para dar prioridad a ultra velocidad
          const width = null;
          const height = null;

          // 3. Subir Original (ahora más rápido y consumiendo mitad de ancho de banda)
          const uploadPromises = [
            supabase.storage.from('photos').upload(filePath, file, { cacheControl: '3600', upsert: true }),
          ];
          
          const [originalRes] = await Promise.all(uploadPromises);
          
          if (originalRes.error) {
            if (originalRes.error.message?.includes('row-level security') || originalRes.error.message?.includes('Duplicate')) {
              console.warn(`[Aviso] La foto original ${file.name} ya existe en Supabase y está protegida. Se saltará.`);
            } else {
              throw originalRes.error;
            }
          }



          // 5. Guardar metadata en BD public.event_photos
          const { error: dbError } = await supabase
            .from('event_photos')
            .insert({
              event_id: selectedEvent.id,
              file_name: safeName,
              original_path: filePath,
              thumbnail_path: null,
              bib_number: bibNumber,
              width,
              height,
              file_size: file.size
            });
            
          if (dbError) {
               console.log('📝 Nota: no se insertó en DB.', dbError.message);
          }

          successCount++;
          setUploadProgress(prev => ({ ...prev, [i]: 'done' }))
        } catch (error) {
          console.error(`Ouch! Falló la subida de: ${file.name}`, error)
          setUploadProgress(prev => ({ ...prev, [i]: 'error' }))
        }
      }));
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
      <div className={`panel-container ${isSidebarOpen ? 'sidebar-open' : ''}`}>
        <button className="sidebar-mobile-toggle" onClick={() => setIsSidebarOpen(true)}>
          <Menu size={24} />
        </button>

        {isSidebarOpen && <div className="sidebar-overlay" onClick={() => setIsSidebarOpen(false)}></div>}

        <aside className={`panel-sidebar ${isSidebarOpen ? 'open' : ''}`}>
          <div className="panel-brand">
            <img src="/logo_creadores_jerpro.png" alt="JERPRO" className="brand-logo" />
            <div className="brand-badge-row">
              <span className="brand-tag">Fotógrafo Central</span>
              <button className="sidebar-close" onClick={() => setIsSidebarOpen(false)}>
                <X size={20} />
              </button>
            </div>
          </div>
          <div className="event-tabs">
            <button className={`tab-btn ${dashboardTab === 'events' ? 'active' : ''}`} onClick={() => { setDashboardTab('events'); setIsSidebarOpen(false) }}>
              <Camera size={18} /> Eventos
            </button>
            <button className={`tab-btn ${dashboardTab === 'ventas' ? 'active' : ''}`} onClick={() => { setDashboardTab('ventas'); setIsSidebarOpen(false) }}>
              <ShoppingCart size={18} /> Ventas
            </button>
            <button className={`tab-btn ${dashboardTab === 'metrics' ? 'active' : ''}`} onClick={() => { setDashboardTab('metrics'); setIsSidebarOpen(false) }}>
              <BarChart3 size={18} /> Métricas
            </button>
            <button className={`tab-btn ${dashboardTab === 'errors' ? 'active' : ''}`} onClick={() => { setDashboardTab('errors'); setIsSidebarOpen(false) }}>
              <Bug size={18} /> Errores
            </button>
            <button className={`tab-btn ${dashboardTab === 'chat' ? 'active' : ''}`} onClick={() => { setDashboardTab('chat'); setIsSidebarOpen(false) }}>
              <MessageCircle size={18} /> Chat CRM
            </button>
          </div>
          <div className="sidebar-footer">
            <button className="btn-logout-sidebar" onClick={handleLogout} aria-label="Cerrar sesión">
              <LogOut size={18} /> Cerrar Sesión
            </button>
          </div>
        </aside>

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

          {/* ── VENTAS TAB ── */}
          {dashboardTab === 'ventas' && (
            <div className="panel-card w-full max-w-4xl mx-auto">
              <h2 className="flex items-center gap-3 text-2xl font-black uppercase tracking-wider mb-6 text-white">
                <ShoppingCart className="text-[#00E5FF]" /> Historial de Ventas
              </h2>
              {globalMetrics.length === 0 ? (
                <div className="empty-state">
                  <p>Aún no hay ventas registradas.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {globalMetrics.map((order) => (
                    <details key={order.id} className="group bg-[#161B22]/60 backdrop-blur-md border border-white/5 rounded-2xl overflow-hidden cursor-pointer shadow-lg hover:border-[#00E5FF]/30 transition-all duration-300">
                      <summary className="flex flex-col md:flex-row md:items-center justify-between p-5 list-none focus:outline-none">
                        <div className="flex items-center gap-4">
                           <div className={`w-10 h-10 rounded-full flex items-center justify-center ${order.status === 'delivered' || order.status === 'approved' ? 'bg-[#00E5FF]/10 text-[#00E5FF]' : 'bg-yellow-400/10 text-yellow-400'}`}>
                             <Check size={20} />
                           </div>
                           <div className="flex flex-col">
                             <span className="font-bold text-lg text-white">{order.event_name} <span className="text-gray-400 text-sm ml-2 font-mono">({order.ticket_code})</span></span>
                             <span className="text-sm text-gray-400">{new Date(order.created_at).toLocaleString('es-AR')} • Tel: {order.client_phone}</span>
                           </div>
                        </div>
                        <div className="flex items-center gap-6 mt-4 md:mt-0">
                           <div className="flex flex-col items-end">
                             <span className="text-xs uppercase tracking-widest text-gray-500 font-bold mb-1">{order.status === 'delivered' ? 'Pagado' : 'Pendiente'}</span>
                             <span className="text-xl font-black text-[#00E5FF]">${(order.total_price || 0).toLocaleString('es-AR')}</span>
                           </div>
                           <ChevronRight className="transform transition-transform group-open:rotate-90 text-gray-500" />
                        </div>
                      </summary>
                      <div className="p-5 origin-top animate-fade-in border-t border-white/5 bg-black/40">
                        <h4 className="text-xs font-bold text-gray-400 mb-3 uppercase tracking-wider flex items-center justify-between">
                          Fotos compradas ({order.order_photos?.length || 0})
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {order.order_photos && order.order_photos.map(p => (
                            <span key={p.id} className="text-xs bg-white/5 border border-white/5 px-3 py-1.5 rounded-md text-gray-300 font-mono shadow-inner hover:bg-white/10 transition-colors">
                              {p.photo_name}
                            </span>
                          ))}
                        </div>
                      </div>
                    </details>
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

          {dashboardTab === 'chat' && (
            <div style={{ width: '100%', height: 'calc(100vh - 48px)' }}>
              <CRMChat />
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
    <div className={`panel-container ${isSidebarOpen ? 'sidebar-open' : ''}`}>
      <button className="sidebar-mobile-toggle" onClick={() => setIsSidebarOpen(true)}>
        <Menu size={24} />
      </button>

      {isSidebarOpen && <div className="sidebar-overlay" onClick={() => setIsSidebarOpen(false)}></div>}

      <aside className={`panel-sidebar ${isSidebarOpen ? 'open' : ''}`}>
        <div className="panel-brand">
          <img src="/logo_creadores_jerpro.png" alt="JERPRO" className="brand-logo" />
          <div className="brand-badge-row">
            <span className="brand-tag">{selectedEvent?.photo_count || 0} FOTOS</span>
            <button className="sidebar-close" onClick={() => setIsSidebarOpen(false)}>
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="mb-6 px-1">
          <h1 className="text-2xl font-black text-white uppercase tracking-wider">{selectedEvent?.name}</h1>
        </div>

        <div className="event-tabs">
          <button className="tab-btn mb-4" onClick={() => { setView('events'); setFiles([]); setUploadProgress({}); setIsSidebarOpen(false) }}>
            <ArrowLeft size={18} /> Volver a Eventos
          </button>

          <button className={`tab-btn ${panelTab === 'upload' ? 'active' : ''}`} onClick={() => { setPanelTab('upload'); setIsSidebarOpen(false) }}>
            <Upload size={18} /> Subir Fotos
          </button>
          <button className={`tab-btn ${panelTab === 'orders' ? 'active' : ''}`} onClick={() => { setPanelTab('orders'); setIsSidebarOpen(false) }}>
            <ShoppingCart size={18} /> Ventas / Tickets
          </button>
        </div>

        <div className="sidebar-footer">
          <button className="btn-logout-sidebar" onClick={handleLogout} aria-label="Cerrar sesión">
            <LogOut size={18} /> Salir
          </button>
        </div>
      </aside>

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
                  <span>Fotos subidas ({selectedEvent?.photo_count || eventPhotos.length})</span>
                </div>
                
                <p style={{textAlign: 'center', color: '#8b949e', fontSize: '13px', marginBottom: '16px'}}>
                  Mostrando solo las primeras 10 fotos para no sobrecargar el navegador de memoria.
                </p>

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
                
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: '30px', paddingBottom: '30px' }}>
                   <a 
                     href="https://supabase.com/dashboard/project/pxvhovctyewwppwkldaq/storage/buckets/photos" 
                     target="_blank" 
                     rel="noreferrer"
                     style={{
                        backgroundColor: '#1E3A8A',
                        color: 'white',
                        padding: '12px 24px',
                        borderRadius: '8px',
                        textDecoration: 'none',
                        fontWeight: 'bold',
                        letterSpacing: '1px'
                     }}
                   >
                     VER TODAS LAS FOTOS ({selectedEvent?.photo_count || 0}) EN SUPABASE
                   </a>
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
