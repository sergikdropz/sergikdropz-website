'use client'

import { useNotifications } from '@/contexts/NotificationContext'
import { FaCheckCircle, FaExclamationTriangle, FaInfoCircle, FaTimes } from 'react-icons/fa'

export default function NotificationToast() {
  const { notifications, removeNotification } = useNotifications()

  if (notifications.length === 0) return null

  return (
    <div className="fixed top-20 right-4 z-50 space-y-2">
      {notifications.map((notification) => {
        const Icon =
          notification.type === 'success'
            ? FaCheckCircle
            : notification.type === 'error'
            ? FaExclamationTriangle
            : FaInfoCircle

        const bgColor =
          notification.type === 'success'
            ? 'bg-green-900/90 border-green-700'
            : notification.type === 'error'
            ? 'bg-red-900/90 border-red-700'
            : notification.type === 'warning'
            ? 'bg-yellow-900/90 border-yellow-700'
            : 'bg-blue-900/90 border-blue-700'

        const iconColor =
          notification.type === 'success'
            ? 'text-green-400'
            : notification.type === 'error'
            ? 'text-red-400'
            : notification.type === 'warning'
            ? 'text-yellow-400'
            : 'text-blue-400'

        return (
          <div
            key={notification.id}
            className={`${bgColor} border rounded-lg p-4 min-w-[300px] max-w-[400px] shadow-lg backdrop-blur-sm flex items-start gap-3 animate-in slide-in-from-right`}
          >
            <Icon className={`${iconColor} flex-shrink-0 mt-0.5`} />
            <div className="flex-1 text-sm text-white">{notification.message}</div>
            <button
              onClick={() => removeNotification(notification.id)}
              className="text-gray-400 hover:text-white flex-shrink-0"
            >
              <FaTimes />
            </button>
          </div>
        )
      })}
    </div>
  )
}
