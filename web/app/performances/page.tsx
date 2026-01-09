import eventsData from '@/data/events.json'
import venuesData from '@/data/venues.json'
import VenueCard from '@/components/VenueCard'

export default function Performances() {
  return (
    <div className="pt-20 min-h-screen bg-black">
      <div className="container mx-auto px-4 py-16">
        <h1 className="text-5xl font-bold mb-12">Performances</h1>
        
        {/* Festivals */}
        <section className="mb-16">
          <h2 className="text-3xl font-semibold mb-8">Festivals</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {eventsData.festivals.map((festival) => (
              <div
                key={festival.id}
                className="bg-gray-900 p-6 rounded-lg hover:bg-gray-800 transition-colors"
              >
                <h3 className="text-xl font-semibold mb-2">{festival.name}</h3>
                <p className="text-gray-400">{festival.location}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Venues */}
        <section>
          <h2 className="text-3xl font-semibold mb-8">Venues</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {venuesData.venues.map((venue) => (
              <VenueCard key={venue.id} venue={venue} />
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

