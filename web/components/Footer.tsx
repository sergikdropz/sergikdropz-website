import SocialLinks from './SocialLinks'
import artistData from '@/data/artist.json'

export default function Footer() {
  return (
    <footer className="bg-black border-t border-gray-800 py-12">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <h3 className="text-xl font-bold mb-4">SERGIK</h3>
            <p className="text-gray-400 text-sm">{artistData.bio.short}</p>
          </div>
          
          <div>
            <h4 className="font-semibold mb-4">Location</h4>
            <p className="text-gray-400 text-sm">
              {artistData.location.city}, {artistData.location.state}
            </p>
          </div>
          
          <div>
            <h4 className="font-semibold mb-4">Connect</h4>
            <SocialLinks />
            <p className="text-gray-400 text-sm mt-4">
              <a href={`mailto:${artistData.contact.email}`} className="hover:text-white">
                {artistData.contact.email}
              </a>
            </p>
          </div>
        </div>
        
        <div className="mt-8 pt-8 border-t border-gray-800 text-center text-gray-400 text-sm">
          <p>&copy; {new Date().getFullYear()} SERGIK. All rights reserved.</p>
        </div>
      </div>
    </footer>
  )
}

