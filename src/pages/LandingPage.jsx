import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Camera, ArrowRight, Search, Image, Download } from 'lucide-react'
import './LandingPage.css'

const LandingPage = () => {
  const [ticketCode, setTicketCode] = useState('')
  const [isFocused, setIsFocused] = useState(false)
  const [isFlashing, setIsFlashing] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef(null)
  const navigate = useNavigate()

  const formatTicketCode = (value) => {
    const clean = value.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
    if (clean.length <= 2) return clean
    return `${clean.slice(0, 2)}-${clean.slice(2, 8)}`
  }

  const handleChange = (e) => {
    const formatted = formatTicketCode(e.target.value)
    setTicketCode(formatted)
    setError('')
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    const cleanCode = ticketCode.replace('-', '')
    if (cleanCode.length < 6) {
      setError('El código debe tener al menos 6 caracteres')
      return
    }

    setIsFlashing(true)
    setTimeout(() => {
      navigate(`/${ticketCode}`)
    }, 600)
  }

  const steps = [
    {
      icon: <Search size={28} />,
      title: 'Ingresá tu código',
      description: 'Usá el código único que recibiste por WhatsApp para acceder a tu galería.'
    },
    {
      icon: <Image size={28} />,
      title: 'Previsualizá tus fotos',
      description: 'Revisá todas las fotos de tu evento en una galería premium antes de descargar.'
    },
    {
      icon: <Download size={28} />,
      title: 'Descargá tu pack',
      description: 'Descargá todas tus fotos en alta resolución con un solo click.'
    }
  ]

  return (
    <div className="landing">
      {/* Camera Flash Effect */}
      <div className={`camera-flash ${isFlashing ? 'active' : ''}`} />

      {/* Background Auras */}
      <div className="bg-aura bg-aura-1" />
      <div className="bg-aura bg-aura-2" />
      <div className="bg-aura bg-aura-3" />

      {/* Floating Nav */}
      <nav className="floating-nav">
        <div className="nav-brand">
          <img src="/logo_creadores_jerpro.png" alt="JERPRO" className="nav-logo-img" />
          <span className="nav-logo">JERPRO</span>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="hero">
        <div className="container hero-content">
          <div className="hero-badge animate-fade-in-up">
            <Camera size={14} />
            <span>Fotografía Profesional de Eventos</span>
          </div>

          <h1 className="hero-title animate-fade-in-up" style={{ animationDelay: '100ms' }}>
            Encontrá tu foto,<br />
            <span className="hero-title-accent">reviví tu momento</span>
          </h1>

          <p className="hero-subtitle animate-fade-in-up" style={{ animationDelay: '200ms' }}>
            Ingresá el código único que recibiste y accedé a tu galería de fotos del evento.
          </p>

          {/* Ticket Input */}
          <form
            className={`ticket-form animate-fade-in-up ${isFocused ? 'focused' : ''}`}
            style={{ animationDelay: '300ms' }}
            onSubmit={handleSubmit}
          >
            <div className="ticket-input-wrapper">
              <div className="ticket-prefix">
                <Camera size={18} />
              </div>
              <input
                ref={inputRef}
                type="text"
                className="ticket-input mono"
                placeholder="PD-A7X9K2"
                value={ticketCode}
                onChange={handleChange}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                maxLength={9}
                autoComplete="off"
                spellCheck="false"
                id="ticket-code-input"
                aria-label="Código de ticket"
              />
              <button
                type="submit"
                className="ticket-submit"
                disabled={ticketCode.replace('-', '').length < 6}
                aria-label="Acceder a galería"
              >
                <ArrowRight size={20} />
              </button>
            </div>
            {error && <p className="ticket-error">{error}</p>}
          </form>

          <p className="hero-hint animate-fade-in-up" style={{ animationDelay: '400ms' }}>
            Tu código se envía por WhatsApp después de que el fotógrafo apruebe tu pedido
          </p>
        </div>

        {/* Decorative lens flare */}
        <div className="lens-flare" />
      </section>

      {/* How It Works */}
      <section className="how-it-works">
        <div className="container">
          <h2 className="section-title animate-fade-in-up">
            Así de <span className="text-accent">simple</span>
          </h2>
          <p className="section-subtitle animate-fade-in-up" style={{ animationDelay: '100ms' }}>
            En tres pasos tenés tus fotos profesionales listas para guardar
          </p>

          <div className="steps-grid stagger">
            {steps.map((step, index) => (
              <div key={index} className="step-card animate-fade-in-up">
                <div className="step-number">{String(index + 1).padStart(2, '0')}</div>
                <div className="step-icon">{step.icon}</div>
                <h3 className="step-title">{step.title}</h3>
                <p className="step-description">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Trust Section */}
      <section className="trust-section">
        <div className="container">
          <div className="trust-grid">
            <div className="trust-stat">
              <span className="trust-number">2.4K+</span>
              <span className="trust-label">Galerías entregadas</span>
            </div>
            <div className="trust-divider" />
            <div className="trust-stat">
              <span className="trust-number">50K+</span>
              <span className="trust-label">Fotos descargadas</span>
            </div>
            <div className="trust-divider" />
            <div className="trust-stat">
              <span className="trust-number">4.9★</span>
              <span className="trust-label">Satisfacción</span>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="footer">
        <div className="container footer-content">
          <div className="footer-brand">
            <img src="/logo_creadores_jerpro.png" alt="JERPRO" className="nav-logo-img" />
            <span>JERPRO</span>
          </div>
          <div className="footer-links">
            <a href="#" className="footer-link">Términos</a>
            <a href="#" className="footer-link">Privacidad</a>
            <a href="#" className="footer-link">Contacto</a>
          </div>
          <p className="footer-copy">© 2026 JERPRO. Todos los derechos reservados.</p>
        </div>
      </footer>
    </div>
  )
}

export default LandingPage
