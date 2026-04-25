'use client'

import { ReactNode } from 'react'
import { FaTrash, FaSync, FaLink } from 'react-icons/fa'

interface BulkOperationsPanelProps {
  selectedCount: number
  onBulkDelete?: () => void
  onBulkAnalyze?: () => void
  onBulkLink?: () => void
  customActions?: Array<{
    label: string
    icon: ReactNode
    action: () => void
    variant?: 'danger' | 'primary' | 'secondary'
  }>
}

export default function BulkOperationsPanel({
  selectedCount,
  onBulkDelete,
  onBulkAnalyze,
  onBulkLink,
  customActions,
}: BulkOperationsPanelProps) {
  if (selectedCount === 0) return null

  return (
    <div className="bg-purple-900/20 border border-purple-700 rounded-lg p-4 mb-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-purple-300">
          {selectedCount} item{selectedCount !== 1 ? 's' : ''} selected
        </div>
        <div className="flex gap-2">
          {onBulkAnalyze && (
            <button
              onClick={onBulkAnalyze}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2"
            >
              <FaSync />
              Analyze
            </button>
          )}
          {onBulkLink && (
            <button
              onClick={onBulkLink}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2"
            >
              <FaLink />
              Link
            </button>
          )}
          {onBulkDelete && (
            <button
              onClick={onBulkDelete}
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2"
            >
              <FaTrash />
              Delete
            </button>
          )}
          {customActions?.map((action, idx) => (
            <button
              key={idx}
              onClick={action.action}
              className={`${
                action.variant === 'danger'
                  ? 'bg-red-600 hover:bg-red-700'
                  : action.variant === 'primary'
                  ? 'bg-purple-600 hover:bg-purple-700'
                  : 'bg-gray-600 hover:bg-gray-700'
              } text-white px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2`}
            >
              {action.icon}
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
