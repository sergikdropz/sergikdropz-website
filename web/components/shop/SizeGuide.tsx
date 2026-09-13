'use client'

interface SizeGuideProps {
  onClose: () => void
}

export default function SizeGuide({ onClose }: SizeGuideProps) {
  const sizes = [
    { size: 'S', chest: '34-36', length: '27', sleeve: '8' },
    { size: 'M', chest: '38-40', length: '28', sleeve: '8.5' },
    { size: 'L', chest: '42-44', length: '29', sleeve: '9' },
    { size: 'XL', chest: '46-48', length: '30', sleeve: '9.5' },
    { size: '2XL', chest: '50-52', length: '31', sleeve: '10' },
    { size: '3XL', chest: '54-56', length: '32', sleeve: '10.5' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-700 rounded-lg p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-white">Size Guide</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <p className="text-gray-400 text-sm mb-4">
          Measurements in inches. Unisex / standard fit.
        </p>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-700">
              <th className="text-left py-2 text-gray-400 font-medium">Size</th>
              <th className="text-left py-2 text-gray-400 font-medium">Chest</th>
              <th className="text-left py-2 text-gray-400 font-medium">Length</th>
              <th className="text-left py-2 text-gray-400 font-medium">Sleeve</th>
            </tr>
          </thead>
          <tbody>
            {sizes.map((row) => (
              <tr key={row.size} className="border-b border-gray-800/50">
                <td className="py-2 text-white font-semibold">{row.size}</td>
                <td className="py-2 text-gray-300">{row.chest}&quot;</td>
                <td className="py-2 text-gray-300">{row.length}&quot;</td>
                <td className="py-2 text-gray-300">{row.sleeve}&quot;</td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="text-gray-500 text-xs mt-4">
          Tip: If you&#39;re between sizes, we recommend going one size up.
        </p>
      </div>
    </div>
  )
}
