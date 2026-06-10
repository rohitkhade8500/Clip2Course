import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

type Theme = 'light' | 'dark' | 'system'

interface ThemeContextType {
  theme: Theme
  resolved: 'light' | 'dark'
  setTheme: (t: Theme) => void
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'dark',
  resolved: 'dark',
  setTheme: () => {},
})

export const useTheme = () => useContext(ThemeContext)

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'dark'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const saved = localStorage.getItem('clip2course-theme') as Theme | null
    return saved || 'dark'
  })

  const [resolved, setResolved] = useState<'light' | 'dark'>(() =>
    theme === 'system' ? getSystemTheme() : theme
  )

  const setTheme = (t: Theme) => {
    setThemeState(t)
    localStorage.setItem('clip2course-theme', t)
  }

  useEffect(() => {
    const newResolved = theme === 'system' ? getSystemTheme() : theme
    setResolved(newResolved)

    const root = document.documentElement
    root.classList.remove('light', 'dark')
    root.classList.add(newResolved)

    // Listen for system preference changes when in system mode
    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      const handler = (e: MediaQueryListEvent) => {
        const sys = e.matches ? 'dark' : 'light'
        setResolved(sys)
        root.classList.remove('light', 'dark')
        root.classList.add(sys)
      }
      mq.addEventListener('change', handler)
      return () => mq.removeEventListener('change', handler)
    }
  }, [theme])

  return (
    <ThemeContext.Provider value={{ theme, resolved, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}
