'use client'

import { useCallback, useState, type DragEvent } from 'react'

export const MERCH_ART_ACCEPT = 'image/png,image/jpeg'

export function isMerchArtFile(file: File): boolean {
  const type = file.type || ''
  if (type === 'image/png' || type === 'image/jpeg') return true
  const name = file.name.toLowerCase()
  return name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg')
}

export function pickMerchArtFile(dataTransfer: DataTransfer): File | null {
  const files = dataTransfer.files
  if (files?.length) {
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      if (file && isMerchArtFile(file)) return file
    }
  }
  for (const item of dataTransfer.items) {
    if (item.kind !== 'file') continue
    const file = item.getAsFile()
    if (file && isMerchArtFile(file)) return file
  }
  return null
}

export function useMerchArtDropUpload(onUploadFile: (file: File) => void) {
  const [dragOver, setDragOver] = useState(false)
  const [dropHint, setDropHint] = useState<string | null>(null)

  const onDragEnter = useCallback((event: DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
    if (event.dataTransfer.types.includes('Files')) setDragOver(true)
  }, [])

  const onDragOver = useCallback((event: DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'copy'
    setDragOver(true)
  }, [])

  const onDragLeave = useCallback((event: DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
    const next = event.relatedTarget
    if (next && event.currentTarget.contains(next as Node)) return
    setDragOver(false)
  }, [])

  const onDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault()
      event.stopPropagation()
      setDragOver(false)
      const file = pickMerchArtFile(event.dataTransfer)
      if (file) {
        setDropHint(null)
        onUploadFile(file)
        return
      }
      if (event.dataTransfer.files?.length) {
        setDropHint('Only PNG or JPEG artwork can be dropped here.')
        window.setTimeout(() => setDropHint(null), 3500)
      }
    },
    [onUploadFile],
  )

  return {
    dragOver,
    dropHint,
    dropZoneProps: { onDragEnter, onDragOver, onDragLeave, onDrop },
  }
}
