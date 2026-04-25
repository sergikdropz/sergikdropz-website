'use client'

import SocialLinks from './SocialLinks'
import artistData from '@/data/artist.json'
import Link from 'next/link'

export default function Footer() {

  return (
    <footer className="bg-black border-t border-gray-800 py-8 sm:py-12 safe-area-bottom">
      <div className="container mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
          <div>
            <h4 className="font-semibold mb-3 sm:mb-4 text-base sm:text-lg">Location</h4>
            <p className="text-gray-400 text-sm">
              {artistData.location.city}, {artistData.location.state}
            </p>
          </div>
          
          <div>
            <h4 className="font-semibold mb-3 sm:mb-4 text-base sm:text-lg">Connect</h4>
            <SocialLinks />
            <p className="text-gray-400 text-sm mt-3 sm:mt-4">
              <a 
                href={`mailto:${artistData.contact.email}`} 
                className="hover:text-white transition-colors touch-manipulation break-all"
              >
                {artistData.contact.email}
              </a>
            </p>
          </div>
          
          <div>
            <h3 className="text-lg sm:text-xl font-bold mb-3 sm:mb-4">SERGIK</h3>
            <div className="flex flex-col gap-3 sm:gap-4 relative z-10">
              <Link
                href="/contact"
                className="px-6 py-3 bg-gray-900/40 text-white font-bold rounded-lg hover:bg-gray-800/40 transition-all text-center text-base sm:text-lg shadow-lg border-2 border-gray-700 opacity-100 relative z-10 min-h-[44px] touch-manipulation"
              >
                Contact
              </Link>
            </div>
          </div>
        </div>
        
        <div className="mt-6 sm:mt-8 pt-6 sm:pt-8 border-t border-gray-800 text-center text-gray-400 text-xs sm:text-sm">
          <p>&copy; {new Date().getFullYear()} SERGIK. All rights reserved.</p>
        </div>
      </div>
    </footer>
  )
}

