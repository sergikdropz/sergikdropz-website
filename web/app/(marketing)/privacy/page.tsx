import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalDocument } from '@/components/legal/LegalDocument'

export const metadata: Metadata = {
  title: 'Privacy Policy | SERGIK',
  description:
    'How SERGIK Dropz Website collects, uses, and shares information, including Google and YouTube account data used to unlock videos.',
  alternates: { canonical: '/privacy' },
}

export default function PrivacyPolicyPage() {
  return (
    <LegalDocument title="Privacy Policy" updated="September 27, 2026">
      <p>
        This policy describes how SERGIK (“we”), operating the SERGIK Dropz Website at{' '}
        <a href="https://sergikdropz.com">https://sergikdropz.com</a>, handles information when you visit the site,
        buy music or merch, join the contact list, or sign in with Google to unlock a video. Contact:{' '}
        <a href="mailto:sergikdrops@gmail.com">sergikdrops@gmail.com</a>. Phoenix, Arizona, USA.
      </p>

      <section>
        <h2>Information we collect</h2>
        <ul>
          <li>
            <strong className="font-medium text-white">You provide it.</strong> Name, email, phone, and booking
            details if you send a message or booking request. Email and a display name if you create a fan account or
            join the contact list.
          </li>
          <li>
            <strong className="font-medium text-white">Purchases.</strong> Checkout is handled by Stripe. We receive
            order status, the email used at checkout, and what was bought. Card numbers are processed by Stripe, not
            stored on this site.
          </li>
          <li>
            <strong className="font-medium text-white">Google sign-in for video unlock.</strong> If you choose Sign in
            with Google on a visualizer, Google shares an access token for that session and, when available, your
            verified Google account email. We use the token only to ask YouTube whether you subscribe to{' '}
            <a href="https://www.youtube.com/@sergikdropz">@sergikdropz</a> and, if you do not, to subscribe you to that
            channel. We do not edit your channel, delete videos, or read your watch history, playlists, comments, or
            other channel subscriptions. We do not store the access token.
          </li>
          <li>
            <strong className="font-medium text-white">Site use.</strong> If you accept analytics cookies, Google
            Analytics may receive pages you view and similar device data. If you decline, we do not load that
            measurement. A short-lived cookie remembers the unlock and the sign-in security check. Ordinary hosting
            logs may include IP address and browser type.
          </li>
        </ul>
      </section>

      <section>
        <h2>How we use Google user data</h2>
        <p>
          The YouTube scope we request is <code className="text-gray-200">youtube</code>. We use it for one
          purpose: confirm or create your subscription to the SERGIK channel so a video can play on this site. If
          Google returns your email, we save that address in our fan list, tagged as a YouTube unlock, so we can send
          release and promo mail. You can unsubscribe from any message.
        </p>
        <p className="mt-4">
          SERGIK Dropz Website’s use and transfer to any other app of information received from Google APIs will
          adhere to the{' '}
          <a href="https://developers.google.com/terms/api-services-user-data-policy">
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements.
        </p>
        <p className="mt-4">
          This site uses YouTube API Services. Google’s own privacy policy is at{' '}
          <a href="https://policies.google.com/privacy">https://policies.google.com/privacy</a>. YouTube’s terms are at{' '}
          <a href="https://www.youtube.com/t/terms">https://www.youtube.com/t/terms</a>. You can review and revoke this
          app’s access in your{' '}
          <a href="https://myaccount.google.com/permissions">Google Account permissions</a>.
        </p>
      </section>

      <section>
        <h2>Sharing</h2>
        <p>
          We do not sell personal information and we do not use Google user data for advertising or to train
          generalized models. We share data only with processors that run the site: Supabase (database and accounts),
          Vercel (hosting), Stripe (payments), Google (YouTube sign-in and, if you accept cookies, Analytics), and
          email delivery used for the contact list. We may disclose information if the law requires it.
        </p>
      </section>

      <section>
        <h2>How long we keep it</h2>
        <ul>
          <li>The Google access token is used during the unlock request and then discarded.</li>
          <li>The unlock cookie lasts about 30 days. The sign-in security cookie lasts about 10 minutes.</li>
          <li>
            Emails on the fan list stay until you unsubscribe or ask us to delete them. Purchase records stay as long
            as we need them for orders, taxes, and fraud prevention.
          </li>
        </ul>
      </section>

      <section>
        <h2>Your choices</h2>
        <p>
          Decline analytics cookies in the banner. Unsubscribe from mail with the link in a message, or email{' '}
          <a href="mailto:sergikdrops@gmail.com">sergikdrops@gmail.com</a> to access, correct, or delete the personal
          information we hold about you. Revoking Google access stops future unlocks that depend on YouTube; it does
          not by itself remove an email already saved to the fan list — ask us and we will delete it.
        </p>
      </section>

      <section>
        <h2>Children</h2>
        <p>This site is not directed at children under 13, and we do not knowingly collect their personal information.</p>
      </section>

      <section>
        <h2>Changes</h2>
        <p>
          We will update the date at the top of this page when the policy changes. Use of Google and YouTube features
          is also covered by our <Link href="/terms">Terms of Service</Link>.
        </p>
      </section>
    </LegalDocument>
  )
}
