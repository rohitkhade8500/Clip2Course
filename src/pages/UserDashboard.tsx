/**
 * Signed-in landing page at `/app/dashboard` (Requirement 7).
 *
 * Renders the account identity, the four aggregate stats, a continue-learning
 * entry, and the user's courses ordered by last accessed descending. It reads
 * only the signed-in user's records: `listCourses(user.id)` is already scoped
 * by owner (Requirement 8.2), so nothing here filters by ownership itself.
 *
 * Visually it borrows the landing page's language — the Clip2Course wordmark,
 * the grid backdrop, floating orbs and glass cards — so signing in feels like
 * the same product rather than a plain admin screen.
 *
 * Tradeoff worth knowing: `courseStore` exposes no progress accessor, so the
 * per-course progress records `computeDashboardStats` expects are reconstructed
 * from each CourseSummary. Summaries carry section counts but not quiz scores,
 * which means "questions answered" and "average score" render as 0 until a
 * progress accessor exists. That is the behaviour Requirement 7.6 asks for
 * (zero rather than an error or a blank) but it is a placeholder, not a real
 * quiz aggregate.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock,
  LayoutGrid,
  ListChecks,
  LogOut,
  Plus,
  Sparkles,
  Target,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { listCourses } from '../services/courseStore'
import { computeDashboardStats } from '../services/dashboardStats'
import type { CourseProgress, CourseSummary } from '../types/course'

type LoadState = 'loading' | 'ready' | 'error'

export default function UserDashboard() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const [courses, setCourses] = useState<CourseSummary[]>([])
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [signingOut, setSigningOut] = useState(false)

  const userId = user?.id

  const load = useCallback(async () => {
    if (!userId) return
    setLoadState('loading')
    try {
      // Already sorted by lastAccessedAt descending (Requirement 7.5)
      setCourses(await listCourses(userId))
      setLoadState('ready')
    } catch {
      setCourses([])
      setLoadState('error')
    }
  }, [userId])

  useEffect(() => {
    void load()
  }, [load])

  const stats = useMemo(
    () => computeDashboardStats(courses, toProgressRecords(courses)),
    [courses]
  )

  async function handleLogout() {
    setSigningOut(true)
    try {
      await logout()
      // Requirement 3.3: back to the landing page once the user is cleared
      navigate('/')
    } finally {
      setSigningOut(false)
    }
  }

  if (loadState === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-surface text-slate-800 dark:text-slate-200">
        <div className="text-center" role="status">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-slate-600 dark:text-slate-400">Loading your dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-50 dark:bg-surface text-slate-800 dark:text-slate-200">
      {/* Ambient backdrop, shared with the landing page */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 hero-grid" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="orb orb-1" />
        <div className="orb orb-2" />
      </div>

      <header className="relative z-10 border-b border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-surface/70 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 md:py-4 flex flex-wrap items-center justify-between gap-3">
          <Link to="/" className="flex items-center gap-2 group shrink-0">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center transition-transform group-hover:scale-110">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white">
              Clip2Course<span className="text-primary-light">.online</span>
            </span>
          </Link>

          <nav aria-label="Dashboard" className="flex items-center gap-2">
            <Link
              to="/app/create"
              className="glow-btn inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary-dark text-white text-sm font-semibold hover:bg-primary transition-all"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              New Course
            </Link>
            <Link
              to="/app/courses"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-surface-light transition-colors"
            >
              <LayoutGrid className="w-4 h-4" aria-hidden="true" />
              All Courses
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              disabled={signingOut}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-surface-light transition-colors cursor-pointer disabled:opacity-60"
            >
              <LogOut className="w-4 h-4" aria-hidden="true" />
              {signingOut ? 'Logging out...' : 'Log out'}
            </button>
          </nav>
        </div>
      </header>

      <main className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-10">
        {/* Greeting. The heading is the display name alone so screen-reader
            users land on who they are, not on decorative copy. */}
        <section className="fade-in-up">
          <p className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary-light text-xs font-medium mb-3">
            <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
            Welcome back
          </p>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight gradient-text pb-1">
            {user?.displayName ?? 'Your dashboard'}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{user?.email}</p>
        </section>

        {loadState === 'error' && (
          <div
            role="alert"
            className="rounded-xl border border-amber-300/60 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm flex flex-wrap items-center justify-between gap-3"
          >
            <span>Your courses could not be loaded. Stats below may be incomplete.</span>
            <button
              type="button"
              onClick={() => void load()}
              className="px-3 py-1.5 font-medium rounded-lg border border-amber-400/60 dark:border-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}

        {/* Requirement 7.2 / 7.6: four stats, zero rather than blank */}
        <section aria-labelledby="stats-heading">
          <h2 id="stats-heading" className="text-lg font-semibold mb-4">
            Your learning at a glance
          </h2>
          <dl className="grid gap-4 grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Total courses"
              value={stats.totalCourses}
              icon={BookOpen}
              tint="from-primary to-primary-light"
            />
            <StatCard
              label="Courses completed"
              value={stats.completedCourses}
              icon={CheckCircle2}
              tint="from-emerald-500 to-teal-400"
            />
            <StatCard
              label="Questions answered"
              value={stats.questionsAnswered}
              icon={ListChecks}
              tint="from-accent to-accent-light"
            />
            <StatCard
              label="Average score"
              value={`${stats.averageScore}%`}
              icon={Target}
              tint="from-neon-blue to-sky-400"
            />
          </dl>
        </section>

        {/* Requirement 7.3: continue the most recently accessed incomplete course */}
        {stats.continueCourse && (
          <section aria-labelledby="continue-heading">
            <h2 id="continue-heading" className="text-lg font-semibold mb-4">
              Continue learning
            </h2>
            {/* Gradient hairline border: the one card on the page that should
                pull the eye first. */}
            <div className="rounded-2xl p-px bg-gradient-to-r from-primary via-accent to-neon-blue shadow-lg shadow-primary/10">
              <div className="rounded-2xl bg-white dark:bg-surface-light px-5 py-5 sm:px-6 flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-0">
                  <h3 className="font-semibold text-lg truncate text-slate-900 dark:text-white">
                    {stats.continueCourse.title}
                  </h3>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500 dark:text-slate-400">
                    <span className="inline-flex items-center gap-1.5">
                      <ListChecks className="w-4 h-4" aria-hidden="true" />
                      {stats.continueCourse.completedSections}/
                      {stats.continueCourse.totalSections} sections completed
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Clock className="w-4 h-4" aria-hidden="true" />
                      Last opened {formatRelativeTime(stats.continueCourse.lastAccessedAt)}
                    </span>
                  </p>
                  <div className="mt-3 w-full max-w-sm">
                    <ProgressBar
                      percentage={progressPercentage(stats.continueCourse)}
                      label={`${stats.continueCourse.title} progress`}
                    />
                  </div>
                </div>
                <Link
                  to={`/app/course/${stats.continueCourse.id}`}
                  className="glow-btn inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary-dark text-white text-sm font-semibold hover:bg-primary transition-all"
                >
                  Continue
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </Link>
              </div>
            </div>
          </section>
        )}

        <section aria-labelledby="courses-heading">
          <div className="flex items-center justify-between mb-4">
            <h2 id="courses-heading" className="text-lg font-semibold">
              My courses
            </h2>
            {courses.length > 0 && (
              <span className="text-sm text-slate-500 dark:text-slate-400">
                {courses.length} {courses.length === 1 ? 'course' : 'courses'}
              </span>
            )}
          </div>

          {courses.length === 0 ? (
            /* Requirement 7.4 */
            <div className="glass-card rounded-2xl text-center px-6 py-14">
              <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                <BookOpen className="w-7 h-7 text-white" aria-hidden="true" />
              </div>
              <h3 className="text-xl font-semibold mb-2 text-slate-900 dark:text-white">
                No courses yet
              </h3>
              <p className="text-slate-600 dark:text-slate-400 mb-6 max-w-md mx-auto">
                Paste a video link and Clip2Course turns it into sections, quizzes and
                flashcards. Your first course takes a couple of minutes.
              </p>
              <Link
                to="/app/create"
                className="glow-btn pulse-glow inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary-dark text-white font-semibold hover:bg-primary transition-all"
              >
                Create a Course
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </Link>
            </div>
          ) : (
            /* Requirement 7.5: ordered by last accessed descending */
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 list-none p-0 m-0">
              {courses.map((course) => {
                const percentage = progressPercentage(course)
                const complete = percentage === 100
                return (
                  <li
                    key={course.id}
                    className="glass-card rounded-2xl p-5 flex flex-col"
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <h3 className="font-semibold text-lg line-clamp-2 text-slate-900 dark:text-white">
                        {course.title}
                      </h3>
                      {complete && (
                        <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-600 dark:text-emerald-400 text-xs font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                          Done
                        </span>
                      )}
                    </div>

                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                      Created {formatDate(course.createdAt)} · Last opened{' '}
                      {formatRelativeTime(course.lastAccessedAt)}
                    </p>

                    <div className="mb-5">
                      <div className="flex items-center justify-between text-sm mb-1.5">
                        <span className="text-slate-600 dark:text-slate-400">
                          {course.completedSections}/{course.totalSections} sections
                          completed
                        </span>
                        <span className="font-semibold text-slate-700 dark:text-slate-200">
                          {percentage}%
                        </span>
                      </div>
                      <ProgressBar
                        percentage={percentage}
                        label={`${course.title} progress`}
                      />
                    </div>

                    <Link
                      to={`/app/course/${course.id}`}
                      className="mt-auto inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-primary-dark text-white text-sm font-semibold hover:bg-primary transition-colors"
                    >
                      Open
                      <ArrowRight className="w-4 h-4" aria-hidden="true" />
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </main>
    </div>
  )
}

/**
 * One aggregate stat. `dt` and `dd` stay immediate siblings so the pair reads
 * correctly as a description list entry.
 */
function StatCard({
  label,
  value,
  icon: Icon,
  tint,
}: {
  label: string
  value: number | string
  icon: typeof BookOpen
  tint: string
}) {
  return (
    <div className="glass-card rounded-2xl p-5">
      <div
        aria-hidden="true"
        className={`w-9 h-9 mb-3 rounded-lg bg-gradient-to-br ${tint} flex items-center justify-center`}
      >
        <Icon className="w-4.5 h-4.5 text-white" />
      </div>
      <dt className="text-sm text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="text-2xl sm:text-3xl font-bold mt-1 text-slate-900 dark:text-white">
        {value}
      </dd>
    </div>
  )
}

function ProgressBar({ percentage, label }: { percentage: number; label: string }) {
  return (
    <div
      className="w-full h-2 bg-slate-200 dark:bg-surface-lighter rounded-full overflow-hidden"
      role="progressbar"
      aria-valuenow={percentage}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all duration-500"
        style={{ width: `${percentage}%` }}
      />
    </div>
  )
}

/**
 * Rebuild the progress records `computeDashboardStats` consumes from the
 * summaries, since `courseStore` exposes no progress accessor. Section ids are
 * synthetic placeholders: only the completed count matters for completion, and
 * quiz scores are genuinely unavailable here.
 */
function toProgressRecords(courses: CourseSummary[]): CourseProgress[] {
  return courses.map((course) => ({
    courseId: course.id,
    completedSections: Array.from(
      { length: course.completedSections },
      (_, index) => `${course.id}:${index}`
    ),
    quizScores: {},
    lastAccessedAt: course.lastAccessedAt,
  }))
}

function progressPercentage(course: CourseSummary): number {
  if (course.totalSections === 0) return 0
  return Math.round((course.completedSections / course.totalSections) * 100)
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - new Date(date).getTime()
  const minutes = Math.floor(diffMs / 60000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  return formatDate(date)
}
