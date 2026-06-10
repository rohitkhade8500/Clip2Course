import { Video, BrainCircuit, FileText, ListChecks } from 'lucide-react'

const workflow = [
  {
    icon: Video,
    step: '01',
    title: 'Drop Your Video',
    description: 'Paste a YouTube link, upload an MP4, or connect your cloud storage. We handle videos up to 4 hours long.',
  },
  {
    icon: BrainCircuit,
    step: '02',
    title: 'AI Structures It',
    description: 'Our AI analyzes speech, visuals, and context to break content into logical modules with clear learning objectives.',
  },
  {
    icon: FileText,
    step: '03',
    title: 'Review & Customize',
    description: 'Fine-tune the generated course outline, edit quiz questions, and adjust module boundaries to match your curriculum.',
  },
  {
    icon: ListChecks,
    step: '04',
    title: 'Publish & Share',
    description: 'Export as a polished course package, embed in your LMS, or share a direct link with your students.',
  },
]

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="relative py-24 md:py-32">
      {/* Subtle gradient divider */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[80%] h-px bg-gradient-to-r from-transparent via-accent/30 to-transparent" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-accent/10 border border-accent/20 text-purple-700 dark:text-accent-light text-sm font-medium mb-4">
            How It Works
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-slate-900 dark:text-white mb-6">
            From Raw Video to Course in{' '}
            <span className="gradient-text">4 Simple Steps</span>
          </h2>
          <p className="text-lg text-slate-600 dark:text-slate-400 max-w-xl mx-auto">
            No complicated setup. No learning curve. Just drop your video and let AI do the heavy lifting.
          </p>
        </div>

        {/* Steps */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {workflow.map((item, index) => (
            <div
              key={item.step}
              className="glass-card rounded-xl p-6 text-center relative group"
            >
              {/* Connector line */}
              {index < workflow.length - 1 && (
                <div className="hidden lg:block absolute top-1/2 -right-3 w-6 h-px bg-gradient-to-r from-primary/40 to-transparent" />
              )}
              <div className="text-xs font-bold text-primary-dark dark:text-primary-light mb-3 tracking-widest uppercase">
                Step {item.step}
              </div>
              <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-primary/15 to-accent/15 flex items-center justify-center mb-4 border border-slate-200 dark:border-primary/10 group-hover:border-primary/30 transition-colors">
                <item.icon className="w-7 h-7 text-primary-dark dark:text-primary-light" />
              </div>
              <h4 className="text-slate-900 dark:text-white font-semibold text-lg mb-2">{item.title}</h4>
              <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed">{item.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
