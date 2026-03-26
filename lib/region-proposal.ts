/**
 * Region proposal algorithm — pure functions, no DOM.
 *
 * Proposes suspicious regions from forensic grid data (ELA, noise, edge).
 * Uses percentile-based adaptive thresholds, morphological erosion,
 * connected components, and cross-signal merging.
 */

import type { RegionGridCell } from "./forensic-algorithms"
import type { BoundingBox, ForensicRegion } from "./region-analysis"

// ── Helpers ─────────────────────────────────────────────────────────

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.floor((p / 100) * (sorted.length - 1))
  return sorted[idx]
}

function computeIoU(a: BoundingBox, b: BoundingBox): number {
  const x1 = Math.max(a.x, b.x)
  const y1 = Math.max(a.y, b.y)
  const x2 = Math.min(a.x + a.width, b.x + b.width)
  const y2 = Math.min(a.y + a.height, b.y + b.height)
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1)
  if (inter === 0) return 0
  const areaA = a.width * a.height
  const areaB = b.width * b.height
  return inter / (areaA + areaB - inter)
}

function centroid(box: BoundingBox): [number, number] {
  return [box.x + box.width / 2, box.y + box.height / 2]
}

// ── Per-frame proposals ─────────────────────────────────────────────

interface GridInput {
  cells: RegionGridCell[]
  analysisWidth: number
  analysisHeight: number
}

interface HotCell {
  rx: number
  ry: number
  startX: number
  startY: number
  endX: number
  endY: number
  signal: string
  intensity: number
}

function getHotCells(
  grid: GridInput | undefined,
  percentileThreshold: number,
  signal: string
): HotCell[] {
  if (!grid || grid.cells.length === 0) return []
  const deviations = grid.cells.map((c) => c.deviation)
  const threshold = percentile(deviations, percentileThreshold)
  return grid.cells
    .filter((c) => c.deviation >= threshold)
    .map((c) => ({
      rx: c.rx, ry: c.ry,
      startX: c.startX, startY: c.startY, endX: c.endX, endY: c.endY,
      signal,
      intensity: c.deviation,
    }))
}

function erodeHotCells(
  cells: HotCell[],
  maxRx: number,
  maxRy: number
): HotCell[] {
  const key = (rx: number, ry: number) => `${rx},${ry}`
  const hotSet = new Set(cells.map((c) => key(c.rx, c.ry)))

  return cells.filter((c) => {
    let neighbors = 0
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      const nx = c.rx + dx
      const ny = c.ry + dy
      if (nx >= 0 && nx <= maxRx && ny >= 0 && ny <= maxRy && hotSet.has(key(nx, ny))) {
        neighbors++
      }
    }
    return neighbors >= 2
  })
}

function floodFillComponents(cells: HotCell[]): HotCell[][] {
  const key = (rx: number, ry: number) => `${rx},${ry}`
  const cellMap = new Map<string, HotCell>()
  for (const c of cells) cellMap.set(key(c.rx, c.ry), c)

  const visited = new Set<string>()
  const components: HotCell[][] = []

  for (const cell of cells) {
    const k = key(cell.rx, cell.ry)
    if (visited.has(k)) continue

    const component: HotCell[] = []
    const queue = [cell]
    visited.add(k)

    while (queue.length > 0) {
      const cur = queue.pop()!
      component.push(cur)

      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
        const nk = key(cur.rx + dx, cur.ry + dy)
        if (!visited.has(nk) && cellMap.has(nk)) {
          visited.add(nk)
          queue.push(cellMap.get(nk)!)
        }
      }
    }

    components.push(component)
  }

  return components
}

function componentToBox(
  component: HotCell[],
  analysisWidth: number,
  analysisHeight: number
): { box: BoundingBox; avgIntensity: number; signals: Set<string> } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  let totalIntensity = 0
  const signals = new Set<string>()

  for (const c of component) {
    if (c.startX < minX) minX = c.startX
    if (c.startY < minY) minY = c.startY
    if (c.endX > maxX) maxX = c.endX
    if (c.endY > maxY) maxY = c.endY
    totalIntensity += c.intensity
    signals.add(c.signal)
  }

  return {
    box: {
      x: minX / analysisWidth,
      y: minY / analysisHeight,
      width: (maxX - minX) / analysisWidth,
      height: (maxY - minY) / analysisHeight,
    },
    avgIntensity: totalIntensity / component.length,
    signals,
  }
}

export function proposeRegionsForFrame(
  elaGrid: GridInput | undefined,
  noiseGrid: GridInput | undefined,
  edgeGrid: GridInput | undefined,
  imageWidth: number,
  imageHeight: number
): ForensicRegion[] {
  // Get hot cells from each signal
  const elaHot = getHotCells(elaGrid, 85, "ela")
  const noiseHot = getHotCells(noiseGrid, 90, "noise")
  const edgeHot = getHotCells(edgeGrid, 80, "edge")

  const analysisWidth = elaGrid?.analysisWidth ?? noiseGrid?.analysisWidth ?? edgeGrid?.analysisWidth ?? imageWidth
  const analysisHeight = elaGrid?.analysisHeight ?? noiseGrid?.analysisHeight ?? edgeGrid?.analysisHeight ?? imageHeight

  // Compute max grid indices for erosion
  const allCells = [...elaHot, ...noiseHot, ...edgeHot]
  if (allCells.length === 0) return []

  const maxRx = Math.max(...allCells.map((c) => c.rx))
  const maxRy = Math.max(...allCells.map((c) => c.ry))

  // Erosion: require ≥2 neighbors per signal
  const elaEroded = erodeHotCells(elaHot, maxRx, maxRy)
  const noiseEroded = erodeHotCells(noiseHot, maxRx, maxRy)
  const edgeEroded = erodeHotCells(edgeHot, maxRx, maxRy)

  // Connected components per signal
  const elaComponents = floodFillComponents(elaEroded)
  const noiseComponents = floodFillComponents(noiseEroded)
  const edgeComponents = floodFillComponents(edgeEroded)

  // Convert to boxes
  const allBoxes: Array<{ box: BoundingBox; elaIntensity: number; noiseIntensity: number; edgeIntensity: number; signals: Set<string> }> = []

  for (const comp of elaComponents) {
    const { box, avgIntensity, signals } = componentToBox(comp, analysisWidth, analysisHeight)
    allBoxes.push({ box, elaIntensity: avgIntensity, noiseIntensity: 0, edgeIntensity: 0, signals })
  }
  for (const comp of noiseComponents) {
    const { box, avgIntensity, signals } = componentToBox(comp, analysisWidth, analysisHeight)
    allBoxes.push({ box, elaIntensity: 0, noiseIntensity: avgIntensity, edgeIntensity: 0, signals })
  }
  for (const comp of edgeComponents) {
    const { box, avgIntensity, signals } = componentToBox(comp, analysisWidth, analysisHeight)
    allBoxes.push({ box, elaIntensity: 0, noiseIntensity: 0, edgeIntensity: avgIntensity, signals })
  }

  // Cross-signal merge: IoU > 0.3 AND centroids within 30% of image width
  const merged: typeof allBoxes = []
  const used = new Set<number>()

  for (let i = 0; i < allBoxes.length; i++) {
    if (used.has(i)) continue
    let current = { ...allBoxes[i], signals: new Set(allBoxes[i].signals) }

    for (let j = i + 1; j < allBoxes.length; j++) {
      if (used.has(j)) continue
      const iou = computeIoU(current.box, allBoxes[j].box)
      if (iou < 0.3) continue

      // Max merge distance check
      const [cx1, cy1] = centroid(current.box)
      const [cx2, cy2] = centroid(allBoxes[j].box)
      const dist = Math.sqrt((cx1 - cx2) ** 2 + (cy1 - cy2) ** 2)
      if (dist > 0.3) continue

      // Merge
      const minX = Math.min(current.box.x, allBoxes[j].box.x)
      const minY = Math.min(current.box.y, allBoxes[j].box.y)
      const maxX = Math.max(current.box.x + current.box.width, allBoxes[j].box.x + allBoxes[j].box.width)
      const maxY = Math.max(current.box.y + current.box.height, allBoxes[j].box.y + allBoxes[j].box.height)
      current = {
        box: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
        elaIntensity: Math.max(current.elaIntensity, allBoxes[j].elaIntensity),
        noiseIntensity: Math.max(current.noiseIntensity, allBoxes[j].noiseIntensity),
        edgeIntensity: Math.max(current.edgeIntensity, allBoxes[j].edgeIntensity),
        signals: new Set([...current.signals, ...allBoxes[j].signals]),
      }
      used.add(j)
    }

    merged.push(current)
  }

  // Score and filter
  const regions: ForensicRegion[] = []
  for (const m of merged) {
    const combinedIntensity = m.elaIntensity * 0.5 + m.noiseIntensity * 0.3 + m.edgeIntensity * 0.2
    const pixelW = m.box.width * imageWidth
    const pixelH = m.box.height * imageHeight
    const areaRatio = m.box.width * m.box.height
    const aspectRatio = pixelW / (pixelH || 1)

    // Sanity filters
    if (pixelW < 32 || pixelH < 32) continue           // too small
    if (aspectRatio > 5 || aspectRatio < 0.2) continue  // too thin
    if (combinedIntensity < 15) continue                 // too weak
    if (areaRatio > 0.4) continue                        // too large

    // Texture uniformity: skip if all cells have very similar intensity (boring region)
    const intensities = [m.elaIntensity, m.noiseIntensity, m.edgeIntensity].filter((v) => v > 0)
    if (intensities.length > 0) {
      const mean = intensities.reduce((a, b) => a + b, 0) / intensities.length
      const variance = intensities.reduce((a, v) => a + (v - mean) ** 2, 0) / intensities.length
      // Only skip if all signals are very weak AND uniform
      if (mean < 5 && variance < 1) continue
    }

    regions.push({
      box: m.box,
      elaIntensity: m.elaIntensity,
      noiseIntensity: m.noiseIntensity,
      edgeIntensity: m.edgeIntensity,
      combinedIntensity,
      pixelCount: Math.round(pixelW * pixelH),
      sourceSignals: [...m.signals],
    })
  }

  // Sort by intensity and return top 5
  regions.sort((a, b) => b.combinedIntensity - a.combinedIntensity)
  return regions.slice(0, 5)
}

// ── Multi-frame merge ───────────────────────────────────────────────

interface FrameProposal {
  frameIndex: number
  regions: ForensicRegion[]
}

export interface MergedRegion {
  box: BoundingBox
  combinedIntensity: number
  frameCount: number
  regionConsistency: number
  spatialVariance: number
  sourceSignals: string[]
  bestFrameIndex: number
}

export function mergeRegionsAcrossFrames(
  frameProposals: FrameProposal[],
  totalFramesAnalyzed: number
): MergedRegion[] {
  if (frameProposals.length === 0) return []

  // Flatten all proposals with frame index
  const all: Array<{ region: ForensicRegion; frameIndex: number }> = []
  for (const fp of frameProposals) {
    for (const r of fp.regions) {
      all.push({ region: r, frameIndex: fp.frameIndex })
    }
  }

  if (all.length === 0) return []

  // Group by IoU overlap across frames
  const groups: Array<Array<{ region: ForensicRegion; frameIndex: number }>> = []
  const used = new Set<number>()

  for (let i = 0; i < all.length; i++) {
    if (used.has(i)) continue
    const group = [all[i]]
    used.add(i)

    for (let j = i + 1; j < all.length; j++) {
      if (used.has(j)) continue
      // Check IoU against any member of the group
      const match = group.some((g) => computeIoU(g.region.box, all[j].region.box) > 0.3)
      if (match) {
        group.push(all[j])
        used.add(j)
      }
    }

    groups.push(group)
  }

  // Compute merged regions
  const merged: MergedRegion[] = []

  for (const group of groups) {
    const frameSet = new Set(group.map((g) => g.frameIndex))
    const frameCount = frameSet.size
    const regionConsistency = frameCount / Math.max(1, totalFramesAnalyzed)

    // Compute spatial variance of centroids
    const centroids = group.map((g) => centroid(g.region.box))
    const meanCx = centroids.reduce((a, c) => a + c[0], 0) / centroids.length
    const meanCy = centroids.reduce((a, c) => a + c[1], 0) / centroids.length
    const spatialVariance = centroids.reduce((a, c) =>
      a + Math.sqrt((c[0] - meanCx) ** 2 + (c[1] - meanCy) ** 2), 0
    ) / centroids.length

    // Stability check
    if (regionConsistency < 0.3 && spatialVariance > 0.15) continue

    // Top-K weighted box: use top 2 by intensity
    const sorted = [...group].sort((a, b) => b.region.combinedIntensity - a.region.combinedIntensity)
    const top2 = sorted.slice(0, 2)
    const totalW = top2.reduce((a, g) => a + g.region.combinedIntensity, 0)

    let finalBox: BoundingBox
    if (totalW > 0) {
      finalBox = {
        x: top2.reduce((a, g) => a + g.region.box.x * g.region.combinedIntensity, 0) / totalW,
        y: top2.reduce((a, g) => a + g.region.box.y * g.region.combinedIntensity, 0) / totalW,
        width: top2.reduce((a, g) => a + g.region.box.width * g.region.combinedIntensity, 0) / totalW,
        height: top2.reduce((a, g) => a + g.region.box.height * g.region.combinedIntensity, 0) / totalW,
      }
    } else {
      finalBox = top2[0].region.box
    }

    // Variance clamp on size
    if (group.length > 1) {
      const widths = group.map((g) => g.region.box.width)
      const heights = group.map((g) => g.region.box.height)
      const wMean = widths.reduce((a, b) => a + b, 0) / widths.length
      const hMean = heights.reduce((a, b) => a + b, 0) / heights.length
      const wVar = widths.reduce((a, w) => a + (w - wMean) ** 2, 0) / widths.length
      const hVar = heights.reduce((a, h) => a + (h - hMean) ** 2, 0) / heights.length
      if (wVar > 0.02 || hVar > 0.02) {
        finalBox.width *= 0.8
        finalBox.height *= 0.8
      }
    }

    // Collect source signals
    const allSignals = new Set<string>()
    for (const g of group) {
      for (const s of g.region.sourceSignals) allSignals.add(s)
    }

    // Best frame = highest intensity
    const bestFrame = sorted[0]

    merged.push({
      box: finalBox,
      combinedIntensity: sorted[0].region.combinedIntensity,
      frameCount,
      regionConsistency,
      spatialVariance,
      sourceSignals: [...allSignals],
      bestFrameIndex: bestFrame.frameIndex,
    })
  }

  // Sort by intensity * (1 + consistency), return top 5
  merged.sort((a, b) =>
    (b.combinedIntensity * (1 + b.regionConsistency)) -
    (a.combinedIntensity * (1 + a.regionConsistency))
  )

  return merged.slice(0, 5)
}
