'use client'

import { useState } from 'react'
import artistData from '@/data/artist.json'
import eventsData from '@/data/events.json'
import venuesData from '@/data/venues.json'

export default function Book() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    date: '',
    city: '',
    venue: '',
    setLength: '',
    eventType: '',
    budgetRange: '',
    soundInfo: '',
    lightingInfo: '',
    additionalInfo: ''
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    const subject = encodeURIComponent(`Booking Inquiry: ${formData.venue || formData.city} - ${formData.date}`)
    const body = encodeURIComponent(
      `Booking Inquiry from ${formData.name} (${formData.email}${formData.phone ? `, ${formData.phone}` : ''})\n\n` +
      `Date: ${formData.date}\n` +
      `City/Venue: ${formData.city}${formData.venue ? ` / ${formData.venue}` : ''}\n` +
      `Set Length: ${formData.setLength}\n` +
      `Event Type: ${formData.eventType}\n` +
      `Budget Range: ${formData.budgetRange}\n` +
      `Sound Info: ${formData.soundInfo || 'N/A'}\n` +
      `Lighting Info: ${formData.lightingInfo || 'N/A'}\n` +
      `Additional Info: ${formData.additionalInfo || 'None'}`
    )

    window.location.href = `mailto:${artistData.contact.email}?subject=${subject}&body=${body}`
    setIsSubmitting(false)
  }

  const performanceHighlights = [
    ...eventsData.festivals.slice(0, 5).map(f => f.name),
    ...venuesData.venues.slice(0, 5).map(v => `${v.name}, ${v.city}`)
  ]

  return (
    <div className="pt-20 min-h-screen bg-black">
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-5xl mx-auto">
          {/* One-line pitch */}
          <div className="text-center mb-12">
            <h1 className="text-5xl md:text-6xl font-bold mb-4">Book SERGIK</h1>
            <p className="text-xl text-gray-300 max-w-2xl mx-auto">
              {artistData.genres.primary.join(' / ')} • Groove-driven sets for warehouses, clubs, and festivals
            </p>
          </div>

          {/* Performance Highlights */}
          <section className="mb-16 bg-gray-900 p-8 rounded-lg">
            <h2 className="text-3xl font-semibold mb-6">Performance Highlights</h2>
            <ul className="space-y-2 text-gray-300">
              {performanceHighlights.map((highlight, idx) => (
                <li key={idx} className="flex items-start">
                  <span className="text-white mr-2">•</span>
                  <span>{highlight}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* Location & Travel */}
          <section className="mb-16">
            <h2 className="text-3xl font-semibold mb-4">Location & Travel</h2>
            <p className="text-gray-300 text-lg mb-4">
              Based in {artistData.location.city}, {artistData.location.state}
            </p>
            <p className="text-gray-400">
              Available for bookings nationwide. International bookings considered.
            </p>
          </section>

          {/* Available For */}
          <section className="mb-16 bg-gray-900 p-8 rounded-lg">
            <h2 className="text-3xl font-semibold mb-4">Available For</h2>
            <div className="flex flex-wrap gap-3">
              {['Club nights', 'Festivals', 'Support slots', 'Private events', 'After-hours', 'Warehouse parties'].map((type) => (
                <span
                  key={type}
                  className="px-4 py-2 bg-white text-black rounded-full text-sm font-medium"
                >
                  {type}
                </span>
              ))}
            </div>
          </section>

          {/* Pricing Note */}
          <section className="mb-16 bg-gray-900 p-8 rounded-lg">
            <h2 className="text-2xl font-semibold mb-4">Pricing</h2>
            <p className="text-gray-300">
              Rates vary based on date, venue, set length, and event type. Please share your date, venue, and set length for a quote.
            </p>
          </section>

          {/* Booking Form */}
          <section className="mb-16">
            <h2 className="text-3xl font-semibold mb-6">Booking Inquiry</h2>
            <form onSubmit={handleSubmit} className="space-y-6 bg-gray-900 p-8 rounded-lg">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-2">
                    Name / Promoter Name *
                  </label>
                  <input
                    type="text"
                    id="name"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-white"
                  />
                </div>

                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
                    Email *
                  </label>
                  <input
                    type="email"
                    id="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-white"
                  />
                </div>

                <div>
                  <label htmlFor="phone" className="block text-sm font-medium text-gray-300 mb-2">
                    Phone
                  </label>
                  <input
                    type="tel"
                    id="phone"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-white"
                  />
                </div>

                <div>
                  <label htmlFor="date" className="block text-sm font-medium text-gray-300 mb-2">
                    Date *
                  </label>
                  <input
                    type="date"
                    id="date"
                    required
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-white"
                  />
                </div>

                <div>
                  <label htmlFor="city" className="block text-sm font-medium text-gray-300 mb-2">
                    City *
                  </label>
                  <input
                    type="text"
                    id="city"
                    required
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-white"
                  />
                </div>

                <div>
                  <label htmlFor="venue" className="block text-sm font-medium text-gray-300 mb-2">
                    Venue Name
                  </label>
                  <input
                    type="text"
                    id="venue"
                    value={formData.venue}
                    onChange={(e) => setFormData({ ...formData, venue: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-white"
                  />
                </div>

                <div>
                  <label htmlFor="setLength" className="block text-sm font-medium text-gray-300 mb-2">
                    Set Length *
                  </label>
                  <select
                    id="setLength"
                    required
                    value={formData.setLength}
                    onChange={(e) => setFormData({ ...formData, setLength: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-white"
                  >
                    <option value="">Select...</option>
                    <option value="30 min">30 minutes</option>
                    <option value="45 min">45 minutes</option>
                    <option value="60 min">1 hour</option>
                    <option value="90 min">1.5 hours</option>
                    <option value="120 min">2 hours</option>
                    <option value="3+ hours">3+ hours</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="eventType" className="block text-sm font-medium text-gray-300 mb-2">
                    Event Type *
                  </label>
                  <select
                    id="eventType"
                    required
                    value={formData.eventType}
                    onChange={(e) => setFormData({ ...formData, eventType: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-white"
                  >
                    <option value="">Select...</option>
                    <option value="Club night">Club night</option>
                    <option value="Festival">Festival</option>
                    <option value="Support slot">Support slot</option>
                    <option value="Private event">Private event</option>
                    <option value="After-hours">After-hours</option>
                    <option value="Warehouse party">Warehouse party</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="budgetRange" className="block text-sm font-medium text-gray-300 mb-2">
                    Budget Range
                  </label>
                  <select
                    id="budgetRange"
                    value={formData.budgetRange}
                    onChange={(e) => setFormData({ ...formData, budgetRange: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-white"
                  >
                    <option value="">Select...</option>
                    <option value="$500-$1,000">$500-$1,000</option>
                    <option value="$1,000-$2,500">$1,000-$2,500</option>
                    <option value="$2,500-$5,000">$2,500-$5,000</option>
                    <option value="$5,000+">$5,000+</option>
                    <option value="To be discussed">To be discussed</option>
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="soundInfo" className="block text-sm font-medium text-gray-300 mb-2">
                  Sound System Info
                </label>
                <textarea
                  id="soundInfo"
                  rows={3}
                  value={formData.soundInfo}
                  onChange={(e) => setFormData({ ...formData, soundInfo: e.target.value })}
                  placeholder="PA system, monitors, etc."
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-white resize-none"
                />
              </div>

              <div>
                <label htmlFor="lightingInfo" className="block text-sm font-medium text-gray-300 mb-2">
                  Lighting Info
                </label>
                <textarea
                  id="lightingInfo"
                  rows={3}
                  value={formData.lightingInfo}
                  onChange={(e) => setFormData({ ...formData, lightingInfo: e.target.value })}
                  placeholder="Lighting setup, stage plot requirements, etc."
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-white resize-none"
                />
              </div>

              <div>
                <label htmlFor="additionalInfo" className="block text-sm font-medium text-gray-300 mb-2">
                  Additional Information
                </label>
                <textarea
                  id="additionalInfo"
                  rows={4}
                  value={formData.additionalInfo}
                  onChange={(e) => setFormData({ ...formData, additionalInfo: e.target.value })}
                  placeholder="Any other details about the event..."
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-white resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-white text-black font-semibold py-4 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-lg"
              >
                {isSubmitting ? 'Sending...' : 'Send Booking Inquiry'}
              </button>
            </form>
          </section>

          {/* Sticky Email Button */}
          <div className="sticky bottom-4 bg-white text-black p-4 rounded-lg shadow-lg text-center">
            <a
              href={`mailto:${artistData.contact.email}?subject=Booking Inquiry`}
              className="text-lg font-semibold hover:underline"
            >
              Email Booking: {artistData.contact.email}
            </a>
            <p className="text-sm text-gray-600 mt-1">Response time: 24-48 hours</p>
          </div>
        </div>
      </div>
    </div>
  )
}

