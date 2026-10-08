import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 p-8">
      <h1 className="text-4xl font-bold mb-4">404</h1>
      <p className="text-lg text-slate-600 dark:text-slate-400 mb-6">
        Page not found. The page you're looking for doesn't exist.
      </p>
      <Link to="/" className="text-blue-600 dark:text-blue-400 hover:underline">
        Go back to home
      </Link>
    </div>
  )
}
