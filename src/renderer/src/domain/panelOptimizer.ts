export interface PanelCutPlan {
  piecesMm: number[]
  usedWidthMm: number
  wasteMm: number
  label: string
}

export interface WallPanelOptimization {
  stockWidthMm: number
  kerfMm: number
  longWallRemainderMm: number
  shortWallRemainderMm: number
  longWallHasCut: boolean
  shortWallHasCut: boolean
  fullPanelCount: number
  cutPanelCount: number
  automaticPanelCount: number
  cutPlans: PanelCutPlan[]
  savingAgainstIndependentCount: number
}

interface Bin {
  piecesMm: number[]
  usedWidthMm: number
}

const roundMm = (value: number): number => (Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0)

function panelRun(spanMm: number, stockWidthMm: number): { panelCount: number; fullPanelCount: number; remainderMm: number; hasCut: boolean } {
  const safeSpanMm = Math.max(0, Number.isFinite(spanMm) ? spanMm : 0)
  const panelCount = Math.max(1, Math.ceil(Math.max(safeSpanMm, 1) / stockWidthMm))
  const fullPanelCount = Math.max(0, panelCount - 1)
  const remainderMm = Math.max(0, safeSpanMm - fullPanelCount * stockWidthMm)
  const hasCut = remainderMm > 1 && remainderMm < stockWidthMm - 1

  return {
    panelCount,
    fullPanelCount: hasCut ? fullPanelCount : panelCount,
    remainderMm: roundMm(remainderMm),
    hasCut
  }
}

function packCuts(piecesMm: number[], stockWidthMm: number, kerfMm: number): PanelCutPlan[] {
  const sortedPieces = [...piecesMm].map(roundMm).filter((piece) => piece > 0).sort((a, b) => b - a)
  if (sortedPieces.length === 0) {
    return []
  }

  let best: Bin[] | null = null
  const bins: Bin[] = []

  const search = (index: number): void => {
    if (best && bins.length >= best.length) {
      return
    }
    if (index >= sortedPieces.length) {
      best = bins.map((bin) => ({ piecesMm: [...bin.piecesMm], usedWidthMm: bin.usedWidthMm }))
      return
    }

    const piece = sortedPieces[index]
    const seenWidths = new Set<number>()
    for (let binIndex = 0; binIndex < bins.length; binIndex += 1) {
      const bin = bins[binIndex]
      if (seenWidths.has(bin.usedWidthMm)) {
        continue
      }
      seenWidths.add(bin.usedWidthMm)

      const extraWidth = bin.piecesMm.length > 0 ? kerfMm : 0
      if (bin.usedWidthMm + extraWidth + piece > stockWidthMm) {
        continue
      }

      bin.piecesMm.push(piece)
      bin.usedWidthMm += extraWidth + piece
      search(index + 1)
      bin.usedWidthMm -= extraWidth + piece
      bin.piecesMm.pop()
    }

    if (!best || bins.length + 1 < best.length) {
      bins.push({ piecesMm: [piece], usedWidthMm: piece })
      search(index + 1)
      bins.pop()
    }
  }

  search(0)
  const plans: Bin[] = best === null ? [] : best
  return plans.map((bin) => ({
    piecesMm: bin.piecesMm,
    usedWidthMm: bin.usedWidthMm,
    wasteMm: Math.max(0, stockWidthMm - bin.usedWidthMm),
    label: `${bin.piecesMm.join(' + ')} мм`
  }))
}

/**
 * Calculates the minimum number of wall panels after combining cut pieces.
 * All four walls use the same panel length, so their width leftovers can be
 * cut from one common stock panel. The exact search is intentionally small:
 * one chamber contributes at most four leftovers.
 */
export function optimizeWallPanels(
  longWallSpanMm: number,
  shortWallSpanMm: number,
  stockWidthMm: number,
  kerfMm = 0
): WallPanelOptimization {
  const safeStockWidthMm = Math.max(1, roundMm(stockWidthMm))
  const safeKerfMm = Math.max(0, roundMm(kerfMm))
  const longRun = panelRun(longWallSpanMm, safeStockWidthMm)
  const shortRun = panelRun(shortWallSpanMm, safeStockWidthMm)
  const remainders = [
    ...(longRun.hasCut ? [longRun.remainderMm, longRun.remainderMm] : []),
    ...(shortRun.hasCut ? [shortRun.remainderMm, shortRun.remainderMm] : [])
  ]
  const cutPlans = packCuts(remainders, safeStockWidthMm, safeKerfMm)
  const fullPanelCount = 2 * longRun.fullPanelCount + 2 * shortRun.fullPanelCount
  const independentCutPanelCount = remainders.length
  const automaticPanelCount = fullPanelCount + cutPlans.length

  return {
    stockWidthMm: safeStockWidthMm,
    kerfMm: safeKerfMm,
    longWallRemainderMm: longRun.remainderMm,
    shortWallRemainderMm: shortRun.remainderMm,
    longWallHasCut: longRun.hasCut,
    shortWallHasCut: shortRun.hasCut,
    fullPanelCount,
    cutPanelCount: cutPlans.length,
    automaticPanelCount,
    cutPlans,
    savingAgainstIndependentCount: Math.max(0, independentCutPanelCount - cutPlans.length)
  }
}
