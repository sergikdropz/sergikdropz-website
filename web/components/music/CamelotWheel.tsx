'use client'

import { useState, useMemo, memo } from 'react'
import { CAMELOT_KEYS, getCompatibleKeys } from '@/types/sergik-data'

interface CamelotWheelProps {
  activeKey?: string | null
  onKeySelect?: (key: string) => void
  keyDistribution?: Record<string, number>
  size?: 'sm' | 'md' | 'lg'
  showLabels?: boolean
  interactive?: boolean
}

// Camelot wheel positions (clock positions, starting at 12 o'clock)
const WHEEL_POSITIONS: Record<string, { angle: number; ring: 'inner' | 'outer' }> = {
  // Inner ring (minor keys - A)
  '1A': { angle: 0, ring: 'inner' },
  '2A': { angle: 30, ring: 'inner' },
  '3A': { angle: 60, ring: 'inner' },
  '4A': { angle: 90, ring: 'inner' },
  '5A': { angle: 120, ring: 'inner' },
  '6A': { angle: 150, ring: 'inner' },
  '7A': { angle: 180, ring: 'inner' },
  '8A': { angle: 210, ring: 'inner' },
  '9A': { angle: 240, ring: 'inner' },
  '10A': { angle: 270, ring: 'inner' },
  '11A': { angle: 300, ring: 'inner' },
  '12A': { angle: 330, ring: 'inner' },
  // Outer ring (major keys - B)
  '1B': { angle: 0, ring: 'outer' },
  '2B': { angle: 30, ring: 'outer' },
  '3B': { angle: 60, ring: 'outer' },
  '4B': { angle: 90, ring: 'outer' },
  '5B': { angle: 120, ring: 'outer' },
  '6B': { angle: 150, ring: 'outer' },
  '7B': { angle: 180, ring: 'outer' },
  '8B': { angle: 210, ring: 'outer' },
  '9B': { angle: 240, ring: 'outer' },
  '10B': { angle: 270, ring: 'outer' },
  '11B': { angle: 300, ring: 'outer' },
  '12B': { angle: 330, ring: 'outer' },
}

// SERGIK's preferred keys
const SERGIK_PREFERRED_KEYS = ['10B', '11B', '7A', '8A']

function CamelotWheel({
  activeKey,
  onKeySelect,
  keyDistribution = {},
  size = 'md',
  showLabels = true,
  interactive = true,
}: CamelotWheelProps) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null)

  // Size configurations
  const sizeConfig = useMemo(() => {
    switch (size) {
      case 'sm':
        return { width: 200, outerRadius: 90, innerRadius: 55, segmentWidth: 32, fontSize: 10 }
      case 'lg':
        return { width: 400, outerRadius: 180, innerRadius: 110, segmentWidth: 65, fontSize: 14 }
      default:
        return { width: 300, outerRadius: 135, innerRadius: 82, segmentWidth: 48, fontSize: 12 }
    }
  }, [size])

  const { width, outerRadius, innerRadius, segmentWidth, fontSize } = sizeConfig
  const center = width / 2

  // Get compatible keys for highlighting
  const compatibleKeys = useMemo(() => {
    if (hoveredKey) return new Set(getCompatibleKeys(hoveredKey))
    if (activeKey) return new Set(getCompatibleKeys(activeKey))
    return new Set<string>()
  }, [hoveredKey, activeKey])

  // Calculate segment path
  const getSegmentPath = (key: string) => {
    const pos = WHEEL_POSITIONS[key]
    if (!pos) return ''

    const radius = pos.ring === 'outer' ? outerRadius : innerRadius
    const startRadius = pos.ring === 'outer' ? innerRadius + 2 : innerRadius - segmentWidth
    
    const startAngle = ((pos.angle - 15) * Math.PI) / 180
    const endAngle = ((pos.angle + 15) * Math.PI) / 180

    const x1 = center + startRadius * Math.sin(startAngle)
    const y1 = center - startRadius * Math.cos(startAngle)
    const x2 = center + radius * Math.sin(startAngle)
    const y2 = center - radius * Math.cos(startAngle)
    const x3 = center + radius * Math.sin(endAngle)
    const y3 = center - radius * Math.cos(endAngle)
    const x4 = center + startRadius * Math.sin(endAngle)
    const y4 = center - startRadius * Math.cos(endAngle)

    return `M ${x1} ${y1} L ${x2} ${y2} A ${radius} ${radius} 0 0 1 ${x3} ${y3} L ${x4} ${y4} A ${startRadius} ${startRadius} 0 0 0 ${x1} ${y1}`
  }

  // Get label position
  const getLabelPosition = (key: string) => {
    const pos = WHEEL_POSITIONS[key]
    if (!pos) return { x: 0, y: 0 }

    const radius = pos.ring === 'outer' 
      ? (innerRadius + outerRadius) / 2 + 2
      : innerRadius - segmentWidth / 2
    
    const angle = (pos.angle * Math.PI) / 180
    return {
      x: center + radius * Math.sin(angle),
      y: center - radius * Math.cos(angle),
    }
  }

  // Get fill color
  const getFillColor = (key: string) => {
    const isActive = key === activeKey || key === hoveredKey
    const isCompatible = compatibleKeys.has(key)
    const isPreferred = SERGIK_PREFERRED_KEYS.includes(key)
    const distribution = keyDistribution[key] || 0
    const isMajor = key.includes('B')

    // Base color
    let baseColor = isMajor ? 'rgb(16, 185, 129)' : 'rgb(139, 92, 246)' // emerald vs violet

    if (isActive) {
      return isMajor ? 'rgb(52, 211, 153)' : 'rgb(167, 139, 250)' // Lighter when active
    }
    
    if (isCompatible) {
      return isMajor ? 'rgba(16, 185, 129, 0.6)' : 'rgba(139, 92, 246, 0.6)'
    }

    if (isPreferred) {
      return isMajor ? 'rgba(16, 185, 129, 0.4)' : 'rgba(139, 92, 246, 0.4)'
    }

    // Dim based on distribution
    const opacity = distribution > 0 ? Math.min(0.3 + distribution * 0.03, 0.8) : 0.15
    return isMajor 
      ? `rgba(16, 185, 129, ${opacity})` 
      : `rgba(139, 92, 246, ${opacity})`
  }

  return (
    <div className="relative">
      <svg
        width={width}
        height={width}
        viewBox={`0 0 ${width} ${width}`}
        className="transform -rotate-90"
      >
        {/* Background circle */}
        <circle
          cx={center}
          cy={center}
          r={outerRadius + 5}
          fill="none"
          stroke="rgb(55, 65, 81)"
          strokeWidth="1"
        />

        {/* Key segments */}
        {Object.keys(WHEEL_POSITIONS).map((key) => {
          const keyInfo = CAMELOT_KEYS[key]
          const pos = getLabelPosition(key)
          const isActive = key === activeKey
          const isHovered = key === hoveredKey
          const isCompatible = compatibleKeys.has(key)

          return (
            <g key={key}>
              <path
                d={getSegmentPath(key)}
                fill={getFillColor(key)}
                stroke={isActive || isHovered ? 'white' : 'rgb(55, 65, 81)'}
                strokeWidth={isActive || isHovered ? 2 : 0.5}
                className={interactive ? 'cursor-pointer transition-all duration-150' : ''}
                onMouseEnter={() => interactive && setHoveredKey(key)}
                onMouseLeave={() => interactive && setHoveredKey(null)}
                onClick={() => interactive && onKeySelect?.(key)}
              />
              
              {showLabels && (
                <text
                  x={pos.x}
                  y={pos.y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={fontSize}
                  fontWeight={isActive || isHovered ? 'bold' : 'normal'}
                  fill={isActive || isHovered || isCompatible ? 'white' : 'rgb(156, 163, 175)'}
                  className="transform rotate-90 pointer-events-none select-none"
                  style={{ transformOrigin: `${pos.x}px ${pos.y}px` }}
                >
                  {key}
                </text>
              )}
            </g>
          )
        })}

        {/* Center label */}
        <text
          x={center}
          y={center}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={fontSize + 2}
          fontWeight="bold"
          fill="rgb(156, 163, 175)"
          className="transform rotate-90 pointer-events-none"
          style={{ transformOrigin: `${center}px ${center}px` }}
        >
          {activeKey || hoveredKey || 'KEY'}
        </text>
      </svg>

      {/* Legend */}
      {showLabels && (
        <div className="absolute bottom-0 left-0 right-0 flex justify-center gap-4 text-xs text-gray-400 mt-2">
          <div className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full bg-emerald-500/50"></span>
            <span>Major</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full bg-violet-500/50"></span>
            <span>Minor</span>
          </div>
        </div>
      )}

      {/* Hover info */}
      {(hoveredKey || activeKey) && (
        <div className="absolute -bottom-8 left-0 right-0 text-center text-sm">
          <span className="text-gray-300">
            {CAMELOT_KEYS[hoveredKey || activeKey || '']?.name || ''}
          </span>
          {hoveredKey && compatibleKeys.size > 0 && (
            <span className="ml-2 text-gray-500">
              → {Array.from(compatibleKeys).slice(0, 3).join(', ')}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

export default memo(CamelotWheel)
