'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'

interface Event {
  id: string
  name: string
  date: string
  venue: string
  city: string
  type: string
  description?: string
}

interface Venue {
  id: string
  name: string
  city: string
  type: string
  description: string
}

export default function AdminEvents() {
  const { user, isAdmin, loading } = useAuth()
  const router = useRouter()
  const [events, setEvents] = useState<Event[]>([])
  const [venues, setVenues] = useState<Venue[]>([])
  const [loadingData, setLoadingData] = useState(true)
  const [activeTab, setActiveTab] = useState<'events' | 'venues'>('events')

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) {
      router.push('/admin/login')
    }
  }, [user, isAdmin, loading, router])

  useEffect(() => {
    if (isAdmin) {
      fetchData()
    }
  }, [isAdmin])

  async function fetchData() {
    try {
      setLoadingData(true)
      const [eventsRes, venuesRes] = await Promise.all([
        fetch('/api/admin/events'),
        fetch('/api/admin/venues'),
      ])
      const eventsData = await eventsRes.json()
      const venuesData = await venuesRes.json()
      setEvents(eventsData.events || [])
      setVenues(venuesData.venues || [])
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoadingData(false)
    }
  }

  if (loading || loadingData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="text-white text-xl">Loading...</div>
      </div>
    )
  }

  if (!user || !isAdmin) {
    return null
  }

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Events & Performances</h1>
          <p className="text-gray-400">Manage events, festivals, and venues</p>
        </div>

        <div className="flex space-x-4 mb-6">
          <button
            onClick={() => setActiveTab('events')}
            className={`px-6 py-3 rounded-lg font-semibold transition ${
              activeTab === 'events'
                ? 'bg-purple-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            Events ({events.length})
          </button>
          <button
            onClick={() => setActiveTab('venues')}
            className={`px-6 py-3 rounded-lg font-semibold transition ${
              activeTab === 'venues'
                ? 'bg-purple-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            Venues ({venues.length})
          </button>
        </div>

        {activeTab === 'events' ? (
          <EventsList events={events} onRefresh={fetchData} />
        ) : (
          <VenuesList venues={venues} onRefresh={fetchData} />
        )}
      </div>
    </div>
  )
}

function EventsList({ events, onRefresh }: { events: Event[]; onRefresh: () => void }) {
  const [editing, setEditing] = useState<Event | null>(null)
  const [showForm, setShowForm] = useState(false)

  async function handleSave(event: Event) {
    try {
      const response = await fetch('/api/admin/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
      })

      if (response.ok) {
        setShowForm(false)
        setEditing(null)
        onRefresh()
        alert('Event saved successfully!')
      } else {
        alert('Save failed')
      }
    } catch (error) {
      alert('Save error')
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Are you sure you want to delete this event?')) return

    try {
      const response = await fetch(`/api/admin/events/${id}`, { method: 'DELETE' })
      if (response.ok) {
        onRefresh()
        alert('Event deleted successfully')
      } else {
        alert('Delete failed')
      }
    } catch (error) {
      alert('Delete error')
    }
  }

  return (
    <div>
      <div className="mb-6">
        <button
          onClick={() => {
            setEditing(null)
            setShowForm(true)
          }}
          className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold px-6 py-3 rounded-lg transition"
        >
          + Add Event
        </button>
      </div>

      {showForm && (
        <EventForm
          event={editing}
          onSave={handleSave}
          onCancel={() => {
            setShowForm(false)
            setEditing(null)
          }}
        />
      )}

      <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6">
        {events.length === 0 ? (
          <div className="text-center py-12 text-gray-400">No events found.</div>
        ) : (
          <div className="space-y-4">
            {events.map((event) => (
              <div
                key={event.id}
                className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 hover:border-purple-500 transition"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold">{event.name}</h3>
                    <p className="text-gray-400 text-sm">
                      {event.venue} • {event.city} • {event.date} • {event.type}
                    </p>
                    {event.description && (
                      <p className="text-gray-500 text-sm mt-1">{event.description}</p>
                    )}
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => {
                        setEditing(event)
                        setShowForm(true)
                      }}
                      className="text-blue-400 hover:text-blue-300 px-3 py-1 rounded transition"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(event.id)}
                      className="text-red-400 hover:text-red-300 px-3 py-1 rounded transition"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function VenuesList({ venues, onRefresh }: { venues: Venue[]; onRefresh: () => void }) {
  const [editing, setEditing] = useState<Venue | null>(null)
  const [showForm, setShowForm] = useState(false)

  async function handleSave(venue: Venue) {
    try {
      const response = await fetch('/api/admin/venues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(venue),
      })

      if (response.ok) {
        setShowForm(false)
        setEditing(null)
        onRefresh()
        alert('Venue saved successfully!')
      } else {
        alert('Save failed')
      }
    } catch (error) {
      alert('Save error')
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Are you sure you want to delete this venue?')) return

    try {
      const response = await fetch(`/api/admin/venues/${id}`, { method: 'DELETE' })
      if (response.ok) {
        onRefresh()
        alert('Venue deleted successfully')
      } else {
        alert('Delete failed')
      }
    } catch (error) {
      alert('Delete error')
    }
  }

  return (
    <div>
      <div className="mb-6">
        <button
          onClick={() => {
            setEditing(null)
            setShowForm(true)
          }}
          className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold px-6 py-3 rounded-lg transition"
        >
          + Add Venue
        </button>
      </div>

      {showForm && (
        <VenueForm
          venue={editing}
          onSave={handleSave}
          onCancel={() => {
            setShowForm(false)
            setEditing(null)
          }}
        />
      )}

      <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6">
        {venues.length === 0 ? (
          <div className="text-center py-12 text-gray-400">No venues found.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {venues.map((venue) => (
              <div
                key={venue.id}
                className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 hover:border-purple-500 transition"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold">{venue.name}</h3>
                    <p className="text-gray-400 text-sm">
                      {venue.city} • {venue.type}
                    </p>
                    {venue.description && (
                      <p className="text-gray-500 text-sm mt-1">{venue.description}</p>
                    )}
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => {
                        setEditing(venue)
                        setShowForm(true)
                      }}
                      className="text-blue-400 hover:text-blue-300 px-3 py-1 rounded transition"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(venue.id)}
                      className="text-red-400 hover:text-red-300 px-3 py-1 rounded transition"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function EventForm({
  event,
  onSave,
  onCancel,
}: {
  event: Event | null
  onSave: (event: Event) => void
  onCancel: () => void
}) {
  const [formData, setFormData] = useState<Event>({
    id: event?.id || '',
    name: event?.name || '',
    date: event?.date || '',
    venue: event?.venue || '',
    city: event?.city || '',
    type: event?.type || 'Festival',
    description: event?.description || '',
  })

  return (
    <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6 mb-6">
      <h2 className="text-2xl font-semibold mb-4">{event ? 'Edit Event' : 'Add Event'}</h2>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">ID</label>
            <input
              type="text"
              value={formData.id}
              onChange={(e) => setFormData({ ...formData, id: e.target.value })}
              className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white"
            />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Date</label>
            <input
              type="text"
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white"
              placeholder="2025-01-15"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Venue</label>
            <input
              type="text"
              value={formData.venue}
              onChange={(e) => setFormData({ ...formData, venue: e.target.value })}
              className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">City</label>
            <input
              type="text"
              value={formData.city}
              onChange={(e) => setFormData({ ...formData, city: e.target.value })}
              className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Type</label>
          <select
            value={formData.type}
            onChange={(e) => setFormData({ ...formData, type: e.target.value })}
            className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white"
          >
            <option>Festival</option>
            <option>Club</option>
            <option>Warehouse</option>
            <option>Concert</option>
            <option>Other</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Description</label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            rows={3}
            className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white"
          />
        </div>
        <div className="flex space-x-4">
          <button
            onClick={() => onSave(formData)}
            className="bg-purple-600 hover:bg-purple-700 text-white font-semibold px-6 py-3 rounded-lg transition"
          >
            Save
          </button>
          <button
            onClick={onCancel}
            className="bg-gray-700 hover:bg-gray-600 text-white font-semibold px-6 py-3 rounded-lg transition"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

function VenueForm({
  venue,
  onSave,
  onCancel,
}: {
  venue: Venue | null
  onSave: (venue: Venue) => void
  onCancel: () => void
}) {
  const [formData, setFormData] = useState<Venue>({
    id: venue?.id || '',
    name: venue?.name || '',
    city: venue?.city || '',
    type: venue?.type || 'Warehouse',
    description: venue?.description || '',
  })

  return (
    <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6 mb-6">
      <h2 className="text-2xl font-semibold mb-4">{venue ? 'Edit Venue' : 'Add Venue'}</h2>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">ID</label>
            <input
              type="text"
              value={formData.id}
              onChange={(e) => setFormData({ ...formData, id: e.target.value })}
              className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">City</label>
            <input
              type="text"
              value={formData.city}
              onChange={(e) => setFormData({ ...formData, city: e.target.value })}
              className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Type</label>
            <select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white"
            >
              <option>Warehouse</option>
              <option>Club</option>
              <option>Studio / Venue</option>
              <option>Rooftop Club</option>
              <option>Other</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Description</label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            rows={3}
            className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white"
          />
        </div>
        <div className="flex space-x-4">
          <button
            onClick={() => onSave(formData)}
            className="bg-purple-600 hover:bg-purple-700 text-white font-semibold px-6 py-3 rounded-lg transition"
          >
            Save
          </button>
          <button
            onClick={onCancel}
            className="bg-gray-700 hover:bg-gray-600 text-white font-semibold px-6 py-3 rounded-lg transition"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
