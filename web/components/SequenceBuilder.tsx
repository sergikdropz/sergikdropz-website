'use client'

import { useState, useCallback } from 'react'
import { useNotifications } from '@/contexts/NotificationContext'
import {
  FaPlus,
  FaTimes,
  FaGripVertical,
  FaEnvelope,
  FaCalendar,
  FaSpinner,
} from 'react-icons/fa'

export interface SequenceItem {
  id?: string
  days_offset: number
  template_id: string
  template_name: string
  subject: string
  sequence_order: number
}

interface Template {
  id: string
  name: string
  subject: string
  category: string
}

interface Props {
  sequences: SequenceItem[]
  onSequencesChange: (sequences: SequenceItem[]) => void
  templates: Template[]
  isLoading?: boolean
  onSave?: () => Promise<void>
}

export default function SequenceBuilder({
  sequences,
  onSequencesChange,
  templates,
  isLoading = false,
  onSave,
}: Props) {
  const { showNotification } = useNotifications()
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [isAddingSequence, setIsAddingSequence] = useState(false)
  const [newSequence, setNewSequence] = useState({
    days_offset: 0,
    template_id: '',
  })

  const handleAddSequence = () => {
    if (!newSequence.template_id) {
      showNotification('Select a template', 'error')
      return
    }

    const template = templates.find((t) => t.id === newSequence.template_id)
    if (!template) return

    const newSeq: SequenceItem = {
      template_id: newSequence.template_id,
      template_name: template.name,
      subject: template.subject,
      days_offset: newSequence.days_offset,
      sequence_order: sequences.length + 1,
    }

    const updated = [...sequences, newSeq].sort(
      (a, b) => a.days_offset - b.days_offset
    )

    // Recalculate order after sort
    updated.forEach((seq, idx) => {
      seq.sequence_order = idx + 1
    })

    onSequencesChange(updated)
    setNewSequence({ days_offset: 0, template_id: '' })
    setIsAddingSequence(false)
    showNotification('Sequence added', 'success')
  }

  const handleRemoveSequence = (index: number) => {
    const updated = sequences
      .filter((_, idx) => idx !== index)
      .map((seq, idx) => ({
        ...seq,
        sequence_order: idx + 1,
      }))

    onSequencesChange(updated)
    showNotification('Sequence removed', 'success')
  }

  const handleDragStart = (index: number) => {
    setDraggedIndex(index)
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (draggedIndex === null || draggedIndex === index) return

    const newSequences = [...sequences]
    const draggedSeq = newSequences[draggedIndex]
    newSequences.splice(draggedIndex, 1)
    newSequences.splice(index, 0, draggedSeq)

    // Recalculate order
    newSequences.forEach((seq, idx) => {
      seq.sequence_order = idx + 1
    })

    onSequencesChange(newSequences)
    setDraggedIndex(index)
  }

  const handleDragEnd = () => {
    setDraggedIndex(null)
  }

  const offsetLabel = (offset: number) => {
    if (offset === 0) return 'Release Day (T0)'
    if (offset > 0) return `${offset} day${offset !== 1 ? 's' : ''} after (T+${offset})`
    return `${Math.abs(offset)} day${offset !== -1 ? 's' : ''} before (T${offset})`
  }

  return (
    <div className="space-y-6">
      {/* Sequence List */}
      <div className="space-y-3">
        <h3 className="text-lg font-semibold">Email Sequence</h3>

        {sequences.length === 0 ? (
          <div className="bg-gray-800 border-2 border-dashed border-gray-700 rounded-lg p-8 text-center">
            <FaEnvelope className="text-4xl text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400 mb-4">No sequences yet. Add the first email to get started.</p>
            <button
              onClick={() => setIsAddingSequence(true)}
              className="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded font-medium inline-flex items-center gap-2 transition"
            >
              <FaPlus /> Add Sequence
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {sequences.map((seq, idx) => (
              <div
                key={idx}
                draggable
                onDragStart={() => handleDragStart(idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDragEnd={handleDragEnd}
                className={`bg-gray-800 border border-gray-700 rounded-lg p-4 transition cursor-move ${
                  draggedIndex === idx ? 'opacity-50 border-purple-500' : ''
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className="text-gray-500 mt-1">
                    <FaGripVertical />
                  </div>

                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="bg-purple-900 px-3 py-1 rounded text-sm font-bold text-purple-200">
                        {offsetLabel(seq.days_offset)}
                      </div>
                      <div className="text-sm text-gray-500">
                        Sequence {seq.sequence_order}
                      </div>
                    </div>

                    <p className="font-medium text-white mb-1">{seq.template_name}</p>
                    <p className="text-sm text-gray-400">{seq.subject}</p>
                  </div>

                  <button
                    onClick={() => handleRemoveSequence(idx)}
                    className="text-red-400 hover:text-red-300 p-2 transition"
                  >
                    <FaTimes />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Sequence Form */}
      {isAddingSequence ? (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <h4 className="font-semibold mb-4">Add Email Sequence</h4>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Email Template *</label>
              <select
                value={newSequence.template_id}
                onChange={(e) =>
                  setNewSequence({ ...newSequence, template_id: e.target.value })
                }
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-purple-500"
              >
                <option value="">Select template...</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} – {t.category}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Days Offset</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={newSequence.days_offset}
                  onChange={(e) =>
                    setNewSequence({
                      ...newSequence,
                      days_offset: parseInt(e.target.value, 10),
                    })
                  }
                  className="w-24 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-purple-500"
                />
                <span className="text-gray-400 text-sm">
                  {offsetLabel(newSequence.days_offset)}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Negative = before release, 0 = release day, Positive = days after
              </p>
            </div>

            <div className="flex gap-2 pt-4 border-t border-gray-700">
              <button
                onClick={handleAddSequence}
                className="flex-1 bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded font-medium transition"
              >
                Add Sequence
              </button>
              <button
                onClick={() => setIsAddingSequence(false)}
                className="flex-1 bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded font-medium transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setIsAddingSequence(true)}
          className="w-full border border-dashed border-gray-600 hover:border-gray-500 text-gray-400 hover:text-gray-300 py-3 rounded-lg transition flex items-center justify-center gap-2"
        >
          <FaPlus /> Add Another Sequence
        </button>
      )}

      {/* Save Button */}
      {onSave && sequences.length > 0 && (
        <button
          onClick={onSave}
          disabled={isLoading}
          className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-700 px-6 py-3 rounded-lg font-medium flex items-center justify-center gap-2 transition"
        >
          {isLoading && <FaSpinner className="animate-spin" />}
          Save Campaign Sequences
        </button>
      )}
    </div>
  )
}
