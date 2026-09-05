import Link from 'next/link'

export default function FanHubPage() {
  return (
    <div className="min-h-[70vh] pt-24 pb-16 px-4">
      <div className="max-w-2xl mx-auto">
        <p className="text-sm text-emerald-400 font-medium mb-2">$0 forever</p>
        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-4">Free fan membership</h1>
        <p className="text-gray-300 text-lg leading-relaxed mb-8">
          Email and password for your account—required to purchase and download from the shop. You can still use email
          links to sign in for listening; magic-link-only users add a password before checkout. No credit card for this
          tier.
        </p>

        <ul className="space-y-4 mb-10 text-gray-200">
          <li className="flex gap-3">
            <span className="text-emerald-400 shrink-0 select-none w-5" aria-hidden>
              {'\u2713'}
            </span>
            <span>
              <strong className="text-white">Listen</strong> in the music library / vault with your session.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="text-emerald-400 shrink-0 select-none w-5" aria-hidden>
              {'\u2713'}
            </span>
            <span>
              <strong className="text-white">Playlist curation</strong>—create, edit, and sync personal playlists
              across visits.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="text-emerald-400 shrink-0 select-none w-5" aria-hidden>
              {'\u2713'}
            </span>
            <span>
              <strong className="text-white">Purchases</strong>—checkout with your password account links orders for
              downloads and history.
            </span>
          </li>
        </ul>

        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <Link
            href="/fan/register?next=%2Fmusic-library"
            className="inline-flex justify-center px-6 py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-center transition-colors"
          >
            Create free account
          </Link>
          <Link
            href="/fan/login?next=%2Ffan%2Faccount"
            className="inline-flex justify-center px-6 py-3 rounded-lg border border-gray-600 text-gray-200 hover:bg-gray-800/60 font-medium text-center transition-colors"
          >
            Sign in
          </Link>
        </div>

        <p className="mt-10 text-sm text-gray-400">
          Want early drops and extra perks?{' '}
          <Link href="/shop/membership" className="text-purple-300 hover:text-purple-200">
            View paid fan plans
          </Link>{' '}
          (optional).
        </p>
      </div>
    </div>
  )
}
