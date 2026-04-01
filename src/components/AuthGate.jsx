import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Mail, Lock, Eye, EyeOff, Loader2, LogOut, User } from 'lucide-react'
import './AuthGate.css'

const AuthGate = ({ children, requireAuth = true }) => {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState('login') // 'login' | 'register'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')

  useEffect(() => {
    // Check existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  // Inject BuilderBot widget when authenticated
  useEffect(() => {
    if (session && !document.getElementById('builderbot-sdk')) {
      const script = document.createElement('script')
      script.id = 'builderbot-sdk'
      script.src = 'https://cdn.builderbot.cloud/sdk.umd.js'
      script.setAttribute('data-builderbot-chat', '')
      script.setAttribute('data-id', 'f5f7490e-9308-494f-ba24-82846175f37c')
      script.setAttribute('data-company', 'Jerpro Fotos')
      script.setAttribute('data-avatar-initials', 'JP')
      script.setAttribute('data-theme-config', JSON.stringify({
        colors: {
          primary: "#00E5FF",
          accent: "#00E5FF",
          sendButton: "#00E5FF",
          sendButtonHover: "#00B8CC",
          text: "#F2F2F2",
          textSecondary: "#A6ADB8",
          background: "#0A0E0F",
          backgroundChat: "#0F1517",
          userMessageBg: "rgba(0,229,255,0.1)",
          userMessageText: "#80F2FF",
          agentMessageBg: "#151C1F",
          agentMessageText: "#F2F2F2",
          border: "#1C2528",
          hover: "rgba(0,229,255,0.08)",
          timestamp: "#607D8B",
          icon: "#607D8B",
          inputBackground: "#0A0E0F",
          inputPlaceholder: "#607D8B"
        },
        spacing: { borderRadius: "16px", messageBorderRadius: "12px" }
      }))

      // Auto-open on mobile after widget loads
      script.onload = () => {
        const isMobile = window.innerWidth <= 768
        if (isMobile) {
          // Wait for widget to render, then auto-click the chat button
          setTimeout(() => {
            const chatBtn = document.querySelector('.chat-button, .chat-widget-button')
            if (chatBtn) chatBtn.click()
          }, 1500)
        }

        // Email mapping: store user email linked to this session
        // Save to Supabase so process-order can identify the user
        const userEmail = session.user.email
        const mappingKey = `bb_email_mapped_${userEmail}`
        if (!localStorage.getItem(mappingKey)) {
          // Store the mapping in Supabase for process-order to find
          supabase.from('web_user_sessions').upsert({
            user_email: userEmail,
            user_id: session.user.id,
            last_active: new Date().toISOString(),
          }, { onConflict: 'user_email' }).then(() => {
            localStorage.setItem(mappingKey, 'true')
          })
        } else {
          // Update last_active
          supabase.from('web_user_sessions').update({
            last_active: new Date().toISOString(),
          }).eq('user_email', userEmail)
        }
      }

      document.body.appendChild(script)
    }

    // Cleanup when logging out
    return () => {
      if (!session) {
        const existingScript = document.getElementById('builderbot-sdk')
        if (existingScript) existingScript.remove()
        // Remove the widget container too
        const widgetElements = document.querySelectorAll('.chat-widget-container, .chat-button, .chat-widget-button')
        widgetElements.forEach(el => el.remove())
      }
    }
  }, [session])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccessMsg('')
    setSubmitting(true)

    try {
      if (mode === 'register') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            // Skip email confirmation for speed (parche)
            emailRedirectTo: window.location.origin
          }
        })
        if (error) throw error
        setSuccessMsg('¡Cuenta creada! Ya podés usar el chat.')
        // Auto-login after registration
        const { error: loginErr } = await supabase.auth.signInWithPassword({ email, password })
        if (loginErr) {
          // If auto-login fails, it might need email confirmation
          setSuccessMsg('Cuenta creada. Revisá tu email para confirmar, o intentá iniciar sesión.')
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      }
    } catch (err) {
      if (err.message.includes('Invalid login')) {
        setError('Email o contraseña incorrectos')
      } else if (err.message.includes('already registered')) {
        setError('Este email ya está registrado. Iniciá sesión.')
        setMode('login')
      } else if (err.message.includes('Password should be at least')) {
        setError('La contraseña debe tener al menos 6 caracteres')
      } else {
        setError(err.message)
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setSession(null)
  }

  if (loading) {
    return (
      <div className="auth-loading">
        <Loader2 size={32} className="auth-spinner" />
      </div>
    )
  }

  // If auth not required for this page, render children
  if (!requireAuth) return children

  // Not authenticated → show login/register
  if (!session) {
    return (
      <div className="auth-overlay">
        <div className="auth-bg-aura auth-bg-aura-1" />
        <div className="auth-bg-aura auth-bg-aura-2" />

        <div className="auth-card">
          <div className="auth-logo">
            <span className="auth-logo-icon">📸</span>
            <h1>JerPro Fotos</h1>
            <p className="auth-subtitle">
              {mode === 'login' 
                ? 'Iniciá sesión para acceder al chat y tus fotos' 
                : 'Creá tu cuenta para empezar a chatear'}
            </p>
          </div>

          <div className="auth-tabs">
            <button 
              className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
              onClick={() => { setMode('login'); setError(''); setSuccessMsg('') }}
            >
              Iniciar Sesión
            </button>
            <button 
              className={`auth-tab ${mode === 'register' ? 'active' : ''}`}
              onClick={() => { setMode('register'); setError(''); setSuccessMsg('') }}
            >
              Registrarse
            </button>
          </div>

          <form onSubmit={handleSubmit} className="auth-form">
            <div className="auth-field">
              <Mail size={18} className="auth-field-icon" />
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="auth-input"
              />
            </div>

            <div className="auth-field">
              <Lock size={18} className="auth-field-icon" />
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Contraseña"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                className="auth-input"
              />
              <button 
                type="button" 
                className="auth-toggle-pw"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            {error && <div className="auth-error">{error}</div>}
            {successMsg && <div className="auth-success">{successMsg}</div>}

            <button type="submit" className="auth-submit" disabled={submitting}>
              {submitting ? (
                <><Loader2 size={18} className="auth-spinner" /> Cargando...</>
              ) : mode === 'login' ? (
                'Iniciar Sesión'
              ) : (
                'Crear Cuenta'
              )}
            </button>
          </form>

          <p className="auth-footer">
            Automatizado por <a href="https://www.growlabs.lat" target="_blank" rel="noopener">Grow Labs</a>
          </p>
        </div>
      </div>
    )
  }

  // Authenticated — render children with user context
  return (
    <>
      {/* User bar */}
      <div className="auth-user-bar">
        <div className="auth-user-info">
          <User size={14} />
          <span>{session.user.email}</span>
        </div>
        <button className="auth-logout-btn" onClick={handleLogout}>
          <LogOut size={14} />
          <span>Salir</span>
        </button>
      </div>
      {children}
    </>
  )
}

export default AuthGate
