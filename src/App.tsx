import { Routes, Route } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import LandingPage from './pages/LandingPage'
import Login from './pages/Login'
import Register from './pages/Register'
import UserDashboard from './pages/UserDashboard'
import CreateCourse from './pages/CreateCourse'
import CourseViewer from './pages/CourseViewer'
import Dashboard from './pages/Dashboard'
import NotFound from './pages/NotFound'

/**
 * Route table (design.md, "Example 2: protecting routes").
 *
 * `/`, `/login` and `/register` stay reachable without a session
 * (Requirements 6.1, 6.6). Everything under `/app` sits inside a single
 * pathless `ProtectedRoute` route, so the guard is applied once rather than
 * repeated per page — one less place for a new protected page to be forgotten
 * (Requirement 6.5).
 *
 * Login and Register handle the already-signed-in redirect themselves
 * (Requirement 6.4), since each also owns the "where should this user land"
 * decision from its own location state.
 */
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      <Route element={<ProtectedRoute />}>
        <Route path="/app/dashboard" element={<UserDashboard />} />
        <Route path="/app/create" element={<CreateCourse />} />
        <Route path="/app/courses" element={<Dashboard />} />
        <Route path="/app/course/:id" element={<CourseViewer />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
