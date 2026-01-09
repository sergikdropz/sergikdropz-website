import artistData from '@/data/artist.json'
import socialProofData from '@/data/social-proof.json'

export default function About() {
  return (
    <div className="pt-20 min-h-screen bg-black">
      <div className="container mx-auto px-4 py-16">
        <h1 className="text-5xl font-bold mb-12">About</h1>
        
        <div className="max-w-4xl mx-auto space-y-12">
          {/* Bio */}
          <section>
            <h2 className="text-3xl font-semibold mb-6">Biography</h2>
            <p className="text-lg text-gray-300 leading-relaxed mb-4">
              {artistData.bio.long}
            </p>
          </section>

          {/* Influences */}
          <section>
            <h2 className="text-3xl font-semibold mb-6">Influences</h2>
            <div className="grid md:grid-cols-2 gap-8">
              <div>
                <h3 className="text-xl font-medium mb-4">Musical</h3>
                <div className="space-y-2">
                  <div>
                    <p className="text-gray-400 mb-2">Rhythmic:</p>
                    <div className="flex flex-wrap gap-2">
                      {artistData.influences.musical.rhythmic.map((influence) => (
                        <span key={influence} className="px-3 py-1 bg-gray-800 rounded text-sm">
                          {influence}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-gray-400 mb-2">Textural:</p>
                    <div className="flex flex-wrap gap-2">
                      {artistData.influences.musical.textural.map((influence) => (
                        <span key={influence} className="px-3 py-1 bg-gray-800 rounded text-sm">
                          {influence}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <div>
                <h3 className="text-xl font-medium mb-4">Philosophy</h3>
                <ul className="space-y-2">
                  {artistData.influences.philosophy.map((principle, index) => (
                    <li key={index} className="text-gray-300 flex items-start">
                      <span className="mr-2">•</span>
                      <span>{principle}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          {/* Performance Context */}
          <section>
            <h2 className="text-3xl font-semibold mb-6">Performance Context</h2>
            <p className="text-lg text-gray-300 mb-4">
              {artistData.environment_statement}
            </p>
            <div className="flex flex-wrap gap-3 mt-4">
              {artistData.environmental_contexts.map((context) => (
                <span
                  key={context}
                  className="px-4 py-2 bg-gray-800 rounded-full text-sm"
                >
                  {context}
                </span>
              ))}
            </div>
          </section>

          {/* Community */}
          <section>
            <h2 className="text-3xl font-semibold mb-6">Community</h2>
            <div className="mb-4">
              <h3 className="text-xl font-medium mb-3">Roles</h3>
              <ul className="space-y-2">
                {artistData.community_roles.map((role, index) => (
                  <li key={index} className="text-gray-300 flex items-start">
                    <span className="mr-2">•</span>
                    <span>{role}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-xl font-medium mb-3">Focus</h3>
              <ul className="space-y-2">
                {artistData.community_focus.map((focus, index) => (
                  <li key={index} className="text-gray-300 flex items-start">
                    <span className="mr-2">•</span>
                    <span>{focus}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* Shared Billing */}
          <section>
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
        </div>
      </div>
    </div>
  )
}

