'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

interface ChartContainerProps {
  children: ReactNode
  minHeight?: number
  className?: string
}

export default function ChartContainer({
  children,
  minHeight = 200,
  className = '',
}: ChartContainerProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const element = ref.current
    if (!element) return

    const check = () => {
      const { width, height } = element.getBoundingClientRect()
      setReady(width > 0 && height > 0)
    }

    check()

    const observer = new ResizeObserver(() => {
      check()
    })

    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={ref} style={{ minHeight }} className={className}>
      {ready ? children : null}
    </div>
  )
}
