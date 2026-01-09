import ContactForm from '@/components/ContactForm'
import artistData from '@/data/artist.json'
import SocialLinks from '@/components/SocialLinks'

export default function Contact() {
  return (
    <div className="pt-20 min-h-screen bg-black">
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-5xl md:text-6xl font-bold mb-4">Contact</h1>
          <p className="text-gray-400 text-lg mb-12">
            Get in touch for bookings, press inquiries, collaborations, or just to say hello.
          </p>

          <div className="grid md:grid-cols-2 gap-12">
            <div>
              <h2 className="text-2xl font-semibold mb-6">Get in Touch</h2>
              <div className="space-y-4 mb-8">
                <div>
                  <p className="text-gray-400 text-sm mb-1">Email</p>
                  <a
                    href={`mailto:${artistData.contact.email}`}
                    className="text-white hover:text-gray-300 transition-colors"
                  >
                    {artistData.contact.email}
                  </a>
                </div>
                <div>
                  <p className="text-gray-400 text-sm mb-1">Location</p>
                  <p className="text-white">
                    {artistData.location.city}, {artistData.location.state}
                  </p>
                </div>
              </div>

              <div>
                <p className="text-gray-400 text-sm mb-4">Connect</p>
                <SocialLinks />
              </div>
            </div>

            <div>
              <h2 className="text-2xl font-semibold mb-6">Send a Message</h2>
              <ContactForm />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

