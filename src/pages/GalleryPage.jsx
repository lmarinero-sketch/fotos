import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Download, CheckCircle, Clock, XCircle,
  ZoomIn, X, ChevronLeft, ChevronRight, Loader2
} from 'lucide-react'
import { MOCK_ORDERS } from '../data/mockData'
import { createClient } from '@supabase/supabase-js'
import './GalleryPage.css'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

const STATUS_CONFIG = {
  approved: { label: 'Aprobado', icon: CheckCircle, className: 'status-approved' },
  pending: { label: 'Pendiente', icon: Clock, className: 'status-pending' },
  rejected: { label: 'Rechazado', icon: XCircle, className: 'status-rejected' },
}

const GalleryPage = () => {
  const { ticketCode } = useParams()
  const navigate = useNavigate()
  const [order, setOrder] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedPhotos, setSelectedPhotos] = useState(new Set())
  const [lightboxIndex, setLightboxIndex] = useState(null)
  const [downloading, setDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState(0)

  useEffect(() => {
    const fetchOrder = async () => {
      setLoading(true)
      
      const { data: orderData, error: fetchError } = await supabase
        .from('orders')
        .select(`
          id,
          ticket_code,
          event_name,
          status,
          order_photos (
            id,
            photo_name,
            storage_url
          )
        `)
        .eq('ticket_code', ticketCode?.toUpperCase())
        .single()

      if (fetchError || !orderData) {
        setError('No encontramos este Ticket o el pago aún no fue procesado. Verificá tu comprobante.')
      } else {
        const orderPhotos = (orderData.order_photos || [])
          .filter(p => p.storage_url) // only map ones that are ready in storage
          .map(p => ({
            id: p.id,
            name: p.photo_name,
            thumbnail: p.storage_url,
            url: p.storage_url
          }))
        
        setOrder({
          id: orderData.ticket_code,
          eventName: orderData.event_name,
          status: (orderData.status === 'awaiting_payment' || orderData.status === 'pending') ? 'pending' : 'approved',
          photos: orderPhotos
        })
      }
      setLoading(false)
    }

    fetchOrder()
  }, [ticketCode])

  const togglePhotoSelection = (photoId) => {
    setSelectedPhotos(prev => {
      const next = new Set(prev)
      if (next.has(photoId)) {
        next.delete(photoId)
      } else {
        next.add(photoId)
      }
      return next
    })
  }

  const selectAll = () => {
    if (!order) return
    if (selectedPhotos.size === order.photos.length) {
      setSelectedPhotos(new Set())
    } else {
      setSelectedPhotos(new Set(order.photos.map(p => p.id)))
    }
  }

  const handleDownload = async () => {
    setDownloading(true)
    setDownloadProgress(0)

    try {
      const photosToDownload = selectedPhotos.size > 0 
        ? order.photos.filter(p => selectedPhotos.has(p.id))
        : order.photos

      const totalSteps = photosToDownload.length
      let done = 0

      for (const photo of photosToDownload) {
        try {
          // Fetch image as blob
          const response = await fetch(photo.url)
          if (!response.ok) throw new Error('File fetch failed')
          
          const blob = await response.blob()
          const url = window.URL.createObjectURL(blob)
          
          // Trigger download
          const a = document.createElement('a')
          a.style.display = 'none'
          a.href = url
          a.download = photo.name || 'foto.jpg'
          document.body.appendChild(a)
          a.click()
          
          window.URL.revokeObjectURL(url)
          a.remove()
        } catch (e) {
          console.error('Error downloading photo:', photo.name, e)
        }
        
        done++
        setDownloadProgress((done / totalSteps) * 100)
        // Small delay so browser handles downloads properly
        await new Promise(r => setTimeout(r, 600))
      }
    } catch (err) {
      console.error(err)
      alert("Hubo un error en las descargas")
    } finally {
      setDownloading(false)
      setDownloadProgress(0)
    }
  }

  const openLightbox = useCallback((index) => {
    setLightboxIndex(index)
    document.body.style.overflow = 'hidden'
  }, [])

  const closeLightbox = useCallback(() => {
    setLightboxIndex(null)
    document.body.style.overflow = ''
  }, [])

  const navigateLightbox = useCallback((direction) => {
    if (!order) return
    setLightboxIndex(prev => {
      const next = prev + direction
      if (next < 0) return order.photos.length - 1
      if (next >= order.photos.length) return 0
      return next
    })
  }, [order])

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (lightboxIndex === null) return
      if (e.key === 'Escape') closeLightbox()
      if (e.key === 'ArrowLeft') navigateLightbox(-1)
      if (e.key === 'ArrowRight') navigateLightbox(1)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [lightboxIndex, closeLightbox, navigateLightbox])

  // Loading State
  if (loading) {
    return (
      <div className="gallery-loading">
        <div className="loading-spinner">
          <Loader2 size={40} className="spinner-icon" />
        </div>
        <p className="loading-text">Cargando tu galería...</p>
        <p className="loading-code mono">{ticketCode}</p>
      </div>
    )
  }

  // Error State
  if (error) {
    return (
      <div className="gallery-error">
        <div className="error-icon-wrapper">
          <XCircle size={48} />
        </div>
        <h2>Código No Encontrado o Inválido</h2>
        <p>{error}</p>
        <button className="btn-back" onClick={() => navigate('/')}>
          <ArrowLeft size={18} />
          <span>Volver al inicio</span>
        </button>
      </div>
    )
  }

  // Pending State
  if (order && order.status === 'pending') {
    return (
      <div className="gallery-pending">
        <div className="pending-icon-wrapper">
          <Clock size={48} />
        </div>
        <h2>Tu galería está en camino</h2>
        <p>
          El fotógrafo aún no aprobó este pedido. 
          Te notificaremos por WhatsApp cuando esté listo.
        </p>
        <div className="pending-ticket mono">{ticketCode}</div>
        <button className="btn-back" onClick={() => navigate('/')}>
          <ArrowLeft size={18} />
          <span>Volver al inicio</span>
        </button>
      </div>
    )
  }

  const statusConfig = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending
  const StatusIcon = statusConfig.icon
  const photosToDownload = selectedPhotos.size > 0 ? selectedPhotos.size : order.photos.length

  return (
    <div className="gallery">
      {/* Background Auras */}
      <div className="bg-aura bg-aura-gallery-1" />
      <div className="bg-aura bg-aura-gallery-2" />

      {/* Header */}
      <header className="gallery-header">
        <div className="container gallery-header-content">
          <button className="btn-back-minimal" onClick={() => navigate('/')} aria-label="Volver">
            <ArrowLeft size={18} />
          </button>

          <div className="header-info">
            <h1 className="gallery-event-name">{order.eventName}</h1>
            <div className="header-meta">
              <span className="gallery-ticket mono">{ticketCode}</span>
              <span className={`status-badge ${statusConfig.className}`}>
                <StatusIcon size={14} />
                {statusConfig.label}
              </span>
              <span className="photo-count">{order.photos.length} fotos</span>
            </div>
          </div>
        </div>
      </header>

      {/* Gallery Actions */}
      <div className="gallery-actions">
        <div className="container gallery-actions-content">
          <button
            className="btn-select-all"
            onClick={selectAll}
          >
            {selectedPhotos.size === order.photos.length ? 'Deseleccionar todo' : 'Seleccionar todo'}
          </button>

          {selectedPhotos.size > 0 && (
            <span className="selection-count">
              {selectedPhotos.size} seleccionadas
            </span>
          )}
        </div>
      </div>

      {/* Photo Grid */}
      <main className="gallery-grid-wrapper">
        <div className="container">
          <div className="photo-grid stagger">
            {order.photos.map((photo, index) => (
              <div
                key={photo.id}
                className={`photo-card animate-fade-in-up ${selectedPhotos.has(photo.id) ? 'selected' : ''}`}
                style={{ animationDelay: `${index * 80}ms` }}
              >
                <div className="photo-image-wrapper" onClick={() => openLightbox(index)}>
                  <img
                    src={photo.thumbnail}
                    alt={photo.name}
                    className="photo-image"
                    loading="lazy"
                  />
                  <div className="photo-overlay">
                    <ZoomIn size={24} />
                  </div>
                </div>

                <div className="photo-info">
                  <span className="photo-name">{photo.name}</span>
                  <button
                    className={`photo-select-btn ${selectedPhotos.has(photo.id) ? 'active' : ''}`}
                    onClick={() => togglePhotoSelection(photo.id)}
                    aria-label={`Seleccionar ${photo.name}`}
                  >
                    <CheckCircle size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Floating Download Bar */}
      <div className={`download-bar ${downloading ? 'downloading' : ''}`}>
        <div className="container download-bar-content">
          {downloading ? (
            <div className="download-progress-wrapper">
              <div className="download-progress-bar">
                <div
                  className="download-progress-fill"
                  style={{ width: `${downloadProgress}%` }}
                />
              </div>
              <span className="download-progress-text">
                Descargando... {Math.round(downloadProgress)}%
              </span>
            </div>
          ) : (
            <>
              <div className="download-info">
                <Download size={18} />
                <span>
                  {selectedPhotos.size > 0
                    ? `${selectedPhotos.size} foto${selectedPhotos.size > 1 ? 's' : ''} seleccionada${selectedPhotos.size > 1 ? 's' : ''}`
                    : `Todas las fotos (${order.photos.length})`
                  }
                </span>
              </div>
              <button
                className="btn-download"
                onClick={handleDownload}
              >
                {downloading ? (
                  <Loader2 size={18} className="spin" />
                ) : (
                  <Download size={18} />
                )}
                <span>Descargar{selectedPhotos.size > 0 ? ` (${selectedPhotos.size})` : ' todo'}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Lightbox */}
      {lightboxIndex !== null && order.photos[lightboxIndex] && (
        <div className="lightbox" onClick={closeLightbox}>
          <div className="lightbox-content" onClick={e => e.stopPropagation()}>
            <button className="lightbox-close" onClick={closeLightbox} aria-label="Cerrar">
              <X size={24} />
            </button>

            <button
              className="lightbox-nav lightbox-prev"
              onClick={() => navigateLightbox(-1)}
              aria-label="Foto anterior"
            >
              <ChevronLeft size={32} />
            </button>

            <img
              src={order.photos[lightboxIndex].thumbnail}
              alt={order.photos[lightboxIndex].name}
              className="lightbox-image"
            />

            <button
              className="lightbox-nav lightbox-next"
              onClick={() => navigateLightbox(1)}
              aria-label="Foto siguiente"
            >
              <ChevronRight size={32} />
            </button>

            <div className="lightbox-footer">
              <span className="lightbox-name">{order.photos[lightboxIndex].name}</span>
              <span className="lightbox-counter mono">
                {lightboxIndex + 1} / {order.photos.length}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default GalleryPage
