/**
 * Dashboard behaviour against real storage (Requirements 7.1-7.5, 7.7).
 *
 * Courses are seeded through the actual courseStore on fake-indexeddb and the
 * real AuthProvider is used, so only the network boundary is stubbed. That
 * keeps ownership scoping, ordering and the stats calculation honest.
 */

import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from '../context/AuthContext'
import { _resetDB, saveCourse, updateProgress } from '../services/courseStore'
import type { CourseData } from '../types/course'
import UserDashboard from './UserDashboard'

const USER = { id: 'user-1', email: 'ada@example.com', displayName: 'Ada Lovelace' }

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** Signed in for /auth/me, and a plain success for anything else (logout, csrf). */
function stubAuthFetch() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString()
    if (url.includes('/auth/me')) return jsonResponse({ user: USER })
    return jsonResponse({})
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function makeCourse(id: string, title: string, sectionCount: number): CourseData {
  return {
    id,
    title,
    description: `${title} description`,
    videoMetadata: { title, duration: 600, source: 'youtube' },
    sections: Array.from({ length: sectionCount }, (_, index) => ({
      id: `${id}-s${index}`,
      title: `Section ${index + 1}`,
      summary: 'Summary',
      startTime: index * 60,
      endTime: (index + 1) * 60,
      quizzes: [],
      flashcards: [],
      puzzles: [],
    })),
    totalQuestions: 0,
    estimatedTime: 5,
    createdAt: new Date('2024-01-01'),
  }
}

/** Real delay so seeded lastAccessedAt timestamps are strictly increasing. */
const tick = () => new Promise((resolve) => setTimeout(resolve, 5))

function renderDashboard() {
  return render(
    <MemoryRouter initialEntries={['/app/dashboard']}>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<div data-testid="landing">landing</div>} />
          <Route path="/app/dashboard" element={<UserDashboard />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  )
}

beforeEach(() => {
  _resetDB()
  indexedDB = new IDBFactory()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('UserDashboard', () => {
  it('shows the signed-in display name and email', async () => {
    stubAuthFetch()

    renderDashboard()

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Ada Lovelace' })
    ).toBeInTheDocument()
    expect(screen.getByText('ada@example.com')).toBeInTheDocument()
  })

  it('displays zeros for every stat when the library is empty', async () => {
    stubAuthFetch()

    renderDashboard()

    const stats = await screen.findByRole('heading', { name: 'Your learning at a glance' })
    expect(stats).toBeInTheDocument()

    expect(screen.getByText('Total courses').nextSibling).toHaveTextContent('0')
    expect(screen.getByText('Courses completed').nextSibling).toHaveTextContent('0')
    expect(screen.getByText('Questions answered').nextSibling).toHaveTextContent('0')
    expect(screen.getByText('Average score').nextSibling).toHaveTextContent('0%')
  })

  it('shows an empty state linking to /app/create when there are no courses', async () => {
    stubAuthFetch()

    renderDashboard()

    expect(await screen.findByText('No courses yet')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: 'Create a Course' })
    expect(link).toHaveAttribute('href', '/app/create')
  })

  it('lists the user\u2019s courses ordered by last accessed descending', async () => {
    await saveCourse(makeCourse('c1', 'Oldest course', 2), USER.id)
    await tick()
    await saveCourse(makeCourse('c2', 'Middle course', 2), USER.id)
    await tick()
    await saveCourse(makeCourse('c3', 'Newest course', 2), USER.id)

    stubAuthFetch()
    renderDashboard()

    const list = await screen.findByRole('list')
    const titles = within(list)
      .getAllByRole('heading', { level: 3 })
      .map((heading) => heading.textContent)

    expect(titles).toEqual(['Newest course', 'Middle course', 'Oldest course'])
  })

  it('never lists another user\u2019s courses', async () => {
    await saveCourse(makeCourse('mine', 'My course', 1), USER.id)
    await saveCourse(makeCourse('theirs', 'Their course', 1), 'user-2')

    stubAuthFetch()
    renderDashboard()

    const list = await screen.findByRole('list')
    expect(within(list).getByText('My course')).toBeInTheDocument()
    expect(within(list).queryByText('Their course')).not.toBeInTheDocument()
    expect(screen.getByText('Total courses').nextSibling).toHaveTextContent('1')
  })

  it('offers a continue-learning entry for the most recent incomplete course', async () => {
    // Complete: both sections done, so it must not be the continue target
    await saveCourse(makeCourse('done', 'Finished course', 2), USER.id)
    await updateProgress(
      'done',
      { completedSections: ['done-s0', 'done-s1'] },
      USER.id
    )
    await tick()
    await saveCourse(makeCourse('open', 'Unfinished course', 3), USER.id)
    await updateProgress('open', { completedSections: ['open-s0'] }, USER.id)

    stubAuthFetch()
    renderDashboard()

    const heading = await screen.findByRole('heading', { name: 'Continue learning' })
    const card = heading.parentElement as HTMLElement

    expect(within(card).getByText('Unfinished course')).toBeInTheDocument()
    expect(within(card).getByRole('link', { name: 'Continue' })).toHaveAttribute(
      'href',
      '/app/course/open'
    )
    expect(screen.getByText('Total courses').nextSibling).toHaveTextContent('2')
    expect(screen.getByText('Courses completed').nextSibling).toHaveTextContent('1')
  })

  it('provides navigation to create, view all courses, and log out', async () => {
    stubAuthFetch()

    renderDashboard()

    const nav = await screen.findByRole('navigation', { name: 'Dashboard' })
    expect(within(nav).getByRole('link', { name: 'New Course' })).toHaveAttribute(
      'href',
      '/app/create'
    )
    expect(within(nav).getByRole('link', { name: 'All Courses' })).toHaveAttribute(
      'href',
      '/app/courses'
    )
    expect(within(nav).getByRole('button', { name: 'Log out' })).toBeInTheDocument()
  })

  it('logs the user out and returns to the landing page', async () => {
    const fetchMock = stubAuthFetch()

    renderDashboard()

    const logout = await screen.findByRole('button', { name: 'Log out' })
    fireEvent.click(logout)

    await waitFor(() => expect(screen.getByTestId('landing')).toBeInTheDocument())

    const calledLogout = fetchMock.mock.calls.some(([input]) =>
      String(input).includes('/auth/logout')
    )
    expect(calledLogout).toBe(true)
  })
})
