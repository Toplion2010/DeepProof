"use client"

import type { SuspiciousRegion } from "@/lib/region-analysis"

interface RegionOverlayProps {
  imageSrc: string
  regions: SuspiciousRegion[]
  onRegionClick?: (region: SuspiciousRegion) => void
  selectedRegionId?: number
}

const COLOR_MAP = {
  red: { stroke: "#ef4444", fill: "rgba(239,68,68,0.1)" },
  orange: { stroke: "#f97316", fill: "rgba(249,115,22,0.1)" },
  gray: { stroke: "#6b7280", fill: "rgba(107,114,128,0.1)" },
}

export function RegionOverlay({ imageSrc, regions, onRegionClick, selectedRegionId }: RegionOverlayProps) {
  return (
    <div className="relative inline-block w-full">
      <img
        src={imageSrc}
        alt="Frame with region overlay"
        className="w-full rounded-md"
      />
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 1 1"
        preserveAspectRatio="none"
      >
        {regions.map((region) => {
          const colors = COLOR_MAP[region.colorClass]
          const isSelected = selectedRegionId === region.id
          return (
            <g key={region.id}>
              <rect
                x={region.box.x}
                y={region.box.y}
                width={region.box.width}
                height={region.box.height}
                fill={colors.fill}
                stroke={colors.stroke}
                strokeWidth={isSelected ? 0.006 : 0.003}
                className="cursor-pointer"
                onClick={() => onRegionClick?.(region)}
              />
              {/* Label background */}
              <rect
                x={region.box.x}
                y={Math.max(0, region.box.y - 0.03)}
                width={0.08}
                height={0.025}
                fill={colors.stroke}
                rx={0.003}
              />
              {/* Label text */}
              <text
                x={region.box.x + 0.005}
                y={Math.max(0.018, region.box.y - 0.01)}
                fill="white"
                fontSize="0.016"
                fontWeight="bold"
                fontFamily="system-ui, sans-serif"
              >
                #{region.id + 1} {region.finalConfidence}%
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
