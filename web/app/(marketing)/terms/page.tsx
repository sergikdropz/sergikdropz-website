import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalDocument } from '@/components/legal/LegalDocument'

export const metadata: Metadata = {
  title: 'Terms of Service | SERGIK',
  description:
    'Terms for using the SERGIK Dropz Website, including music, purchases, and the YouTube subscribe unlock.',
  alternates: { canonical: '/terms' },
}

export default function TermsOfServicePage() {
  return (
    <LegalDocument title="Terms of Service" updated="September 27, 2026">
      <p>
        These terms govern use of the SERGIK Dropz Website at{' '}
        <a href="https://sergikdropz.com">https://sergikdropz.com</a>, operated by SERGIK from Phoenix, Arizona, USA.
        Contact: <a href="mailto:sergikdrops@gmail.com">sergikdrops@gmail.com</a>. By using the site you agree to these
        terms and the <Link href="/privacy">Privacy Policy</Link>.
      </p>

      <section>
        <h2>The site</h2>
        <p>
          The site presents SERGIK music, videos, events, and a shop. We may change or remove features, including who
          can watch a visualizer, without notice. Accounts and unlocks may be revoked if they are misused.
        </p>
      </section>

      <section>
        <h2>Music and video</h2>
        <p>
          Recordings, artwork, and page content are owned by SERGIK or used with permission. Listening on the site
          does not transfer any copyright. Do not copy, download, re-upload, or redistribute works except where a
          purchase or embed explicitly allows it. Streaming embeds from YouTube, Spotify, and similar services follow
          those services’ own terms.
        </p>
      </section>

      <section>
        <h2>YouTube subscribe unlock</h2>
        <p>
          Some videos stay locked until Google confirms a subscription to{' '}
          <a href="https://www.youtube.com/@sergikdropz">@sergikdropz</a>. To watch a locked visualizer, sign in with
          your own Google account. The site checks that subscription and creates it when it is missing. The site does
          not edit or delete your videos. You can unsubscribe on YouTube at any time and revoke the app in your
          Google Account.
          YouTube’s terms are at <a href="https://www.youtube.com/t/terms">https://www.youtube.com/t/terms</a>.
        </p>
      </section>

      <section>
        <h2>Purchases and accounts</h2>
        <p>
          Paid downloads, merch, tips, and memberships are processed by Stripe. The price and what you receive are
          shown before you pay. Digital files are licensed for your personal use. Contact us if a file fails to
          deliver. Fan accounts are for you only; keep your password to yourself.
        </p>
      </section>

      <section>
        <h2>Acceptable use</h2>
        <p>
          Do not attack the site, scrape it in a way that degrades service, impersonate SERGIK, or use unlocked media
          to infringe anyone’s rights. We may block access that breaks these terms.
        </p>
      </section>

      <section>
        <h2>Disclaimers and liability</h2>
        <p>
          The site is provided as is. We do not warrant uninterrupted playback, a particular YouTube subscription
          result, or error-free checkout. To the extent the law allows, SERGIK is not liable for indirect or
          consequential damages, or for more than the amount you paid SERGIK for the item that gave rise to the claim
          in the prior twelve months.
        </p>
      </section>

      <section>
        <h2>Law</h2>
        <p>
          These terms are governed by the laws of the State of Arizona, without regard to conflict-of-law rules. Courts
          in Maricopa County, Arizona, are the venue for disputes, except where a law requires otherwise.
        </p>
      </section>
    </LegalDocument>
  )
}
