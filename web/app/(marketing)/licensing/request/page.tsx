import { Suspense } from 'react'
import LicensingRequestForm from './LicensingRequestForm'

export const metadata = {
  title: 'Request a SERGIK license',
  robots: { index: false, follow: false },
}

export default function LicensingRequestPage() {
  return (
    <div className="pt-20 min-h-screen">
      <div className="container mx-auto px-4 py-16 max-w-3xl">
        <h1 className="text-4xl text-white mb-3">Request a license</h1>
        <p className="text-gray-400 mb-8">Submitting this form does not grant permission to use the music. Quotes are private. No prices are listed here.</p>
        <Suspense fallback={<p className="text-gray-400">Loading the form…</p>}>
          <LicensingRequestForm />
        </Suspense>
      </div>
    </div>
  )
}
