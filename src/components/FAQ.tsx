import { useState } from 'react'
import { ChevronDown, HelpCircle } from 'lucide-react'

interface FAQItem {
  question: string
  answer: string
}

const faqs: FAQItem[] = [
  {
    question: 'How does Clip2Course AI work?',
    answer:
      'Simply paste a video URL (YouTube, Vimeo, or any public video link) or upload a raw video file. Our AI engine transcribes and analyzes the content using advanced natural language processing. It then identifies key topics, creates logical chapter breakpoints, generates quiz questions based on the material, and produces comprehensive study notes — all within minutes. You can review, customize, and export the complete course.',
  },
  {
    question: 'What video formats and platforms do you support?',
    answer:
      'Clip2Course AI supports a wide range of input methods. You can paste links from YouTube, Vimeo, Loom, Google Drive, and most publicly accessible video URLs. For direct uploads, we accept MP4, MOV, AVI, WebM, and MKV formats up to 4 hours in length. We also support audio-only files (MP3, WAV, M4A) for podcast-to-course conversion. Enterprise plans include API access for batch processing.',
  },
  {
    question: 'When are you launching?',
    answer:
      'We\'re currently in private beta with select education partners and content creators. Our public launch is planned for Q3 2026. Join our waitlist to get early access, exclusive founder pricing, and a direct line to our product team. Early waitlist members will receive a 60% lifetime discount on all paid plans.',
  },
  {
    question: 'How accurate is the AI-generated course content?',
    answer:
      'Our AI achieves over 95% accuracy in transcription and content structuring. It uses multi-layered analysis — combining speech recognition, semantic understanding, and instructional design heuristics — to produce high-quality output. That said, we always recommend a human review pass before publishing. The platform makes editing and customizing AI-generated content fast and intuitive.',
  },
  {
    question: 'Can I customize the generated courses?',
    answer:
      'Absolutely. Clip2Course AI generates a fully editable course structure. You can rename modules, reorder chapters, edit quiz questions, adjust timestamps, rewrite summaries, and add your own notes — all through an intuitive drag-and-drop editor. Think of the AI output as a strong first draft that you can polish to perfection in minutes.',
  },
  {
    question: 'What LMS platforms do you integrate with?',
    answer:
      'We support SCORM 1.2 & 2004 and xAPI (Tin Can) exports, which means you can import courses into virtually any modern LMS — including Moodle, Canvas, Blackboard, Thinkific, Teachable, and LearnDash. We also provide JSON/API export for custom integrations. Direct one-click integrations with popular platforms are on our roadmap for launch.',
  },
  {
    question: 'Is my video data secure?',
    answer:
      'Security is a core priority. All data is encrypted in transit (TLS 1.3) and at rest (AES-256). We process videos in isolated, ephemeral environments and do not store raw video files after processing is complete. For enterprise customers, we offer dedicated infrastructure, SOC 2 compliance documentation, and custom data residency options.',
  },
  {
    question: 'Do you offer a free plan?',
    answer:
      'Yes! Our Starter plan is free forever and includes 3 video-to-course conversions per month for videos up to 30 minutes. It\'s a great way to experience the power of Clip2Course AI before upgrading. Paid plans unlock unlimited conversions, longer video support, advanced exports, and priority support.',
  },
]

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  const toggle = (index: number) => {
    setOpenIndex(openIndex === index ? null : index)
  }

  return (
    <section id="faq" className="relative py-24 md:py-32">
      {/* Subtle gradient divider */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[80%] h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary-dark dark:text-primary-light text-sm font-medium mb-4">
            <HelpCircle className="w-4 h-4" />
            FAQ
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white mb-4">
            Frequently Asked Questions
          </h2>
          <p className="text-slate-600 dark:text-slate-400 max-w-lg mx-auto">
            Everything you need to know about Clip2Course AI before joining the waitlist.
          </p>
        </div>

        {/* Accordion */}
        <div className="flex flex-col gap-4" id="faq-accordion">
          {faqs.map((faq, index) => {
            const isOpen = openIndex === index
            return (
              <div
                key={index}
                className={`glass-card rounded-xl overflow-hidden transition-all duration-300 ${
                  isOpen ? 'border-primary/40' : ''
                }`}
              >
                <button
                  id={`faq-toggle-${index}`}
                  onClick={() => toggle(index)}
                  className="w-full flex items-center justify-between p-5 sm:p-6 text-left cursor-pointer hover:bg-slate-50/50 dark:hover:bg-surface-light/30 transition-colors"
                  aria-expanded={isOpen}
                >
                  <span className="text-slate-900 dark:text-white font-semibold text-lg pr-4">{faq.question}</span>
                  <ChevronDown
                    className={`w-5 h-5 text-primary-dark dark:text-primary-light shrink-0 transition-transform duration-300 ${
                      isOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                <div
                  className={`overflow-hidden transition-all duration-300 ${
                    isOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
                  }`}
                >
                  <div className="px-5 sm:px-6 pb-5 sm:pb-6">
                    <p className="text-slate-600 dark:text-slate-400 leading-relaxed">{faq.answer}</p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
