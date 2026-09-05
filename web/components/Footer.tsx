'use client'

import SocialLinks from './SocialLinks'
import artistData from '@/data/artist.json'

export default function Footer() {
  return (
    <footer className="safe-area-bottom border-t border-gray-800 bg-black py-8 sm:py-12">
      <div className="container mx-auto px-4 sm:px-6">
        <div className="mb-8 text-center sm:mb-10">
          <SocialLinks />
          <p className="mt-3 text-sm text-gray-400 sm:mt-4">
            <a
              href={`mailto:${artistData.contact.email}`}
              className="break-all touch-manipulation transition-colors hover:text-white"
            >
              {artistData.contact.email}
            </a>
          </p>
        </div>

        <div className="text-center">
          <h4 className="mb-2 text-base font-semibold sm:text-lg">Location</h4>
          <p className="text-sm text-gray-400">
            {artistData.location.city}, {artistData.location.state}
          </p>
        </div>

        <div className="mt-6 border-t border-gray-800 pt-6 text-center text-xs text-gray-400 sm:mt-8 sm:pt-8 sm:text-sm">
          <p>&copy; {new Date().getFullYear()} SERGIK. All rights reserved.</p>
        </div>
      </div>
    </footer>
  )
}
