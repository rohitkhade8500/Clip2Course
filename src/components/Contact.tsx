import { type FormEvent, useState } from 'react'
import { Send, Mail, MapPin, Clock, Loader2 } from 'lucide-react'
import { submitToWeb3Forms } from '../utils/web3forms'

export default function Contact() {
  const [formData, setFormData] = useState({ name: '', email: '', message: '' })
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (status === 'loading') return

    setStatus('loading')
    setErrorMsg('')

    try {
      await submitToWeb3Forms({
        subject: `📩 New Contact Message from ${formData.name}`,
        from_name: formData.name,
        email: formData.email,
        message: formData.message,
      })
      setStatus('success')
      setFormData({ name: '', email: '', message: '' })
      setTimeout(() => setStatus('idle'), 5000)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to send. Please try again.')
      setStatus('error')
      setTimeout(() => setStatus('idle'), 5000)
    }
  }

  return (
    <section id="contact" className="relative py-24 md:py-32">
      {/* Subtle gradient divider */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[80%] h-px bg-gradient-to-r from-transparent via-accent/30 to-transparent" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-accent/10 border border-accent/20 text-accent-light text-sm font-medium mb-4">
            <Mail className="w-4 h-4" />
            Get In Touch
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white mb-4">
            Let's Build the Future of Learning Together
          </h2>
          <p className="text-slate-600 dark:text-slate-400 max-w-lg mx-auto">
            Have a question, partnership idea, or just want to say hi? We'd love to hear from you.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-12">
          {/* Contact Info */}
          <div className="lg:col-span-2 flex flex-col justify-center gap-8">
            <div className="glass-card rounded-xl p-6">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
                  <Mail className="w-5 h-5 text-primary-light" />
                </div>
                <div>
                  <h4 className="text-slate-900 dark:text-white font-semibold mb-1">Customer Support</h4>
                  <a
                    href="mailto:customer.support@clip2course.online"
                    className="text-slate-500 dark:text-slate-400 hover:text-primary-light transition-colors text-sm"
                    id="contact-support-email-link"
                  >
                    customer.support@clip2course.online
                  </a>
                </div>
              </div>
            </div>

            <div className="glass-card rounded-xl p-6">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-accent/15 flex items-center justify-center shrink-0">
                  <Mail className="w-5 h-5 text-accent-light" />
                </div>
                <div>
                  <h4 className="text-slate-900 dark:text-white font-semibold mb-1">Founder & Partnerships</h4>
                  <a
                    href="mailto:founder@clip2course.online"
                    className="text-slate-500 dark:text-slate-400 hover:text-accent-light transition-colors text-sm"
                    id="contact-founder-email-link"
                  >
                    founder@clip2course.online
                  </a>
                </div>
              </div>
            </div>

            <div className="glass-card rounded-xl p-6">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-accent/15 flex items-center justify-center shrink-0">
                  <MapPin className="w-5 h-5 text-accent-light" />
                </div>
                <div>
                  <h4 className="text-slate-900 dark:text-white font-semibold mb-1">Location</h4>
                  <p className="text-slate-500 dark:text-slate-400 text-sm">Remote-first · Global Team</p>
                </div>
              </div>
            </div>

            <div className="glass-card rounded-xl p-6">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-green-500/15 flex items-center justify-center shrink-0">
                  <Clock className="w-5 h-5 text-green-400" />
                </div>
                <div>
                  <h4 className="text-slate-900 dark:text-white font-semibold mb-1">Response Time</h4>
                  <p className="text-slate-500 dark:text-slate-400 text-sm">We reply within 24 hours</p>
                </div>
              </div>
            </div>
          </div>

          {/* Contact Form */}
          <div className="lg:col-span-3">
            <form
              onSubmit={handleSubmit}
              className="glass-card rounded-2xl p-6 sm:p-8"
              id="contact-form"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-5">
                <div>
                  <label htmlFor="contact-name" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Name
                  </label>
                  <input
                    type="text"
                    id="contact-name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Your full name"
                    required
                    disabled={status === 'loading'}
                    className="w-full px-4 py-3 rounded-xl bg-white dark:bg-surface border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 text-sm transition-all disabled:opacity-50"
                  />
                </div>
                <div>
                  <label htmlFor="contact-email" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    id="contact-email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="you@company.com"
                    required
                    disabled={status === 'loading'}
                    className="w-full px-4 py-3 rounded-xl bg-white dark:bg-surface border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 text-sm transition-all disabled:opacity-50"
                  />
                </div>
              </div>
              <div className="mb-6">
                <label htmlFor="contact-message" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Message
                </label>
                <textarea
                  id="contact-message"
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  placeholder="Tell us about your use case, partnership idea, or question..."
                  required
                  rows={5}
                  disabled={status === 'loading'}
                  className="w-full px-4 py-3 rounded-xl bg-white dark:bg-surface border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 text-sm transition-all resize-none disabled:opacity-50"
                />
              </div>

              {/* Error message */}
              {status === 'error' && errorMsg && (
                <p className="text-red-400 text-sm mb-4 fade-in-up">⚠️ {errorMsg}</p>
              )}

              <button
                type="submit"
                id="contact-submit"
                disabled={status === 'loading' || status === 'success'}
                className="glow-btn w-full sm:w-auto px-8 py-3.5 rounded-xl bg-primary text-white font-semibold text-sm flex items-center justify-center gap-2 hover:bg-primary-light transition-all cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {status === 'loading' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Sending...
                  </>
                ) : status === 'success' ? (
                  <>
                    <span>✅</span> Message Sent!
                  </>
                ) : status === 'error' ? (
                  <>
                    <span>⚠️</span> Try Again <Send className="w-4 h-4" />
                  </>
                ) : (
                  <>
                    Send Message <Send className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    </section>
  )
}
