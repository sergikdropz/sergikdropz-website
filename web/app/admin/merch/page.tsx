'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'

interface MerchOrder {
  id: string
  customer_email: string
  customer_name?: string
  items: any[]
  total: number
  status: string
  tracking_url?: string
  tracking_number?: string
  shipping_address?: any
  created_at: string
}

export default function AdminMerchPage() {
  const { user, isAdmin, loading } = useAuth()
  const router = useRouter()
  const [products, setProducts] = useState<any[]>([])
  const [orders, setOrders] = useState<MerchOrder[]>([])
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<string | null>(null)
  const [loadingData, setLoadingData] = useState(true)
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null)
  const [selectedOrder, setSelectedOrder] = useState<MerchOrder | null>(null)
  const [updatingOrder, setUpdatingOrder] = useState(false)
  const [orderStatusEdit, setOrderStatusEdit] = useState('')
  const [trackingEdit, setTrackingEdit] = useState('')

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) {
      router.push('/admin/login')
    }
  }, [user, isAdmin, loading, router])

  useEffect(() => {
    if (isAdmin) loadData()
  }, [isAdmin])

  async function loadData() {
    try {
      const [prodRes, ordersRes] = await Promise.allSettled([
        fetch('/api/merch/products'),
        fetch('/api/admin/merch/orders'),
      ])

      if (prodRes.status === 'fulfilled' && prodRes.value.ok) {
        const d = await prodRes.value.json()
        setProducts(d.products || [])
      }
      if (ordersRes.status === 'fulfilled' && ordersRes.value.ok) {
        const d = await ordersRes.value.json()
        setOrders(d.orders || [])
      }
    } catch (err) {
      console.error('Error loading merch data:', err)
    } finally {
      setLoadingData(false)
    }
  }

  async function syncFromPrintful() {
    setSyncing(true)
    setSyncResult(null)

    try {
      const res = await fetch('/api/admin/merch/sync', { method: 'POST' })
      const data = await res.json()

      if (res.ok) {
        setSyncResult(`Synced ${data.productsCount} products successfully.`)
        loadData()
      } else {
        setSyncResult(`Error: ${data.error}`)
      }
    } catch (err: any) {
      setSyncResult(`Error: ${err.message}`)
    } finally {
      setSyncing(false)
    }
  }

  function openOrderDetail(order: MerchOrder) {
    setSelectedOrder(order)
    setOrderStatusEdit(order.status)
    setTrackingEdit(order.tracking_url || '')
  }

  async function updateOrder() {
    if (!selectedOrder) return
    setUpdatingOrder(true)
    try {
      const res = await fetch(`/api/admin/merch/orders/${selectedOrder.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: orderStatusEdit,
          tracking_url: trackingEdit || null,
        }),
      })
      if (res.ok) {
        setSelectedOrder(null)
        loadData()
      }
    } catch (err) {
      console.error('Error updating order:', err)
    } finally {
      setUpdatingOrder(false)
    }
  }

  if (loading || !isAdmin) return null

  const statusColors: Record<string, string> = {
    pending: 'bg-yellow-600/20 text-yellow-400',
    processing: 'bg-blue-600/20 text-blue-400',
    shipped: 'bg-green-600/20 text-green-400',
    delivered: 'bg-green-600/20 text-green-400',
    failed: 'bg-red-600/20 text-red-400',
    canceled: 'bg-red-600/20 text-red-400',
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Merch Store</h1>
        <button
          onClick={syncFromPrintful}
          disabled={syncing}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 text-white text-sm font-semibold rounded-lg transition-all"
        >
          {syncing ? 'Syncing...' : 'Sync from Printful'}
        </button>
      </div>

      {syncResult && (
        <div
          className={`mb-6 p-3 rounded-lg text-sm ${
            syncResult.startsWith('Error')
              ? 'bg-red-600/20 text-red-400'
              : 'bg-green-600/20 text-green-400'
          }`}
        >
          {syncResult}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4">
          <p className="text-gray-400 text-sm">Products</p>
          <p className="text-2xl font-bold text-white">{products.length}</p>
        </div>
        <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4">
          <p className="text-gray-400 text-sm">Total Orders</p>
          <p className="text-2xl font-bold text-white">{orders.length}</p>
        </div>
        <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4">
          <p className="text-gray-400 text-sm">Revenue</p>
          <p className="text-2xl font-bold text-green-400">
            ${(orders.reduce((s, o) => s + (o.total || 0), 0) / 100).toFixed(2)}
          </p>
        </div>
      </div>

      {/* Products */}
      <h2 className="text-lg font-bold text-white mb-3">Products ({products.length})</h2>
      {products.length === 0 ? (
        <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-8 text-center text-gray-500 mb-8">
          No products synced. Click &quot;Sync from Printful&quot; to import products.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-8">
          {products.map((p) => (
            <div
              key={p.id}
              onClick={() => setSelectedProduct(selectedProduct?.id === p.id ? null : p)}
              className="bg-gray-900/50 border border-gray-800 rounded-lg p-3 cursor-pointer hover:border-gray-600 transition-all"
            >
              <div className="flex gap-3">
                {p.thumbnail && (
                  <img
                    src={p.thumbnail}
                    alt={p.name}
                    className="w-16 h-16 object-cover rounded"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="text-white font-semibold text-sm truncate">{p.name}</h3>
                  <p className="text-gray-400 text-xs mt-1">
                    {p.variants?.length || 0} variants | {p.category}
                  </p>
                </div>
              </div>
              {/* Expanded product detail */}
              {selectedProduct?.id === p.id && (
                <div className="mt-3 pt-3 border-t border-gray-800">
                  {p.variants && p.variants.length > 0 && (
                    <div className="mb-2">
                      <p className="text-gray-400 text-xs font-medium mb-1">Variants:</p>
                      <div className="flex flex-wrap gap-1">
                        {p.variants.map((v: any, i: number) => (
                          <span
                            key={i}
                            className="px-2 py-0.5 bg-gray-800 text-gray-300 text-xs rounded"
                          >
                            {v.name || v.size || `Variant ${i + 1}`}
                            {v.price ? ` - $${(v.price / 100).toFixed(2)}` : ''}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {p.images && p.images.length > 0 && (
                    <div className="mb-2">
                      <p className="text-gray-400 text-xs font-medium mb-1">Images:</p>
                      <div className="flex gap-1 overflow-x-auto">
                        {p.images.slice(0, 4).map((img: string, i: number) => (
                          <img
                            key={i}
                            src={img}
                            alt=""
                            className="w-12 h-12 object-cover rounded"
                          />
                        ))}
                      </div>
                    </div>
                  )}
                  {p.stock !== undefined && (
                    <p className="text-gray-400 text-xs">
                      Stock: <span className="text-white">{p.stock}</span>
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Orders */}
      <h2 className="text-lg font-bold text-white mb-3">Orders ({orders.length})</h2>
      {loadingData ? (
        <div className="text-gray-400 animate-pulse">Loading...</div>
      ) : orders.length === 0 ? (
        <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-8 text-center text-gray-500">
          No orders yet.
        </div>
      ) : (
        <div className="bg-gray-900/50 border border-gray-800 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left p-3 text-gray-400 font-medium">Date</th>
                  <th className="text-left p-3 text-gray-400 font-medium">Email</th>
                  <th className="text-left p-3 text-gray-400 font-medium">Items</th>
                  <th className="text-left p-3 text-gray-400 font-medium">Total</th>
                  <th className="text-left p-3 text-gray-400 font-medium">Status</th>
                  <th className="text-left p-3 text-gray-400 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr
                    key={order.id}
                    className="border-b border-gray-800/50 hover:bg-gray-800/30"
                  >
                    <td className="p-3 text-gray-400">
                      {new Date(order.created_at).toLocaleDateString()}
                    </td>
                    <td className="p-3 text-white">{order.customer_email || '-'}</td>
                    <td className="p-3 text-gray-300">{order.items?.length || 0}</td>
                    <td className="p-3 text-white">
                      ${((order.total || 0) / 100).toFixed(2)}
                    </td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-0.5 text-xs rounded ${
                          statusColors[order.status] || 'bg-gray-600/20 text-gray-400'
                        }`}
                      >
                        {order.status}
                      </span>
                    </td>
                    <td className="p-3">
                      <button
                        onClick={() => openOrderDetail(order)}
                        className="text-purple-400 hover:text-purple-300 text-xs transition"
                      >
                        View Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Order Detail Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-white">Order Details</h2>
                <button
                  onClick={() => setSelectedOrder(null)}
                  className="text-gray-400 hover:text-white transition"
                >
                  X
                </button>
              </div>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-gray-400 text-sm mb-1">Customer</div>
                    <div className="text-white">{selectedOrder.customer_email}</div>
                    {selectedOrder.customer_name && (
                      <div className="text-gray-300 text-sm">{selectedOrder.customer_name}</div>
                    )}
                  </div>
                  <div>
                    <div className="text-gray-400 text-sm mb-1">Order Date</div>
                    <div className="text-white">
                      {new Date(selectedOrder.created_at).toLocaleString()}
                    </div>
                  </div>
                </div>

                <div>
                  <div className="text-gray-400 text-sm mb-1">Total</div>
                  <div className="text-green-400 font-bold text-lg">
                    ${((selectedOrder.total || 0) / 100).toFixed(2)}
                  </div>
                </div>

                {/* Items */}
                {selectedOrder.items && selectedOrder.items.length > 0 && (
                  <div>
                    <div className="text-gray-400 text-sm mb-2">Items</div>
                    <div className="space-y-2">
                      {selectedOrder.items.map((item: any, i: number) => (
                        <div
                          key={i}
                          className="flex items-center gap-3 bg-gray-800/50 rounded p-2"
                        >
                          {item.thumbnail && (
                            <img
                              src={item.thumbnail}
                              alt=""
                              className="w-10 h-10 object-cover rounded"
                            />
                          )}
                          <div className="flex-1">
                            <p className="text-white text-sm">{item.name || `Item ${i + 1}`}</p>
                            <p className="text-gray-400 text-xs">
                              {item.variant && `${item.variant} | `}Qty: {item.quantity || 1}
                            </p>
                          </div>
                          {item.price && (
                            <p className="text-white text-sm">
                              ${(item.price / 100).toFixed(2)}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Shipping Address */}
                {selectedOrder.shipping_address && (
                  <div>
                    <div className="text-gray-400 text-sm mb-1">Shipping Address</div>
                    <div className="text-white text-sm bg-gray-800/50 rounded p-3">
                      {selectedOrder.shipping_address.name && (
                        <div>{selectedOrder.shipping_address.name}</div>
                      )}
                      {selectedOrder.shipping_address.line1 && (
                        <div>{selectedOrder.shipping_address.line1}</div>
                      )}
                      {selectedOrder.shipping_address.line2 && (
                        <div>{selectedOrder.shipping_address.line2}</div>
                      )}
                      <div>
                        {selectedOrder.shipping_address.city},{' '}
                        {selectedOrder.shipping_address.state}{' '}
                        {selectedOrder.shipping_address.postal_code}
                      </div>
                      {selectedOrder.shipping_address.country && (
                        <div>{selectedOrder.shipping_address.country}</div>
                      )}
                    </div>
                  </div>
                )}

                {/* Status + Tracking Update */}
                <div className="border-t border-gray-800 pt-4">
                  <h3 className="text-white font-semibold mb-3">Update Order</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">Status</label>
                      <select
                        value={orderStatusEdit}
                        onChange={(e) => setOrderStatusEdit(e.target.value)}
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white text-sm focus:outline-none focus:border-purple-500"
                      >
                        <option value="pending">Pending</option>
                        <option value="processing">Processing</option>
                        <option value="shipped">Shipped</option>
                        <option value="delivered">Delivered</option>
                        <option value="canceled">Canceled</option>
                        <option value="failed">Failed</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">Tracking URL</label>
                      <input
                        type="text"
                        value={trackingEdit}
                        onChange={(e) => setTrackingEdit(e.target.value)}
                        placeholder="https://..."
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white text-sm focus:outline-none focus:border-purple-500"
                      />
                    </div>
                  </div>
                  <button
                    onClick={updateOrder}
                    disabled={updatingOrder}
                    className="mt-3 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 text-white text-sm font-semibold rounded-lg transition-all"
                  >
                    {updatingOrder ? 'Updating...' : 'Update Order'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
