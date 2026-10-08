/**
 * A single course at `/app/course/:id`.
 *
 * Reads and progress writes are scoped to the signed-in user's id. A course
 * owned by someone else comes back as null and renders as not-found, which is
 * exactly how a nonexistent id renders (Requirement 8.3), and progress is
 * recorded against this user only (Requirement 8.6). With no user id the store
 * would operate on the shared pre-auth bucket, so that case is treated as
 * not-found rather than silently reading it.
 */

import { useState, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  FileQuestion,
  LayoutDashboard,
  Sparkles,
  Video,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { getCourse, updateProgress } from '../services/courseStore'
import CourseSection from '../components/CourseSection'
import type { CourseData } from '../types/course'

export default function CourseViewer() {
  const { id } = useParams<{ id: string }>()
  const { status, user } = useAuth()
  const userId = user?.id
  const [course, setCourse] = useState<CourseData | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [completedSections, setCompletedSections] = useState<Set<string>>(new Set())
  const [, setQuizScores] = useState<Record<string, number>>({})

  useEffect(() => {
    let cancelled = false

    async function loadCourse() {
      // Nothing can be read until it is known who is asking, and the loading
      // state already covers that window (Requirement 6.7).
      if (status === 'checking') return

      setLoading(true)
      setNotFound(false)

      if (!id || !userId) {
        setNotFound(true)
        setLoading(false)
        return
      }

      try {
        const data = await getCourse(id, userId)
        if (cancelled) return
        if (!data) {
          setNotFound(true)
        } else {
          setCourse(data)
        }
      } catch {
        if (!cancelled) setNotFound(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadCourse()

    return () => {
      cancelled = true
    }
  }, [id, userId, status])

  const handleSectionComplete = useCallback(
    async (sectionId: string) => {
      if (!id || !userId) return

      setCompletedSections((prev) => {
        const next = new Set(prev)
        next.add(sectionId)
        return next
      })

      await updateProgress(id, { completedSections: [sectionId] }, userId)
    },
    [id, userId]
  )

  const handleQuizScore = useCallback(
    async (quizId: string, score: number) => {
      if (!id || !userId) return

      setQuizScores((prev) => ({ ...prev, [quizId]: score }))

      await updateProgress(id, { quizScores: { [quizId]: score } }, userId)
    },
    [id, userId]
  )

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-surface">
        <div className="animate-spin h-10 w-10 border-4 border-primary border-t-transparent rounded-full" />
        <p className="mt-4 text-slate-600 dark:text-slate-400">Loading course…</p>
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden bg-slate-50 dark:bg-surface text-slate-800 dark:text-slate-200 p-8">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 hero-grid" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="orb orb-3" />
        </div>
        <div className="relative z-10 glass-card rounded-2xl text-center max-w-md px-8 py-12">
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
            <FileQuestion className="w-7 h-7 text-white" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-bold mb-2 text-slate-900 dark:text-white">
            Course not found
          </h1>
          <p className="text-slate-600 dark:text-slate-400 mb-6">
            The course you're looking for doesn't exist or may have been deleted.
          </p>
          <Link
            to="/app/courses"
            className="glow-btn inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary-dark text-white font-semibold hover:bg-primary transition-all"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            Back to My Courses
          </Link>
        </div>
      </div>
    )
  }

  if (!course) return null

  const totalSections = course.sections.length
  const completedCount = completedSections.size
  const progressPercent = totalSections > 0 ? (completedCount / totalSections) * 100 : 0

  // Estimated time remaining based on incomplete sections
  const remainingSections = totalSections - completedCount
  const remainingQuestions = course.sections
    .filter((s) => !completedSections.has(s.id))
    .reduce((sum, s) => sum + s.quizzes.length, 0)
  const estimatedMinutesRemaining = (remainingQuestions * 1.5) + (remainingSections * 2)
  const allDone = completedCount === totalSections && totalSections > 0

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-50 dark:bg-surface text-slate-800 dark:text-slate-200">
      {/* Ambient backdrop, shared with the landing page */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 hero-grid" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="orb orb-1" />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-20 bg-white/75 dark:bg-surface/80 backdrop-blur-xl border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link
            to="/app/courses"
            className="shrink-0 p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-surface-light transition-colors"
            aria-label="Back to my courses"
          >
            <ArrowLeft className="w-5 h-5" aria-hidden="true" />
          </Link>

          <div className="min-w-0 flex-1">
            <p className="hidden sm:flex items-center gap-1.5 text-xs font-medium text-primary-light">
              <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
              Clip2Course
            </p>
            <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white truncate">
              {course.title}
            </h1>
          </div>

          <div className="shrink-0 flex items-center gap-2">
            <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs font-medium text-primary-light">
              {completedCount}/{totalSections} sections
            </span>
            <Link
              to="/app/dashboard"
              className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-surface-light transition-colors"
              aria-label="Dashboard"
            >
              <LayoutDashboard className="w-5 h-5" aria-hidden="true" />
            </Link>
          </div>
        </div>

        {/* Hairline progress under the sticky bar, so position is always visible */}
        <div className="h-0.5 bg-slate-200/60 dark:bg-surface-lighter/60">
          <div
            className="h-full bg-gradient-to-r from-primary to-accent transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </header>

      {/* Course content */}
      <main className="relative z-10 max-w-4xl mx-auto px-4 py-8">
        {/* Course overview */}
        <div className="glass-card rounded-2xl p-6 mb-8 fade-in-up">
          <p className="text-slate-600 dark:text-slate-300 leading-relaxed mb-4">
            {course.description}
          </p>

          {/* Video metadata */}
          <div className="flex flex-wrap gap-2 mb-5">
            <Chip icon={Video}>{course.videoMetadata.source}</Chip>
            {course.videoMetadata.duration > 0 && (
              <Chip icon={Clock}>{formatDuration(course.videoMetadata.duration)}</Chip>
            )}
            <Chip icon={FileQuestion}>{course.totalQuestions} questions</Chip>
          </div>

          {/* Overall progress */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-700/70 bg-slate-50/70 dark:bg-surface/50 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Progress
              </span>
              <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                {Math.round(progressPercent)}%
              </span>
            </div>
            <div
              className="h-2 bg-slate-200 dark:bg-surface-lighter rounded-full overflow-hidden"
              role="progressbar"
              aria-valuenow={Math.round(progressPercent)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Course progress"
            >
              <div
                className="h-full bg-gradient-to-r from-primary to-accent rounded-full transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            {estimatedMinutesRemaining > 0 && !allDone && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                <Clock className="w-3.5 h-3.5" aria-hidden="true" />~
                {Math.round(estimatedMinutesRemaining)} min remaining
              </p>
            )}
            {allDone && (
              <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                Course completed!
              </p>
            )}
          </div>
        </div>

        {/* Sections */}
        <div className="flex flex-col gap-6">
          {course.sections.map((section, index) => (
            <CourseSection
              key={section.id}
              section={section}
              index={index}
              onSectionComplete={handleSectionComplete}
              onQuizScore={handleQuizScore}
            />
          ))}
        </div>
      </main>
    </div>
  )
}

/** Small metadata pill used for source, duration and question count. */
function Chip({
  icon: Icon,
  children,
}: {
  icon: typeof Clock
  children: React.ReactNode
}) {
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 dark:bg-surface-light border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 capitalize">
      <Icon className="w-3.5 h-3.5 text-primary-light" aria-hidden="true" />
      {children}
    </span>
  )
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)

  if (h > 0) {
    return `${h}h ${m}m`
  }
  if (m > 0) {
    return `${m}m ${s}s`
  }
  return `${s}s`
}
