import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, ZoomIn, Search, Loader2, ShoppingCart, Image as ImageIcon, X, ChevronLeft, ChevronRight } from 'lucide-react'
import { createClient } from '@supabase/supabase-js'
import './SearchPage.css'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

const SearchPage = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  
  const initialBib = searchParams.get('bib') || ''
  const [bib, setBib] = useState(initialBib)
  const [isSearching, setIsSearching] = useState(false)
  const [photos, setPhotos] = useState([])
  const [hasSearched, setHasSearched] = useState(!!initialBib)
  const [lightboxIndex, setLightboxIndex] = useState(null)

  useEffect(() => {
    if (initialBib) {
      performSearch(initialBib)
    }
  }, [initialBib])

  const performSearch = async (searchBib) => {
    if (!searchBib) return;
    setIsSearching(true)
    
    const { data, error } = await supabase
      .from('event_photos')
      .select('*, events(slug, name)')
      .eq('bib_number', searchBib)
      .order('created_at', { ascending: false })

    if (!error && data) {
      const mappedPhotos = data.map(p => ({
        id: p.id,
        name: p.file_name,
        thumbnail: supabase.storage.from('thumbnails').getPublicUrl(p.thumbnail_path).data.publicUrl,
        eventName: p.events?.name || 'Evento Deportivo'
      }))
      setPhotos(mappedPhotos)
    } else {
      setPhotos([])
    }
    
    setIsSearching(false)
    setHasSearched(true)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!bib) return
    setSearchParams({ bib })
  }

  const handleBuy = () => {
    const msg = `Hola JERPRO, quiero comprar las fotos correspondientes al corredor N° ${bib}. ¿Podrían brindarme información para el pago?`
    window.open(`https://wa.me/5491100000000?text=${encodeURIComponent(msg)}`, '_blank')
  }

  const pricePerPhoto = import.meta.env.VITE_PRICE_PER_PHOTO || 3000

  // Lightbox handlers
  const openLightbox = (index) => {
    setLightboxIndex(index)
    document.body.style.overflow = 'hidden'
  }
  const closeLightbox = () => {
    setLightboxIndex(null)
    document.body.style.overflow = ''
  }
  const navigateLightbox = (direction) => {
    setLightboxIndex(prev => {
      const next = prev + direction
      if (next < 0) return photos.length - 1
      if (next >= photos.length) return 0
      return next
    })
  }

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (lightboxIndex === null) return
      if (e.key === 'Escape') closeLightbox()
      if (e.key === 'ArrowLeft') navigateLightbox(-1)
      if (e.key === 'ArrowRight') navigateLightbox(1)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [lightboxIndex])

  return (
    <div className="search-page">
      {/* Background Auras */}
      <div className="bg-aura bg-aura-search-1" />
      <div className="bg-aura bg-aura-search-2" />

      {/* Header */}
      <header className="search-header">
        <div className="container search-header-content">
          <button className="btn-back-minimal" onClick={() => navigate('/')} aria-label="Volver">
            <ArrowLeft size={18} />
          </button>
          
          <form className="search-bar" onSubmit={handleSubmit}>
            <Search size={18} className="search-icon" />
            <input 
              type="text" 
              placeholder="N° de Corredor..."
              value={bib}
              onChange={(e) => setBib(e.target.value.replace(/[^0-9A-Za-z]/g, ''))}
              className="search-input"
            />
            <button type="submit" className="search-btn" disabled={isSearching || !bib}>
              {isSearching ? <Loader2 size={16} className="spin" /> : 'Buscar'}
            </button>
          </form>
        </div>
      </header>

      {/* Results */}
      <main className="search-main container">
        {isSearching ? (
          <div className="search-loading">
            <Loader2 size={40} className="spinner-icon spin" />
            <p>Buscando tus fotos...</p>
          </div>
        ) : hasSearched && photos.length === 0 ? (
          <div className="search-empty">
            <div className="empty-icon-wrapper">
              <ImageIcon size={48} />
            </div>
            <h2>No encontramos fotos</h2>
            <p>Asegúrate de haber ingresado bien tu número de dorsal ({searchParams.get('bib')}).</p>
          </div>
        ) : hasSearched && photos.length > 0 ? (
          <div className="results-container">
            <div className="results-header">
              <div className="results-title-group">
                <h1 className="results-title">Tus Fotos Oficiales</h1>
                <span className="results-badge">Dorsal {searchParams.get('bib')}</span>
              </div>
              <p className="results-subtitle">Encontramos {photos.length} foto{photos.length > 1 ? 's' : ''} donde apareces. Compra el pack completo en alta resolución y sin marcas de agua.</p>
            </div>

            <div className="photo-grid stagger">
              {photos.map((photo, index) => (
                <div 
                  key={photo.id}
                  className="photo-card animate-fade-in-up"
                  style={{ animationDelay: `${index * 50}ms` }}
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
                  <div className="photo-info-compact">
                    <span className="photo-event">{photo.eventName}</span>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="purchase-banner animate-fade-in-up" style={{ animationDelay: '300ms' }}>
              <div className="purchase-info">
                <h3>Pack Completo HD</h3>
                <p>Las {photos.length} fotos en máxima resolución y sin marcas de agua.</p>
              </div>
              <button className="btn-buy" onClick={handleBuy}>
                <ShoppingCart size={18} />
                Comprar por ${pricePerPhoto * photos.length}
              </button>
            </div>
          </div>
        ) : (
          <div className="search-initial">
            <ScannerIcon />
            <h2>Busca tu Dorsal</h2>
            <p>Ingresa tu número de participante arriba para ver todas tus fotos.</p>
          </div>
        )}
      </main>

      {/* Lightbox */}
      {lightboxIndex !== null && photos[lightboxIndex] && (
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
              src={photos[lightboxIndex].thumbnail}
              alt={photos[lightboxIndex].name}
              className="lightbox-image"
            />

            <button
              className="lightbox-nav lightbox-next"
              onClick={() => navigateLightbox(1)}
              aria-label="Foto siguiente"
            >
              <ChevronRight size={32} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

const ScannerIcon = () => (
  <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="initial-icon">
    <path d="M12 4H8C6.93913 4 5.92172 4.42143 5.17157 5.17157C4.42143 5.92172 4 6.93913 4 8V12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M4 36V40C4 41.0609 4.42143 42.0783 5.17157 42.8284C5.92172 43.5786 6.93913 44 8 44H12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M36 44H40C41.0609 44 42.0783 43.5786 42.8284 42.8284C43.5786 42.0783 44 41.0609 44 40V36" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M44 12V8C44 6.93913 43.5786 5.92172 42.8284 5.17157C42.0783 44.42143 41.0609 4 40 4H36" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M4 24H44" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="scanning-line"/>
  </svg>
)

export default SearchPage
