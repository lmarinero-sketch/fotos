import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Image, Download, ShieldCheck, ChevronRight } from 'lucide-react'
import './LandingPage.css'

const LandingPage = () => {
  const [ticketCode, setTicketCode] = useState('')
  const [isFocused, setIsFocused] = useState(false)
  const [isScanning, setIsScanning] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef(null)
  const navigate = useNavigate()

  const isReady = ticketCode.replace('-', '').length >= 6

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
      setError('EL CÓDIGO DEBE TENER AL MENOS 6 CARACTERES')
      return
    }

    setIsScanning(true)
    setTimeout(() => {
      navigate(`/${ticketCode}`)
    }, 1200)
  }

  const steps = [
    {
      icon: <Search size={28} />,
      title: 'Validación Segura',
      description: 'Ingresa tu Token único recbido vía WhatsApp para autenticar tu acceso.'
    },
    {
      icon: <Image size={28} />,
      title: 'Renderizado Alta Calidad',
      description: 'Explora tus fotografías capturadas con nuestro motor visual ultra rápido.'
    },
    {
      icon: <Download size={28} />,
      title: 'Extracción Total',
      description: 'Descarga todas las fotos en su máxima resolución directamente a tu dispositivo.'
    }
  ]

  return (
    <div className="landing">
      {/* Scanner Effect */}
      <div className={`cyber-scanner ${isScanning ? 'active' : ''}`} />

      {/* Deep Background Auras */}
      <div className="bg-aura bg-aura-cyan" />
      <div className="bg-aura bg-aura-blue" />

      {/* Floating Space Nav */}
      <nav className="floating-nav">
        <div className="nav-brand">
          <img src="/logo_creadores_jerpro.png" alt="JERPRO" className="nav-logo-img" />
          <span className="nav-logo">JERPRO</span>
        </div>
      </nav>

      <section className="hero">
        <div className="container hero-content">
          <div className="hero-badge animate-fade-in-up">
            <ShieldCheck size={14} />
            <span>ACCESO SEGURO DE FOTOGRAFÍA</span>
          </div>

          <h1 className="hero-title animate-fade-in-up" style={{ animationDelay: '100ms' }}>
            RECUPERA TU <br />
            <span className="hero-title-accent">EVENTO DIGITAL</span>
          </h1>

          <p className="hero-subtitle animate-fade-in-up" style={{ animationDelay: '200ms' }}>
            Inicializa el terminal con tu código único de 6 dígitos.
          </p>

          <form
            className={`terminal-form animate-fade-in-up ${isFocused ? 'focused' : ''} ${isReady ? 'ready' : ''}`}
            style={{ animationDelay: '300ms' }}
            onSubmit={handleSubmit}
          >
            <div className="terminal-screen">
              <div className="terminal-prefix">ROOT@JERPRO:~#</div>
              <input
                ref={inputRef}
                type="text"
                className="terminal-input"
                placeholder="PD-XXXXXX"
                value={ticketCode}
                onChange={handleChange}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                maxLength={9}
                autoComplete="off"
                spellCheck="false"
                id="ticket-code-input"
              />
              <button
                type="submit"
                className={`terminal-submit ${isReady ? 'pulse-ready' : ''}`}
                disabled={!isReady || isScanning}
              >
                <ChevronRight size={24} />
              </button>
            </div>
            {error && <div className="terminal-error">&gt;_ ERROR: {error}</div>}
          </form>

        </div>
      </section>

      <section className="system-features">
        <div className="container">
          <div className="steps-grid stagger">
            {steps.map((step, index) => (
              <div key={index} className="feature-card animate-fade-in-up">
                <div className="feature-header">
                  <div className="feature-icon">{step.icon}</div>
                  <div className="feature-number">0{index + 1}</div>
                </div>
                <h3 className="feature-title">{step.title}</h3>
                <p className="feature-description">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="footer animate-fade-in">
        <div className="container footer-content">
          <img src="/logo_creadores_jerpro.png" alt="JERPRO" className="footer-logo-img" />
          <p className="footer-copy">© 2026 JERPRO SYSTEM. ENCRYPTED CLOUD PORTAL.</p>
        </div>
      </footer>
    </div>
  )
}

export default LandingPage

