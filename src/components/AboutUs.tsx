import { Sparkles, Rocket, Users, Target, ExternalLink } from 'lucide-react'

export default function AboutUs() {
  return (
    <section id="about-us" className="relative py-24 md:py-32">
      {/* Subtle gradient divider */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[80%] h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary-dark dark:text-primary-light text-sm font-medium mb-4">
            <Users className="w-4 h-4" />
            About Us
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-slate-900 dark:text-white mb-6">
            The Team Behind{' '}
            <span className="gradient-text">Clip2Course AI</span>
          </h2>
          <p className="text-lg text-slate-600 dark:text-slate-400 max-w-3xl mx-auto leading-relaxed">
            We're a passionate team building the future of AI-powered education — making it effortless
            for anyone to transform video content into professional, structured courses.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Founder Card */}
          <div className="flex justify-center">
            <div className="glass-card rounded-2xl p-8 max-w-sm w-full text-center relative overflow-hidden">
              {/* Decorative gradient */}
              <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-primary/10 to-transparent rounded-t-2xl" />

              {/* Avatar */}
              <div className="relative z-10 w-28 h-28 mx-auto rounded-full bg-gradient-to-br from-primary via-accent to-neon-blue p-[3px] mb-5">
                <div className="w-full h-full rounded-full bg-white dark:bg-surface-light flex items-center justify-center">
                  <span className="text-3xl font-bold gradient-text">RK</span>
                </div>
              </div>

              <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-1 relative z-10">
                Rohit Rajesh Khade
              </h3>
              <p className="text-primary-dark dark:text-primary-light font-medium text-sm mb-4 relative z-10">
                Founder & CEO
              </p>

              <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed mb-5 relative z-10">
                Visionary technologist and entrepreneur with a deep passion for democratizing education
                through AI. Rohit founded Clip2Course AI with the belief that every great video deserves
                to become a structured learning experience — accessible to educators, trainers, and
                organizations worldwide.
              </p>

              <div className="flex items-center justify-center gap-3 relative z-10">
                <a
                  href="#"
                  className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-surface hover:bg-primary/20 border border-slate-200 dark:border-slate-700 flex items-center justify-center transition-all group"
                  aria-label="LinkedIn"
                  id="founder-linkedin"
                >
                  <ExternalLink className="w-4 h-4 text-slate-500 dark:text-slate-400 group-hover:text-primary-dark dark:group-hover:text-primary-light transition-colors" />
                </a>
              </div>
            </div>
          </div>

          {/* Company Info */}
          <div className="flex flex-col gap-6">
            <div>
              <h3 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white mb-4">
                Reimagining How the World Learns from Video
              </h3>
              <p className="text-slate-600 dark:text-slate-400 leading-relaxed mb-4">
                Clip2Course AI is an AI-powered SaaS platform that transforms any video — YouTube lectures,
                workshop recordings, training sessions, or raw uploads — into fully structured course
                modules complete with quizzes, summaries, and study notes. We serve educators, corporate
                trainers, content creators, and edtech companies who need to scale quality learning
                content without scaling their teams.
              </p>
              <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                Our proprietary AI engine combines speech recognition, natural language understanding,
                and instructional design principles to produce courses that rival hand-crafted content —
                in a fraction of the time and cost. Whether you're an independent instructor with a
                single video or an enterprise with thousands of hours of training footage, Clip2Course AI
                adapts to your needs.
              </p>
            </div>

            {/* Key stats */}
            <div className="grid grid-cols-3 gap-4">
              {[
                { icon: Sparkles, value: 'AI-First', label: 'Technology' },
                { icon: Target, value: 'B2B SaaS', label: 'Business Model' },
                { icon: Rocket, value: 'Q3 2026', label: 'Public Launch' },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="glass-card rounded-xl p-4 text-center"
                >
                  <stat.icon className="w-5 h-5 text-primary-dark dark:text-primary-light mx-auto mb-2" />
                  <div className="text-slate-900 dark:text-white font-bold text-sm">{stat.value}</div>
                  <div className="text-slate-500 text-xs mt-0.5">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
