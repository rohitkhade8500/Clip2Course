import { X, Shield } from 'lucide-react'

interface PrivacyModalProps {
  onClose: () => void
}

export default function PrivacyModal({ onClose }: PrivacyModalProps) {
  return (
    <div
      className="modal-overlay fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
      id="privacy-modal-overlay"
    >
      <div
        className="modal-content glass-card rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        id="privacy-modal-content"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
              <Shield className="w-5 h-5 text-primary-light" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white">Privacy Policy</h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center transition-colors cursor-pointer"
            aria-label="Close modal"
            id="privacy-modal-close"
          >
            <X className="w-4 h-4 text-slate-500 dark:text-slate-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[60vh] text-sm text-slate-600 dark:text-slate-400 leading-relaxed space-y-4">
          <p className="text-slate-700 dark:text-slate-300 font-medium">
            Last updated: June 2026
          </p>

          <p>
            Clip2Course AI ("we," "our," or "us") is committed to protecting your privacy.
            This Privacy Policy explains how we collect, use, disclose, and safeguard your
            information when you visit our website and use our services.
          </p>

          <h4 className="text-slate-900 dark:text-white font-semibold text-base mt-6">1. Information We Collect</h4>
          <p>
            We collect information you voluntarily provide, including your name, email address,
            and any messages sent through our contact form. When you join our waitlist, we store
            your email address to notify you about product updates and launch information.
          </p>

          <h4 className="text-slate-900 dark:text-white font-semibold text-base mt-6">2. How We Use Your Information</h4>
          <p>
            We use collected information to: communicate with you about our product, send waitlist
            updates and launch notifications, respond to your inquiries and support requests, and
            improve our website and services. We do not sell your personal information to third parties.
          </p>

          <h4 className="text-slate-900 dark:text-white font-semibold text-base mt-6">3. Video Data & Content Processing</h4>
          <p>
            When you use Clip2Course AI to process videos, we temporarily access video content
            solely for the purpose of generating course materials. We do not store raw video
            files permanently. Generated course content is associated with your account and can
            be deleted at any time upon request.
          </p>

          <h4 className="text-slate-900 dark:text-white font-semibold text-base mt-6">4. Data Security</h4>
          <p>
            We implement industry-standard security measures including encryption in transit
            (TLS 1.3), encrypted storage, and access controls. However, no method of electronic
            transmission is 100% secure, and we cannot guarantee absolute security.
          </p>

          <h4 className="text-slate-900 dark:text-white font-semibold text-base mt-6">5. Your Rights</h4>
          <p>
            You may request access to, correction of, or deletion of your personal data at any
            time by contacting us at{' '}
            <a
              href="mailto:founder@clip2course.online"
              className="text-primary-light hover:underline"
            >
              founder@clip2course.online
            </a>
            . We will respond to your request within 30 days.
          </p>

          <h4 className="text-slate-900 dark:text-white font-semibold text-base mt-6">6. Contact Us</h4>
          <p>
            If you have questions about this Privacy Policy, please contact us at{' '}
            <a
              href="mailto:founder@clip2course.online"
              className="text-primary-light hover:underline"
            >
              founder@clip2course.online
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  )
}
