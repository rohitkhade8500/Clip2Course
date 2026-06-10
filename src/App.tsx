import { useState } from 'react'
import { ThemeProvider } from './context/ThemeContext'
import Navbar from './components/Navbar'
import Hero from './components/Hero'
import AboutUs from './components/AboutUs'
import Mission from './components/Mission'
import Features from './components/Features'
import HowItWorks from './components/HowItWorks'
import Pricing from './components/Pricing'
import FAQ from './components/FAQ'
import Contact from './components/Contact'
import Footer from './components/Footer'
import PrivacyModal from './components/PrivacyModal'
import TermsModal from './components/TermsModal'

export default function App() {
  const [showPrivacy, setShowPrivacy] = useState(false)
  const [showTerms, setShowTerms] = useState(false)

  return (
    <ThemeProvider>
      <div className="min-h-screen bg-slate-50 dark:bg-surface text-slate-800 dark:text-slate-200 transition-colors duration-300">
        <Navbar />
        <main>
          <Hero />
          <AboutUs />
          <Mission />
          <Features />
          <HowItWorks />
          <Pricing />
          <FAQ />
          <Contact />
        </main>
        <Footer 
          onPrivacyClick={() => setShowPrivacy(true)} 
          onTermsClick={() => setShowTerms(true)}
        />
        {showPrivacy && <PrivacyModal onClose={() => setShowPrivacy(false)} />}
        {showTerms && <TermsModal onClose={() => setShowTerms(false)} />}
      </div>
    </ThemeProvider>
  )
}
