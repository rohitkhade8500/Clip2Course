import { Sparkles, Heart, Mail } from 'lucide-react'

interface FooterProps {
  onPrivacyClick: () => void
  onTermsClick: () => void
}

export default function Footer({ onPrivacyClick, onTermsClick }: FooterProps) {
  const currentYear = new Date().getFullYear()

  return (
    <footer id="footer" className="relative border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-surface transition-colors duration-300">
      {/* Gradient divider */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[60%] h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          {/* Brand */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <span className="text-lg font-bold text-slate-900 dark:text-white">
              Clip2Course<span className="text-primary-dark dark:text-primary-light">.online</span>
            </span>
          </div>

          {/* Center: copyright */}
          <div className="flex items-center gap-1 text-sm text-slate-500">
            <span>© {currentYear} Clip2Course AI. Made with</span>
            <Heart className="w-3.5 h-3.5 text-red-400 fill-red-400 inline" />
            <span>for educators.</span>
          </div>

          {/* Links */}
          <div className="flex items-center gap-6 flex-wrap justify-center">
            <a
              href="mailto:customer.support@clip2course.online"
              className="text-sm text-slate-500 hover:text-primary-dark dark:hover:text-primary-light transition-colors flex items-center gap-1.5"
              id="footer-email-link"
            >
              <Mail className="w-3.5 h-3.5" />
              customer.support@clip2course.online
            </a>
            <div className="hidden sm:block w-px h-4 bg-slate-300 dark:bg-slate-700" />
            <button
              id="terms-conditions-link"
              onClick={onTermsClick}
              className="text-sm text-slate-500 hover:text-primary-dark dark:hover:text-primary-light transition-colors underline underline-offset-2 decoration-slate-300 dark:decoration-slate-700 hover:decoration-primary-dark dark:hover:decoration-primary-light cursor-pointer"
            >
              Terms & Conditions
            </button>
            <button
              id="privacy-policy-link"
              onClick={onPrivacyClick}
              className="text-sm text-slate-500 hover:text-primary-dark dark:hover:text-primary-light transition-colors underline underline-offset-2 decoration-slate-300 dark:decoration-slate-700 hover:decoration-primary-dark dark:hover:decoration-primary-light cursor-pointer"
            >
              Privacy Policy
            </button>
          </div>
        </div>
      </div>
    </footer>
  )
}
