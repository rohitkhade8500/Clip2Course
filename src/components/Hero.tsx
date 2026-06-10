import { type FormEvent, useState } from 'react'
import { ArrowRight, Play, Zap, BookOpen, Loader2 } from 'lucide-react'
import { submitToWeb3Forms } from '../utils/web3forms'

export default function Hero() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!email.trim() || status === 'loading') return

    setStatus('loading')
    setErrorMsg('')

    try {
      await submitToWeb3Forms({
        subject: '🎉 New Waitlist Signup — Clip2Course',
        from_name: 'Waitlist Subscriber',
        email,
        message: `New waitlist signup from: ${email}`,
      })
      setStatus('success')
      setEmail('')
      setTimeout(() => setStatus('idle'), 4000)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to submit. Please try again.')
      setStatus('error')
      setTimeout(() => setStatus('idle'), 5000)
    }
  }

  return (
    <section
      id="hero"
      className="relative min-h-screen flex items-center justify-center hero-grid overflow-hidden pt-20"
    >
      {/* Floating Orbs */}
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />

      <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center py-20">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary-light text-sm font-medium mb-8 fade-in-up">
          <Zap className="w-4 h-4" />
          <span>AI-Powered Course Generation</span>
        </div>

        {/* Headline */}
        <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold leading-tight tracking-tight mb-6 fade-in-up text-slate-900 dark:text-white" style={{ animationDelay: '0.1s' }}>
          Turn Any Video Into a{' '}
          <span className="gradient-text">Complete Course</span>
        </h1>

        {/* Sub-headline */}
        <p className="text-lg sm:text-xl text-slate-600 dark:text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed fade-in-up" style={{ animationDelay: '0.2s' }}>
          Drop a YouTube link or upload a raw video. Clip2Course AI automatically generates
          structured modules, quizzes, summaries, and study notes — in minutes, not hours.
        </p>

        {/* Waitlist Form */}
        <form
          onSubmit={handleSubmit}
          className="flex flex-col sm:flex-row items-center justify-center gap-3 max-w-md mx-auto mb-12 fade-in-up"
          style={{ animationDelay: '0.3s' }}
          id="waitlist-form"
        >
          <input
            type="email"
            id="waitlist-email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your email"
            required
            disabled={status === 'loading'}
            className="w-full sm:flex-1 px-5 py-3.5 rounded-xl bg-white dark:bg-surface-light border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 text-sm transition-all disabled:opacity-50"
          />
          <button
            type="submit"
            id="waitlist-submit"
            disabled={status === 'loading' || status === 'success'}
            className="glow-btn pulse-glow w-full sm:w-auto px-7 py-3.5 rounded-xl bg-primary text-white font-semibold text-sm flex items-center justify-center gap-2 hover:bg-primary-light transition-all cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {status === 'loading' ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Joining...
              </>
            ) : status === 'success' ? (
              <>
                <span>🎉</span> You're on the list!
              </>
            ) : status === 'error' ? (
              <>
                <span>⚠️</span> Try Again
              </>
            ) : (
              <>
                Join Waitlist <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Error message */}
        {status === 'error' && errorMsg && (
          <p className="text-red-400 text-sm text-center -mt-8 mb-8 fade-in-up">{errorMsg}</p>
        )}

        {/* Social proof */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-6 text-sm text-slate-500 dark:text-slate-500 fade-in-up" style={{ animationDelay: '0.4s' }}>
          <div className="flex items-center gap-2">
            <Play className="w-4 h-4 text-primary-light" />
            <span>Supports YouTube, Vimeo & raw uploads</span>
          </div>
          <div className="hidden sm:block w-px h-4 bg-slate-300 dark:bg-slate-700" />
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-accent-light" />
            <span>Auto-generates modules, quizzes & notes</span>
          </div>
        </div>

        {/* Mockup Preview */}
        <div className="mt-16 max-w-3xl mx-auto fade-in-up" style={{ animationDelay: '0.5s' }}>
          <div className="glass-card rounded-2xl p-1">
            <div className="rounded-xl bg-white dark:bg-surface-light overflow-hidden">
              {/* Browser chrome */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 dark:border-slate-700/50">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-500/60" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
                  <div className="w-3 h-3 rounded-full bg-green-500/60" />
                </div>
                <div className="flex-1 mx-4">
                  <div className="bg-slate-100 dark:bg-surface rounded-md px-3 py-1 text-xs text-slate-500 text-center">
                    app.clip2course.online/dashboard
                  </div>
                </div>
              </div>
              {/* Dashboard mockup */}
              <div className="p-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-slate-50 dark:bg-surface rounded-lg p-4 border border-slate-200 dark:border-slate-800">
                  <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center mb-3">
                    <Play className="w-4 h-4 text-primary-light" />
                  </div>
                  <div className="text-sm font-medium text-slate-900 dark:text-white mb-1">Video Input</div>
                  <div className="text-xs text-slate-500">Paste link or upload</div>
                  <div className="mt-3 h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full w-3/4 bg-gradient-to-r from-primary to-accent rounded-full" />
                  </div>
                </div>
                <div className="bg-slate-50 dark:bg-surface rounded-lg p-4 border border-slate-200 dark:border-slate-800">
                  <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center mb-3">
                    <Zap className="w-4 h-4 text-accent-light" />
                  </div>
                  <div className="text-sm font-medium text-slate-900 dark:text-white mb-1">AI Processing</div>
                  <div className="text-xs text-slate-500">Generating course...</div>
                  <div className="mt-3 flex gap-1">
                    {[...Array(4)].map((_, i) => (
                      <div key={i} className="h-1.5 flex-1 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-accent rounded-full"
                          style={{ width: `${(i + 1) * 25}%` }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
                <div className="bg-slate-50 dark:bg-surface rounded-lg p-4 border border-slate-200 dark:border-slate-800">
                  <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center mb-3">
                    <BookOpen className="w-4 h-4 text-green-400" />
                  </div>
                  <div className="text-sm font-medium text-slate-900 dark:text-white mb-1">Course Ready</div>
                  <div className="text-xs text-slate-500">5 modules · 12 quizzes</div>
                  <div className="mt-3 h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full w-full bg-gradient-to-r from-green-500 to-emerald-400 rounded-full" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
