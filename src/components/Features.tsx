import { Layers, Zap, FileText, Shield, Globe, BarChart3 } from 'lucide-react'

const features = [
  {
    icon: Layers,
    title: 'Smart Module Generation',
    description:
      'AI automatically segments your video into logical chapters and modules with clear titles, descriptions, and learning objectives.',
    color: 'from-primary/20 to-primary/5',
    iconColor: 'text-primary-light',
  },
  {
    icon: Zap,
    title: 'Instant Quiz Creation',
    description:
      'Generate multiple-choice, true/false, and short-answer questions from video content — calibrated to test real comprehension.',
    color: 'from-accent/20 to-accent/5',
    iconColor: 'text-accent-light',
  },
  {
    icon: FileText,
    title: 'Auto Study Notes',
    description:
      'Get polished, downloadable study notes and summaries for every module — perfect for student revision and reference material.',
    color: 'from-neon-blue/20 to-neon-blue/5',
    iconColor: 'text-blue-400',
  },
  {
    icon: Globe,
    title: 'Multi-Platform Support',
    description:
      'Import videos from YouTube, Vimeo, Loom, Google Drive, or upload directly. Support for MP4, MOV, WebM, AVI, and MKV.',
    color: 'from-green-500/20 to-green-500/5',
    iconColor: 'text-green-400',
  },
  {
    icon: Shield,
    title: 'LMS-Ready Export',
    description:
      'Export courses in SCORM, xAPI, or JSON format. Seamlessly integrate with Moodle, Canvas, Thinkific, Teachable, and more.',
    color: 'from-amber-500/20 to-amber-500/5',
    iconColor: 'text-amber-400',
  },
  {
    icon: BarChart3,
    title: 'Analytics Dashboard',
    description:
      'Track course generation metrics, learner engagement, and content quality scores — all from a single unified dashboard.',
    color: 'from-rose-500/20 to-rose-500/5',
    iconColor: 'text-rose-400',
  },
]

export default function Features() {
  return (
    <section id="features" className="relative py-24 md:py-32">
      {/* Subtle gradient divider */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[80%] h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary-dark dark:text-primary-light text-sm font-medium mb-4">
            <Zap className="w-4 h-4" />
            Features
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-slate-900 dark:text-white mb-6">
            Everything You Need to{' '}
            <span className="gradient-text">Build Courses Faster</span>
          </h2>
          <p className="text-lg text-slate-600 dark:text-slate-400 max-w-3xl mx-auto leading-relaxed">
            From video ingestion to course export, Clip2Course AI handles every step of the
            content creation pipeline with enterprise-grade quality.
          </p>
        </div>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="glass-card rounded-xl p-6 group"
            >
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${feature.color} flex items-center justify-center mb-4 border border-slate-200 dark:border-white/5 group-hover:scale-110 transition-transform`}>
                <feature.icon className={`w-6 h-6 ${feature.iconColor}`} />
              </div>
              <h4 className="text-slate-900 dark:text-white font-semibold text-lg mb-2">{feature.title}</h4>
              <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
