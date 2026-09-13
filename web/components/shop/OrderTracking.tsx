'use client'

interface OrderTrackingProps {
  order: {
    status: string
    tracking_number?: string
    tracking_url?: string
    items: any[]
    total: number
    created_at: string
  }
}

const statusSteps = ['pending', 'processing', 'shipped', 'delivered']
const statusLabels: Record<string, string> = {
  pending: 'Order Placed',
  processing: 'Processing',
  shipped: 'Shipped',
  delivered: 'Delivered',
  failed: 'Failed',
  canceled: 'Canceled',
}

export default function OrderTracking({ order }: OrderTrackingProps) {
  const currentIndex = statusSteps.indexOf(order.status)
  const isFailed = order.status === 'failed' || order.status === 'canceled'

  return (
    <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-semibold">Order Status</h3>
        <span
          className={`px-2 py-0.5 text-xs rounded font-medium ${
            isFailed
              ? 'bg-red-600/20 text-red-400'
              : order.status === 'delivered'
              ? 'bg-green-600/20 text-green-400'
              : 'bg-blue-600/20 text-blue-400'
          }`}
        >
          {statusLabels[order.status] || order.status}
        </span>
      </div>

      {/* Progress steps */}
      {!isFailed && (
        <div className="flex items-center justify-between mb-6">
          {statusSteps.map((step, i) => (
            <div key={step} className="flex items-center flex-1">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                  i <= currentIndex
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-700 text-gray-400'
                }`}
              >
                {i <= currentIndex ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>
              {i < statusSteps.length - 1 && (
                <div
                  className={`flex-1 h-0.5 mx-2 ${
                    i < currentIndex ? 'bg-green-600' : 'bg-gray-700'
                  }`}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Tracking */}
      {order.tracking_number && (
        <div className="bg-gray-800 rounded p-3 mb-4">
          <p className="text-gray-400 text-xs mb-1">Tracking Number</p>
          {order.tracking_url ? (
            <a
              href={order.tracking_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 text-sm font-mono transition-colors"
            >
              {order.tracking_number}
            </a>
          ) : (
            <p className="text-white text-sm font-mono">{order.tracking_number}</p>
          )}
        </div>
      )}

      {/* Order details */}
      <div className="text-sm">
        <p className="text-gray-400">
          Ordered: {new Date(order.created_at).toLocaleDateString()}
        </p>
        <p className="text-gray-400">
          Items: {order.items?.length || 0} | Total: ${((order.total || 0) / 100).toFixed(2)}
        </p>
      </div>
    </div>
  )
}
