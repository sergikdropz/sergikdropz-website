interface Venue {
  id: string
  name: string
  city: string
  type: string
  description?: string
}

export default function VenueCard({ venue }: { venue: Venue }) {
  return (
    <div className="bg-gray-900 p-6 rounded-lg hover:bg-gray-800 transition-colors">
      <h3 className="text-xl font-semibold mb-2">{venue.name}</h3>
      <p className="text-gray-400 mb-2">{venue.city}</p>
      <span className="text-xs text-gray-500 bg-gray-800 px-2 py-1 rounded inline-block mb-2">
        {venue.type}
      </span>
      {venue.description && (
        <p className="text-gray-500 text-sm mt-2">{venue.description}</p>
      )}
    </div>
  )
}

