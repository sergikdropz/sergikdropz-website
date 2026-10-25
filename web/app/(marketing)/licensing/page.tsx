import Link from 'next/link'
import { LICENSING_LICENSOR } from '@/lib/licensing/identity'

export const metadata = {
  title: 'License original music by SERGIK',
  description: 'Original music for films, advertising, brands, digital content, and creative projects.',
}

const STEPS = [
  'Discover music',
  'Select usage rights',
  'Submit project details',
  'Review the agreement and pay',
  'Receive the license and assets',
]

const CATEGORIES = [
  ['Social media', 'Short-form posts once a quote is accepted and paid.'],
  ['YouTube', 'A video on a named channel. Content ID stays with SERGIK unless the agreement says otherwise.'],
  ['Advertising', 'A named brand campaign. Exclusive use is quoted by hand.'],
  ['Film and television', 'Picture lock, territory, and term are part of the quote.'],
  ['Games', 'A named title and platforms.'],
  ['Podcasts', 'An episode or a series, for the term on the quote.'],
  ['Corporate', 'An internal or public company presentation.'],
  ['Exhibitions', 'A named installation and its run of show.'],
  ['Live events', 'A named date and venue.'],
  ['Custom production', 'New music written for the project. Ownership stays with the licensor unless a later agreement says otherwise.'],
]

export default function LicensingPage({
  searchParams,
}: {
  searchParams?: { confirmed?: string; inquiry?: string }
}) {
  const confirmed = searchParams?.confirmed
  return (
    <div className="pt-20 min-h-screen relative">
      <div className="container mx-auto px-4 py-16 relative z-10 max-w-5xl">
        <p className="text-sm uppercase tracking-[0.2em] text-gray-400 mb-3">{LICENSING_LICENSOR.tradeName}</p>
        <h1 className="text-4xl md:text-6xl font-semibold text-white mb-4">License original music by SERGIK</h1>
        <p className="text-xl text-gray-300 max-w-3xl mb-8">
          Original music for films, advertising, brands, digital content, and creative projects.
        </p>
        {confirmed === '1' && (
          <p className="mb-6 rounded-lg border border-emerald-700 bg-emerald-950/40 px-4 py-3 text-emerald-100">
            Email confirmed{searchParams?.inquiry ? ` for ${searchParams.inquiry}` : ''}. This still does not grant permission to use the music.
          </p>
        )}
        {confirmed === '0' && (
          <p className="mb-6 rounded-lg border border-amber-700 bg-amber-950/40 px-4 py-3 text-amber-100">
            That confirmation link could not be used. Open the newest email from licensing@sergikdropz.com.
          </p>
        )}
        <div className="flex flex-wrap gap-3 mb-14">
          <Link href="/licensing/request" className="rounded-full bg-white text-black px-5 py-2.5 font-medium">
            Request a license
          </Link>
          <Link href="/licensing/request?kind=custom_production" className="rounded-full border border-white/30 px-5 py-2.5 text-white">
            Request custom music
          </Link>
          <a href="#how" className="rounded-full border border-white/30 px-5 py-2.5 text-white">
            How licensing works
          </a>
        </div>
        <p className="text-gray-400 mb-10 max-w-3xl">
          The public catalog is closed. Start from a track in the music vault, or describe the project here. Fees are quoted per project. Nothing on this page is a price list.
        </p>
        <div className="grid sm:grid-cols-2 gap-4 mb-16">
          {CATEGORIES.map(([title, copy]) => (
            <div key={title} className="rounded-xl border border-white/10 bg-gray-900/50 p-5">
              <h2 className="text-lg text-white mb-2">{title}</h2>
              <p className="text-gray-400 text-sm">{copy}</p>
            </div>
          ))}
        </div>
        <section id="how">
          <h2 className="text-2xl text-white mb-4">How licensing works</h2>
          <ol className="space-y-3 text-gray-300">
            {STEPS.map((step, index) => (
              <li key={step} className="flex gap-3">
                <span className="text-gray-500">{index + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          <p className="mt-6 text-gray-400">
            Submitting an inquiry does not grant permission to use the music. A license starts only after the agreement is in force and Stripe confirms the quoted payment.
          </p>
        </section>
      </div>
    </div>
  )
}
