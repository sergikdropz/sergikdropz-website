import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="pt-20 min-h-screen bg-black flex items-center justify-center">
      <div className="text-center px-4">
        <h1 className="text-9xl font-bold mb-4">404</h1>
        <h2 className="text-3xl font-semibold mb-4">Page Not Found</h2>
        <p className="text-gray-400 mb-8 max-w-md mx-auto">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Link
          href="/"
          className="inline-block px-8 py-3 bg-white text-black font-semibold rounded hover:bg-gray-200 transition-colors"
        >
          Go Home
        </Link>
      </div>
    </div>
  )
}

