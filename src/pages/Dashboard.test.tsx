/**
 * Ownership scoping for the courses list at `/app/courses`
 * (Requirements 8.2, 8.4).
 *
 * Courses are seeded through the real courseStore on fake-indexeddb and the
 * real AuthProvider is used, so only the network boundary is stubbed. That is
 * what makes the isolation claim meaningful: nothing in the test filters by
 * owner, so if the page dropped the user id the assertions would fail.
 */

import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AuthProvider } from '../context/AuthContext'
import { _resetDB, saveCourse } from '../services/courseStore'
import type { CourseData } from '../types/course'
import Dashboard from './Dashboard'

const USER_A = { id: 'user-a', email: 'ada@example.com', displayName: 'Ada' }
const USER_B = { id: 'user-b', email: 'bob@example.com', displayName: 'Bob' }

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** Signs the given user in for `/auth/me`; anything else succeeds emptily. */
function stubSignedInAs(user: typeof USER_A) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.includes('/auth/me')) return jsonResponse({ user })
      return jsonResponse({})
    })
  )
}

function makeCourse(id: string, title: string): CourseData {
  return {
    id,
    title,
    description: `${title} description`,
    videoMetadata: { title, duration: 600, source: 'youtube' },
    sections: [
      {
        id: `${id}-s0`,
        title: 'Section 1',
        summary: 'Summary',
        startTime: 0,
        endTime: 60,
        quizzes: [],
        flashcards: [],
        puzzles: [],
      },
    ],
    totalQuestions: 0,
    estimatedTime: 5,
    createdAt: new Date('2024-01-01'),
  }
}

function renderList() {
  return render(
    <MemoryRouter initialEntries={['/app/courses']}>
      <AuthProvider>
        <Dashboard />
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

describe('Dashboard course list ownership', () => {
  it('lists only the signed-in user\u2019s courses', async () => {
    await saveCourse(makeCourse('mine', 'Ada course'), USER_A.id)
    await saveCourse(makeCourse('theirs', 'Bob course'), USER_B.id)

    stubSignedInAs(USER_A)
    renderList()

    expect(await screen.findByText('Ada course')).toBeInTheDocument()
    expect(screen.queryByText('Bob course')).not.toBeInTheDocument()
  })

  it('shows none of the previous user\u2019s courses after another user signs in', async () => {
    await saveCourse(makeCourse('mine', 'Ada course'), USER_A.id)

    stubSignedInAs(USER_A)
    const first = renderList()
    expect(await screen.findByText('Ada course')).toBeInTheDocument()

    // Log out and sign in as someone else: same browser, same database.
    first.unmount()
    vi.unstubAllGlobals()
    stubSignedInAs(USER_B)
    renderList()

    expect(await screen.findByText('No courses yet')).toBeInTheDocument()
    expect(screen.queryByText('Ada course')).not.toBeInTheDocument()
  })

  it('renders the owner\u2019s own courses in the grid with progress', async () => {
    await saveCourse(makeCourse('mine', 'Ada course'), USER_A.id)

    stubSignedInAs(USER_A)
    renderList()

    const card = (await screen.findByText('Ada course')).closest('div') as HTMLElement
    expect(within(card).getByText('0/1 sections completed')).toBeInTheDocument()
  })
})
