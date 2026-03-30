import { Routes, Route } from 'react-router-dom'
import LandingPage from './pages/LandingPage'
import GalleryPage from './pages/GalleryPage'
import PhotographerPanel from './pages/PhotographerPanel'
import SearchPage from './pages/SearchPage'
import './App.css'

const App = () => {
  return (
    <div className="app">
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/upload" element={<PhotographerPanel />} />
        <Route path="/:ticketCode" element={<GalleryPage />} />
      </Routes>
    </div>
  )
}

export default App
