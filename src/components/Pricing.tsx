import { Check, Sparkles, Zap, Building2 } from 'lucide-react'

interface PlanFeature {
  text: string
  included: boolean
}

interface PricingPlan {
  name: string
  icon: typeof Sparkles
  price: string
  period: string
  description: string
  features: PlanFeature[]
  cta: string
  popular?: boolean
  gradient: string
}

const plans: PricingPlan[] = [
  {
    name: 'Starter',
    icon: Sparkles,
    price: 'Free',
    period: 'forever',
    description: 'Perfect for individual educators trying out AI course generation.',
    features: [
      { text: '3 video-to-course conversions/month', included: true },
      { text: 'Videos up to 30 minutes', included: true },
      { text: 'Basic quiz generation', included: true },
      { text: 'PDF export', included: true },
      { text: 'Community support', included: true },
      { text: 'Custom branding', included: false },
      { text: 'API access', included: false },
    ],
    cta: 'Get Started Free',
    gradient: 'from-slate-500 to-slate-600',
  },
  {
    name: 'Pro',
    icon: Zap,
    price: '₹1,999',
    period: '/month',
    description: 'For professional educators and content creators who need more power.',
    features: [
      { text: 'Unlimited conversions', included: true },
      { text: 'Videos up to 4 hours', included: true },
      { text: 'Advanced quiz + assessment builder', included: true },
      { text: 'SCORM & xAPI export', included: true },
      { text: 'Study notes & summaries', included: true },
      { text: 'Custom branding', included: true },
      { text: 'Priority email support', included: true },
    ],
    cta: 'Join Waitlist — Pro',
    popular: true,
    gradient: 'from-primary to-accent',
  },
  {
    name: 'Enterprise',
    icon: Building2,
    price: 'Custom',
    period: 'pricing',
    description: 'For organizations scaling course production across teams.',
    features: [
      { text: 'Everything in Pro', included: true },
      { text: 'Unlimited team members', included: true },
      { text: 'Batch video processing API', included: true },
      { text: 'SSO & advanced security', included: true },
      { text: 'Custom LMS integrations', included: true },
      { text: 'Dedicated account manager', included: true },
      { text: 'SLA & uptime guarantee', included: true },
    ],
    cta: 'Contact Sales',
    gradient: 'from-accent to-rose-500',
  },
]

export default function Pricing() {
  return (
    <section id="pricing" className="relative py-24 md:py-32">
      {/* Subtle gradient divider */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[80%] h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary-dark dark:text-primary-light text-sm font-medium mb-4">
            Pricing
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-slate-900 dark:text-white mb-6">
            Simple, Transparent{' '}
            <span className="gradient-text">Pricing</span>
          </h2>
          <p className="text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto leading-relaxed">
            Start free. Scale when you're ready. Early waitlist members get{' '}
            <span className="text-primary-dark dark:text-primary-light font-semibold">60% off</span> all paid plans for life.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 items-start">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`glass-card rounded-2xl overflow-hidden relative ${
                plan.popular ? 'ring-2 ring-primary/50 scale-[1.02] md:scale-105' : ''
              }`}
            >
              {/* Popular badge */}
              {plan.popular && (
                <div className="absolute top-0 left-0 right-0 bg-gradient-to-r from-primary to-accent py-1.5 text-center">
                  <span className="text-xs font-bold text-white uppercase tracking-wider">
                    Most Popular
                  </span>
                </div>
              )}

              <div className={`p-6 sm:p-8 ${plan.popular ? 'pt-12' : ''}`}>
                {/* Plan header */}
                <div className="flex items-center gap-3 mb-4">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${plan.gradient} flex items-center justify-center`}>
                    <plan.icon className="w-5 h-5 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white">{plan.name}</h3>
                </div>

                {/* Price */}
                <div className="mb-4">
                  <span className="text-4xl font-extrabold text-slate-900 dark:text-white">{plan.price}</span>
                  <span className="text-slate-500 text-sm ml-1">{plan.period}</span>
                </div>

                <p className="text-slate-600 dark:text-slate-400 text-sm mb-6 leading-relaxed">
                  {plan.description}
                </p>

                {/* CTA */}
                <a
                  href="#hero"
                  id={`pricing-cta-${plan.name.toLowerCase()}`}
                  className={`block w-full py-3 rounded-xl font-semibold text-sm text-center transition-all mb-6 ${
                    plan.popular
                      ? 'glow-btn bg-primary text-white hover:bg-primary-light pulse-glow'
                      : 'bg-white dark:bg-surface-light text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 hover:border-primary/50 hover:bg-slate-50 dark:hover:bg-surface-lighter'
                  }`}
                >
                  {plan.cta}
                </a>

                {/* Features */}
                <ul className="space-y-3">
                  {plan.features.map((feature) => (
                    <li key={feature.text} className="flex items-start gap-3 text-sm">
                      <Check
                        className={`w-4 h-4 mt-0.5 shrink-0 ${
                          feature.included ? 'text-green-500 dark:text-green-400' : 'text-slate-400 dark:text-slate-600'
                        }`}
                      />
                      <span className={feature.included ? 'text-slate-700 dark:text-slate-300' : 'text-slate-400 dark:text-slate-600 line-through'}>
                        {feature.text}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom note */}
        <p className="text-center text-sm text-slate-500 mt-8">
          All prices in INR. Annual billing available at launch with additional 20% savings.
        </p>
      </div>
    </section>
  )
}
