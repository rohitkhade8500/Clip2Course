/**
 * Dashboard statistics.
 *
 * Pure aggregation over the signed-in user's courses and progress records.
 * Both inputs are assumed to be pre-scoped to that user (Requirement 8.2), so
 * this module performs no ownership filtering of its own.
 *
 * Requirements: 7.2 (aggregate stats), 7.3 (continue-learning target),
 * 7.6 (zero rather than NaN or blank when a stat cannot be computed).
 */

import type { CourseProgress, CourseSummary } from '../types/course'

export interface DashboardStats {
  /** Number of courses in the user's library. */
  totalCourses: number
  /** Courses whose completed section count covers every section. */
  completedCourses: number
  /** Total number of recorded quiz scores across all courses. */
  questionsAnswered: number
  /** Mean recorded quiz score, rounded to two decimals; 0 when none recorded. */
  averageScore: number
  /** Most recently accessed incomplete course, or null when none exists. */
  continueCourse: CourseSummary | null
}

const EMPTY_STATS: DashboardStats = {
  totalCourses: 0,
  completedCourses: 0,
  questionsAnswered: 0,
  averageScore: 0,
  continueCourse: null,
}

/** A course counts as complete once its completed sections cover every section. */
function isComplete(
  course: CourseSummary,
  progress: CourseProgress | undefined
): boolean {
  if (!progress) return false
  return progress.completedSections.length >= course.totalSections
}

/**
 * Milliseconds since the epoch for a Date, ISO string, or anything else stored
 * in `lastAccessedAt`. Unparseable values sort last rather than poisoning the
 * comparison with NaN.
 */
function accessedAt(course: CourseSummary): number {
  const ms = new Date(course.lastAccessedAt).getTime()
  return Number.isFinite(ms) ? ms : Number.NEGATIVE_INFINITY
}

/**
 * Aggregate a user's library into the four dashboard stats plus the
 * continue-learning target.
 *
 * Preconditions: `courses` and `progress` contain only the signed-in user's
 * records.
 *
 * Postconditions:
 * - every returned number is finite and >= 0
 * - `completedCourses <= totalCourses`
 * - `continueCourse` is null exactly when no incomplete course exists
 */
export function computeDashboardStats(
  courses: CourseSummary[],
  progress: CourseProgress[]
): DashboardStats {
  // Requirement 7.6: an empty library yields zeros, never NaN
  if (courses.length === 0) {
    return { ...EMPTY_STATS }
  }

  const progressById = new Map<string, CourseProgress>(
    progress.map((p) => [p.courseId, p])
  )

  let completedCourses = 0
  let questionsAnswered = 0
  let scoreSum = 0

  for (const course of courses) {
    const p = progressById.get(course.id)
    if (!p) continue

    if (isComplete(course, p)) {
      completedCourses++
    }

    // Only well-formed scores contribute, so a corrupt record cannot make the
    // average non-finite or negative.
    const scores = Object.values(p.quizScores ?? {}).filter(
      (score) => typeof score === 'number' && Number.isFinite(score) && score >= 0
    )
    questionsAnswered += scores.length
    scoreSum += scores.reduce((a, b) => a + b, 0)
  }

  const incomplete = courses
    .filter((c) => !isComplete(c, progressById.get(c.id)))
    .sort((a, b) => accessedAt(b) - accessedAt(a))

  return {
    totalCourses: courses.length,
    completedCourses,
    questionsAnswered,
    // Guarded division — the empty library is handled above, this protects the
    // case where courses exist but no question has been answered yet.
    averageScore:
      questionsAnswered === 0
        ? 0
        : Math.round((scoreSum / questionsAnswered) * 100) / 100,
    continueCourse: incomplete[0] ?? null,
  }
}
