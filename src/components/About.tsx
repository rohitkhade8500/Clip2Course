import { Clock, BrainCircuit, GraduationCap, Video, FileText, ListChecks } from 'lucide-react'

const features = [
  {
    icon: Clock,
    title: 'Save 40+ Hours Per Course',
    description:
      'What used to take educators weeks — outlining, scripting, and structuring — now happens in minutes with AI that understands your content.',
  },
  {
    icon: BrainCircuit,
    title: 'AI That Thinks Like a Teacher',
    description:
      'Our models don\'t just transcribe. They identify key concepts, create logical learning paths, and generate assessments that actually test understanding.',
  },
  {
    icon: GraduationCap,
    title: 'Enterprise-Ready Course Output',
    description:
      'Export to SCORM, xAPI, or your LMS of choice. Every course comes with modules, timestamps, quizzes, and downloadable study notes.',
  },
]

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

export default function About() {
  return (
    <section id="about" className="relative py-24 md:py-32">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-accent/10 border border-accent/20 text-accent-light text-sm font-medium mb-4">
            Our Mission
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-6">
            We Believe Video Content Deserves{' '}
            <span className="gradient-text">Better Structure</span>
          </h2>
          <p className="text-lg text-slate-400 max-w-3xl mx-auto leading-relaxed">
            Educators, trainers, and content teams spend countless hours manually structuring video
            content into courses. Clip2Course AI eliminates that grind — turning any video into a
            structured, quiz-ready learning experience with one click.
          </p>
        </div>

        {/* 2-Column: Mission + Features */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 mb-24">
          {/* Mission Statement */}
          <div className="flex flex-col justify-center">
            <h3 className="text-2xl sm:text-3xl font-bold text-white mb-6">
              Built for Educators Who'd Rather Teach Than Edit
            </h3>
            <p className="text-slate-400 leading-relaxed mb-6">
              Every day, thousands of educators record brilliant video content — lectures, workshops,
              tutorials — only to spend days organizing it into a course format. They outline
              chapters, write quizzes, create summaries, and format notes. It's tedious, time-consuming,
              and takes them away from what they do best: teaching.
            </p>
            <p className="text-slate-400 leading-relaxed">
              Clip2Course AI was born from a simple question:{' '}
              <span className="text-white font-medium">
                "What if the video itself could become the course?"
              </span>{' '}
              Our AI watches your video the way a top instructional designer would — identifying
              topics, extracting key concepts, and generating a complete course structure that's
              ready to deploy.
            </p>
          </div>

          {/* Feature Cards */}
          <div className="flex flex-col gap-5">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="glass-card rounded-xl p-6 flex gap-5"
              >
                <div className="shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center border border-primary/10">
                  <feature.icon className="w-6 h-6 text-primary-light" />
                </div>
                <div>
                  <h4 className="text-white font-semibold text-lg mb-1">{feature.title}</h4>
                  <p className="text-slate-400 text-sm leading-relaxed">{feature.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* How It Works */}
        <div className="text-center mb-12">
          <h3 className="text-2xl sm:text-3xl font-bold text-white mb-4">
            How It Works
          </h3>
          <p className="text-slate-400 max-w-xl mx-auto">
            Four simple steps from raw video to a complete, publish-ready course.
          </p>
        </div>

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
              <div className="text-xs font-bold text-primary-light mb-3 tracking-widest uppercase">
                Step {item.step}
              </div>
              <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-primary/15 to-accent/15 flex items-center justify-center mb-4 border border-primary/10 group-hover:border-primary/30 transition-colors">
                <item.icon className="w-7 h-7 text-primary-light" />
              </div>
              <h4 className="text-white font-semibold text-lg mb-2">{item.title}</h4>
              <p className="text-slate-400 text-sm leading-relaxed">{item.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
