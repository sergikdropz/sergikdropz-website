'use client'

import artistData from '@/data/artist.json'
import releasesData from '@/data/releases.json'
import eventsData from '@/data/events.json'
import venuesData from '@/data/venues.json'
import socialProofData from '@/data/social-proof.json'
import SocialLinks from '@/components/SocialLinks'
import VenueCard from '@/components/VenueCard'

export default function EPK() {
  return (
    <div className="pt-20 min-h-screen relative">
      <div className="container mx-auto px-4 py-16 relative z-10">
        <div className="max-w-4xl mx-auto">
          <h1 className="font-six-caps text-center mb-12" style={{ fontSize: '70px', letterSpacing: '6.2px' }}>Electronic Press Kit</h1>
          
          {/* Contact */}
          <section className="mb-12 bg-gray-900/40 p-8 rounded-lg">
            <h2 className="text-3xl font-semibold mb-6">Contact</h2>
            <p className="text-lg">
              <strong>Email:</strong>{' '}
              <a
                href={`mailto:${artistData.contact.email}`}
                className="text-white hover:underline"
              >
                {artistData.contact.email}
              </a>
            </p>
            <div className="mt-4">
              <SocialLinks />
            </div>
          </section>

          {/* Bio */}
          <section className="mb-12">
            <h2 className="text-3xl font-semibold mb-6">Biography</h2>
            <p className="text-lg text-gray-300 leading-relaxed">
              {artistData.bio.long}
            </p>
          </section>

          {/* Music */}
          <section className="mb-12">
            <h2 className="text-3xl font-semibold mb-6">Releases</h2>
            <div className="space-y-4">
              {releasesData.releases.map((release) => (
                <div
                  key={release.id}
                  className="bg-gray-900/40 p-4 rounded-lg"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-xl font-semibold">{release.title}</h3>
                      <p className="text-gray-400">
                        {release.type} • {release.year}
                      </p>
                    </div>
                    <span className="text-sm text-gray-500">
                      {release.platforms.join(', ')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Performance History */}
          <section className="mb-12">
            <h2 className="text-3xl font-semibold mb-6">Performance History</h2>
            
            {/* Festivals */}
            <div className="mb-12">
              <h3 className="text-2xl font-semibold mb-6">Festivals</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {eventsData.festivals.map((festival) => (
                  <div
                    key={festival.id}
                    className="bg-gray-900/40 p-6 rounded-lg hover:bg-gray-800/40 transition-colors"
                  >
                    <h4 className="text-xl font-semibold mb-2">{festival.name}</h4>
                    <p className="text-gray-400">{festival.location}</p>
                    {festival.year && (
                      <p className="text-gray-500 text-sm mt-2">{festival.year}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Venues */}
            <div>
              <h3 className="text-2xl font-semibold mb-6">Notable Venues</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {venuesData.venues.map((venue) => (
                  <VenueCard key={venue.id} venue={venue} />
                ))}
              </div>
            </div>
          </section>

          {/* Social Proof */}
          <section className="mb-12">
            <h2 className="text-3xl font-semibold mb-6">Shared Billing</h2>
            <div className="flex flex-wrap gap-3">
              {socialProofData.shared_billing.map((artist) => (
                <span
                  key={artist}
                  className="px-4 py-2 bg-white text-black rounded-full text-sm font-medium"
                >
                  {artist}
                </span>
              ))}
            </div>
          </section>

          {/* Download Section */}
          <section className="bg-gray-900/40 p-8 rounded-lg text-center">
            <h2 className="text-2xl font-semibold mb-4">Press Assets</h2>
            <p className="text-gray-400 mb-6">
              Download the complete press kit or request high-resolution images and additional materials.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a
                href="/api/epk-download"
                download="SERGIK-Press-Kit.html"
                className="px-8 py-3 bg-white text-black font-semibold rounded hover:bg-gray-200 transition-colors inline-flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Download Press Kit
              </a>
              <button
                onClick={() => window.print()}
                className="px-8 py-3 bg-white text-black font-semibold rounded hover:bg-gray-200 transition-colors inline-flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                Print / Save as PDF
              </button>
              <a
                href={`mailto:${artistData.contact.email}?subject=Press Assets Request`}
                className="px-8 py-3 border border-white text-white font-semibold rounded hover:bg-white hover:text-black transition-colors inline-block"
              >
                Request High-Res Assets
              </a>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

