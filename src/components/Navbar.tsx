import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Menu, X, Sparkles, Sun, Moon, Monitor, User } from 'lucide-react'
import { useTheme } from '../context/ThemeContext'
import { useAuth } from '../context/AuthContext'

const navLinks = [
  { label: 'About Us', href: '#about-us' },
  { label: 'Our Mission', href: '#mission' },
  { label: 'Features', href: '#features' },
  { label: 'How It Works', href: '#how-it-works' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'FAQ', href: '#faq' },
]

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const { theme, setTheme } = useTheme()
  const { status, user, logout } = useAuth()
  const navigate = useNavigate()

  // 'checking' is not "signed out": rendering the anonymous links here would
  // flash Sign in at a user who is in fact signed in (Requirement 6.7), so the
  // auth slot stays empty until the session check settles.
  const checking = status === 'checking'
  const signedIn = status === 'authenticated' && user !== null

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  async function handleLogout() {
    setSigningOut(true)
    try {
      await logout()
      setMobileOpen(false)
      // Requirement 3.3: land back on the public page once the user is cleared
      navigate('/')
    } finally {
      setSigningOut(false)
    }
  }

  const themeOptions: { value: 'light' | 'dark' | 'system'; icon: typeof Sun; label: string }[] = [
    { value: 'light', icon: Sun, label: 'Light' },
    { value: 'dark', icon: Moon, label: 'Dark' },
    { value: 'system', icon: Monitor, label: 'System' },
  ]

  return (
    <nav
      id="navbar"
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled || mobileOpen
          ? 'bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-b border-slate-200 dark:border-slate-800'
          : 'bg-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 md:h-20">
          {/* Logo */}
          <a href="#" className="flex items-center gap-2 group shrink-0" id="logo-link">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center transition-transform group-hover:scale-110">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
              Clip2Course<span className="text-primary-light">.online</span>
            </span>
          </a>

          {/* Desktop Nav */}
          <div className="hidden lg:flex items-center gap-6">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors relative after:absolute after:bottom-[-4px] after:left-0 after:w-0 after:h-[2px] after:bg-primary after:transition-all hover:after:w-full whitespace-nowrap"
              >
                {link.label}
              </a>
            ))}

            {/* Theme Toggle */}
            <div className="flex items-center bg-slate-100 dark:bg-surface-light rounded-lg p-0.5 border border-slate-200 dark:border-slate-700" id="theme-toggle">
              {themeOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setTheme(opt.value)}
                  className={`p-1.5 rounded-md transition-all cursor-pointer ${
                    theme === opt.value
                      ? 'bg-white dark:bg-surface-lighter text-primary shadow-sm'
                      : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                  }`}
                  aria-label={`${opt.label} mode`}
                  title={`${opt.label} mode`}
                >
                  <opt.icon className="w-4 h-4" />
                </button>
              ))}
            </div>

            {checking ? null : signedIn ? (
              <>
                <span
                  className="flex items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap"
                  id="nav-user"
                >
                  <User className="w-4 h-4 text-primary-light" />
                  {user.displayName}
                </span>

                <Link
                  to="/app/courses"
                  className="text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap"
                >
                  My Courses
                </Link>

                <button
                  type="button"
                  onClick={handleLogout}
                  disabled={signingOut}
                  className="text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap cursor-pointer disabled:opacity-60"
                >
                  {signingOut ? 'Logging out...' : 'Log out'}
                </button>

                <Link
                  to="/app/dashboard"
                  className="glow-btn px-5 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary-light transition-all"
                  id="nav-cta"
                >
                  Dashboard
                </Link>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  className="text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap"
                >
                  Sign in
                </Link>

                <Link
                  to="/register"
                  className="glow-btn px-5 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary-light transition-all"
                  id="nav-cta"
                >
                  Create account
                </Link>
              </>
            )}
          </div>

          {/* Mobile Controls */}
          <div className="flex items-center gap-3 lg:hidden">
            {/* Mobile Theme Toggle */}
            <div className="flex items-center bg-slate-100 dark:bg-surface-light rounded-lg p-0.5 border border-slate-200 dark:border-slate-700">
              {themeOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setTheme(opt.value)}
                  className={`p-1.5 rounded-md transition-all cursor-pointer ${
                    theme === opt.value
                      ? 'bg-white dark:bg-surface-lighter text-primary shadow-sm'
                      : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                  }`}
                  aria-label={`${opt.label} mode`}
                >
                  <opt.icon className="w-3.5 h-3.5" />
                </button>
              ))}
            </div>

            <button
              id="mobile-menu-toggle"
              className="text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label="Toggle menu"
            >
              {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileOpen && (
          <div className="lg:hidden pb-6 border-t border-slate-200 dark:border-slate-800 mt-2 pt-4 fade-in-up">
            <div className="flex flex-col gap-3">
              {navLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className="text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors px-2 py-1.5"
                >
                  {link.label}
                </a>
              ))}
              {checking ? null : signedIn ? (
                <>
                  <span className="flex items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300 px-2 py-1.5">
                    <User className="w-4 h-4 text-primary-light" />
                    {user.displayName}
                  </span>
                  <Link
                    to="/app/courses"
                    onClick={() => setMobileOpen(false)}
                    className="text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors px-2 py-1.5"
                  >
                    My Courses
                  </Link>
                  <button
                    type="button"
                    onClick={handleLogout}
                    disabled={signingOut}
                    className="text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors px-2 py-1.5 text-left cursor-pointer disabled:opacity-60"
                  >
                    {signingOut ? 'Logging out...' : 'Log out'}
                  </button>
                  <Link
                    to="/app/dashboard"
                    onClick={() => setMobileOpen(false)}
                    className="glow-btn px-5 py-2.5 rounded-lg bg-primary text-white text-sm font-semibold text-center hover:bg-primary-light transition-all mt-2"
                  >
                    Dashboard
                  </Link>
                </>
              ) : (
                <>
                  <Link
                    to="/login"
                    onClick={() => setMobileOpen(false)}
                    className="text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors px-2 py-1.5"
                  >
                    Sign in
                  </Link>
                  <Link
                    to="/register"
                    onClick={() => setMobileOpen(false)}
                    className="glow-btn px-5 py-2.5 rounded-lg bg-primary text-white text-sm font-semibold text-center hover:bg-primary-light transition-all mt-2"
                  >
                    Create account
                  </Link>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  )
}
