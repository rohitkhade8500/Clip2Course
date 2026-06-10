import { X, FileSignature } from 'lucide-react'

interface TermsModalProps {
  onClose: () => void
}

export default function TermsModal({ onClose }: TermsModalProps) {
  return (
    <div
      className="modal-overlay fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
      id="terms-modal-overlay"
    >
      <div
        className="modal-content glass-card rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
        id="terms-modal-content"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700/50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent/15 flex items-center justify-center">
              <FileSignature className="w-5 h-5 text-accent-light" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white">Terms & Conditions</h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center transition-colors cursor-pointer shrink-0"
            aria-label="Close modal"
            id="terms-modal-close"
          >
            <X className="w-4 h-4 text-slate-500 dark:text-slate-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto text-sm text-slate-600 dark:text-slate-400 leading-relaxed space-y-4">
          <p className="text-slate-700 dark:text-slate-300 font-medium">
            Last updated: June 2026
          </p>

          <p>
            Welcome to Clip2Course AI. By accessing or using our website and services, you agree to be bound by these Terms and Conditions. Please read them carefully.
          </p>

          <h4 className="text-slate-900 dark:text-white font-semibold text-base mt-6">1. Acceptance of Terms</h4>
          <p>
            By using Clip2Course AI, you agree to these Terms. If you do not agree to these Terms, do not use our services. We may update these Terms from time to time, and your continued use constitutes acceptance of those changes.
          </p>

          <h4 className="text-slate-900 dark:text-white font-semibold text-base mt-6">2. Use of Service & Account Responsibilities</h4>
          <p>
            You are responsible for maintaining the confidentiality of your account credentials. You agree not to use the service for any illegal or unauthorized purpose. You must not upload or process video content that you do not own or have the explicit right to use.
          </p>

          <h4 className="text-slate-900 dark:text-white font-semibold text-base mt-6">3. Content Ownership & Rights</h4>
          <p>
            You retain all ownership rights to the original video content you upload. By processing content through Clip2Course AI, you grant us a temporary license to analyze and process the video solely for the purpose of generating course materials for you. The resulting generated course materials belong to you.
          </p>

          <h4 className="text-slate-900 dark:text-white font-semibold text-base mt-6">4. Acceptable Use Policy</h4>
          <p>
            You agree not to process videos containing explicit, illegal, or harmful material. We reserve the right to suspend or terminate accounts that violate this policy, use our API abusively, or attempt to reverse-engineer our proprietary AI models.
          </p>

          <h4 className="text-slate-900 dark:text-white font-semibold text-base mt-6">5. Limitation of Liability</h4>
          <p>
            Clip2Course AI is provided "as is" without any warranties, express or implied. While we strive for high accuracy in our AI-generated courses, we do not guarantee that the generated content will be entirely error-free. You are responsible for reviewing and verifying the output before distributing it to learners.
          </p>

          <h4 className="text-slate-900 dark:text-white font-semibold text-base mt-6">6. Subscriptions and Payments</h4>
          <p>
            Paid plans are billed on a recurring basis. You may cancel your subscription at any time; however, there are no refunds for partially used billing periods unless required by law.
          </p>

          <h4 className="text-slate-900 dark:text-white font-semibold text-base mt-6">7. Contact Us</h4>
          <p>
            If you have any questions about these Terms, please contact us at{' '}
            <a
              href="mailto:founder@clip2course.online"
              className="text-primary-dark dark:text-primary-light hover:underline"
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
