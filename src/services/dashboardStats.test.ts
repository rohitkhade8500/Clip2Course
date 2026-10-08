import { describe, it, expect } from 'vitest'
import { computeDashboardStats } from './dashboardStats'
import type { CourseProgress, CourseSummary } from '../types/course'

function course(
  id: string,
  overrides: Partial<CourseSummary> = {}
): CourseSummary {
  return {
    id,
    title: `Course ${id}`,
    description: 'desc',
    totalSections: 2,
    completedSections: 0,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    lastAccessedAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  }
}

function progress(
  courseId: string,
  overrides: Partial<CourseProgress> = {}
): CourseProgress {
  return {
    courseId,
    completedSections: [],
    quizScores: {},
    lastAccessedAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  }
}

describe('computeDashboardStats', () => {
  it('returns zeros and no continue target for an empty library', () => {
    expect(computeDashboardStats([], [])).toEqual({
      totalCourses: 0,
      completedCourses: 0,
      questionsAnswered: 0,
      averageScore: 0,
      continueCourse: null,
    })
  })

  it('returns zeros for stats when courses exist but nothing is answered', () => {
    const stats = computeDashboardStats([course('a')], [progress('a')])

    expect(stats.totalCourses).toBe(1)
    expect(stats.completedCourses).toBe(0)
    expect(stats.questionsAnswered).toBe(0)
    expect(stats.averageScore).toBe(0)
    expect(Number.isFinite(stats.averageScore)).toBe(true)
  })

  it('ignores courses with no progress record', () => {
    const stats = computeDashboardStats([course('a'), course('b')], [])

    expect(stats.totalCourses).toBe(2)
    expect(stats.completedCourses).toBe(0)
    expect(stats.questionsAnswered).toBe(0)
    expect(stats.continueCourse?.id).toBe('a')
  })

  it('counts a course complete once its sections are all done', () => {
    const stats = computeDashboardStats(
      [course('a', { totalSections: 2 }), course('b', { totalSections: 3 })],
      [
        progress('a', { completedSections: ['s1', 's2'] }),
        progress('b', { completedSections: ['s1'] }),
      ]
    )

    expect(stats.completedCourses).toBe(1)
    expect(stats.completedCourses).toBeLessThanOrEqual(stats.totalCourses)
    expect(stats.continueCourse?.id).toBe('b')
  })

  it('averages quiz scores across all courses, rounded to two decimals', () => {
    const stats = computeDashboardStats(
      [course('a'), course('b')],
      [
        progress('a', { quizScores: { q1: 100, q2: 50 } }),
        progress('b', { quizScores: { q3: 0 } }),
      ]
    )

    expect(stats.questionsAnswered).toBe(3)
    expect(stats.averageScore).toBe(50)
  })

  it('rounds a repeating average to two decimals', () => {
    const stats = computeDashboardStats(
      [course('a')],
      [progress('a', { quizScores: { q1: 100, q2: 100, q3: 0 } })]
    )

    expect(stats.averageScore).toBe(66.67)
  })

  it('picks the most recently accessed incomplete course', () => {
    const stats = computeDashboardStats(
      [
        course('old', { lastAccessedAt: new Date('2024-01-01T00:00:00Z') }),
        course('recent', { lastAccessedAt: new Date('2024-06-01T00:00:00Z') }),
        course('newest-but-done', {
          lastAccessedAt: new Date('2024-09-01T00:00:00Z'),
          totalSections: 1,
        }),
      ],
      [progress('newest-but-done', { completedSections: ['s1'] })]
    )

    expect(stats.continueCourse?.id).toBe('recent')
  })

  it('returns a null continue target when every course is complete', () => {
    const stats = computeDashboardStats(
      [course('a', { totalSections: 1 }), course('b', { totalSections: 1 })],
      [
        progress('a', { completedSections: ['s1'] }),
        progress('b', { completedSections: ['s1'] }),
      ]
    )

    expect(stats.completedCourses).toBe(2)
    expect(stats.continueCourse).toBeNull()
  })

  it('treats a zero-section course as complete', () => {
    const stats = computeDashboardStats(
      [course('a', { totalSections: 0 })],
      [progress('a')]
    )

    expect(stats.completedCourses).toBe(1)
    expect(stats.continueCourse).toBeNull()
  })

  it('keeps the average finite when a stored score is corrupt', () => {
    const stats = computeDashboardStats(
      [course('a')],
      [progress('a', { quizScores: { q1: Number.NaN, q2: 80, q3: -5 } })]
    )

    expect(stats.questionsAnswered).toBe(1)
    expect(stats.averageScore).toBe(80)
    expect(Number.isFinite(stats.averageScore)).toBe(true)
  })

  it('handles ISO string timestamps when ordering the continue target', () => {
    const stats = computeDashboardStats(
      [
        course('a', {
          lastAccessedAt: '2024-01-01T00:00:00Z' as unknown as Date,
        }),
        course('b', {
          lastAccessedAt: '2024-05-01T00:00:00Z' as unknown as Date,
        }),
      ],
      []
    )

    expect(stats.continueCourse?.id).toBe('b')
  })
})
