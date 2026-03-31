import { Routes, Route, useParams, Navigate } from 'react-router-dom'
import AuthGate from './components/AuthGate'
import LandingPage from './pages/LandingPage'
import GalleryPage from './pages/GalleryPage'
import PhotographerPanel from './pages/PhotographerPanel'
import SearchPage from './pages/SearchPage'
import './App.css'

// Wrapper that checks if the ticketCode looks like a real ticket (PD-XXXX)
// If not, redirect to home
const GalleryOrRedirect = () => {
  const { ticketCode } = useParams()
  if (ticketCode && /^PD-\d{4}$/i.test(ticketCode)) {
    return <GalleryPage />
  }
  return <Navigate to="/" replace />
}

const App = () => {
  return (
    <div className="app">
      <Routes>
        {/* Ruta PÚBLICA — galerías de descarga (no requieren auth) */}
        <Route path="/:ticketCode" element={<GalleryOrRedirect />} />

        {/* Rutas PROTEGIDAS — requieren login */}
        <Route path="/" element={
          <AuthGate requireAuth={true}>
            <LandingPage />
          </AuthGate>
        } />
        <Route path="/search" element={
          <AuthGate requireAuth={true}>
            <SearchPage />
          </AuthGate>
        } />
        <Route path="/upload" element={
          <AuthGate requireAuth={true}>
            <PhotographerPanel />
          </AuthGate>
        } />
      </Routes>
    </div>
  )
}

export default App
