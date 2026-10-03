import { itemCatalog, boxCatalog } from './catalog.ts'
import type { BoxRule, Candidate, SplitPlan, SplitPlanStep, RequestLine, RequestResult, ResultKind } from './types.ts'

export function calculateRequestResults(requestLines: RequestLine[], includeSplits = false): RequestResult[] {
  return requestLines.map<RequestResult>((line) => {
    const item = itemCatalog.find((catalogItem) => catalogItem.id === line.itemId) ?? null
    const parsedQuantity = Number(line.quantityInput)
    const quantity = Number.isSafeInteger(parsedQuantity) && parsedQuantity > 0 && parsedQuantity <= MAX_REQUEST_QUANTITY ? parsedQuantity : 0
    const availableUnits = getItemUnits(line.itemId)
    const effectiveQuantity =
      item && quantity > 0
        ? getEffectiveQuantity(quantity, item.multiplier)
        : 0
    const relevantCandidates: Candidate[] =
      item && line.unit
        ? boxCatalog
            .flatMap((box) =>
              box.rules
                .filter((rule) => rule.itemId === item.id && rule.unit === line.unit)
                .map((rule) => {
                  const distance =
                    rule.quantity.min === null || rule.quantity.max === null
                      ? Number.POSITIVE_INFINITY
                      : getDistance(rule, effectiveQuantity)
                  const kind: ResultKind =
                    rule.quantity.min === null || rule.quantity.max === null
                      ? 'note'
                      : distance === 0
                        ? 'exact'
                        : 'near'

                  return {
                    box,
                    rule,
                    distance,
                    kind,
                  }
                }),
            )
            .sort((left, right) => left.box.order - right.box.order)
        : []

    const exactMatches = relevantCandidates.filter((candidate) => candidate.kind === 'exact')
    const noteMatches = relevantCandidates.filter((candidate) => candidate.kind === 'note')
    const nearbyMatches =
      exactMatches.length === 0
        ? relevantCandidates
            .filter((candidate) => candidate.kind === 'near')
            .sort((left, right) => {
              if (left.distance !== right.distance) {
                return left.distance - right.distance
              }

              return left.box.order - right.box.order
            })
            .slice(0, 6)
        : []
    const splitPlan =
      includeSplits && exactMatches.length === 0 ? buildSplitPlan(relevantCandidates, quantity, item?.multiplier) : null
    const splitPlanSteps = splitPlan
      ? [...splitPlan.steps].sort((left, right) => {
          if (left.assignedQuantity !== right.assignedQuantity) {
            return right.assignedQuantity - left.assignedQuantity
          }

          if (left.candidate.box.order !== right.candidate.box.order) {
            return left.candidate.box.order - right.candidate.box.order
          }

          return getCandidateKey(left.candidate).localeCompare(getCandidateKey(right.candidate))
        })
      : []
    const displayedCandidates = [...exactMatches, ...nearbyMatches, ...noteMatches]
    const defaultCandidate =
      exactMatches[0] ?? splitPlanSteps[0]?.candidate ?? displayedCandidates[0] ?? null
    const isEmpty = !line.itemId && !line.unit && line.quantityInput.trim() === ''
    const isComplete = Boolean(item && line.unit && quantity > 0 && !line.quantityInputHasInvalidChars)

    return {
      line,
      item,
      availableUnits,
      quantity,
      effectiveQuantity,
      relevantCandidates,
      exactMatches,
      noteMatches,
      nearbyMatches,
      splitPlan,
      splitPlanSteps,
      displayedCandidates,
      defaultCandidate,
      isComplete,
      isEmpty,
    }
  })
}

export function getDistance(rule: BoxRule, quantity: number) {
  const { min, max } = rule.quantity

  if (min === null || max === null) {
    return Number.POSITIVE_INFINITY
  }

  if (quantity < min) {
    return min - quantity
  }

  if (quantity > max) {
    return quantity - max
  }

  return 0
}

export function isNumericRule(rule: BoxRule): rule is BoxRule & { quantity: { min: number; max: number } } {
  return rule.quantity.min !== null && rule.quantity.max !== null
}

function compareSplitPlans(left: SplitPlan, right: SplitPlan) {
  if (left.boxCount !== right.boxCount) {
    return left.boxCount - right.boxCount
  }

  const leftOverallBalance = getSplitPlanOverallBalanceMetrics(left)
  const rightOverallBalance = getSplitPlanOverallBalanceMetrics(right)

  if (leftOverallBalance.largestSpread !== rightOverallBalance.largestSpread) {
    return leftOverallBalance.largestSpread - rightOverallBalance.largestSpread
  }

  if (
    leftOverallBalance.totalPairwiseDifference !==
    rightOverallBalance.totalPairwiseDifference
  ) {
    return (
      leftOverallBalance.totalPairwiseDifference -
      rightOverallBalance.totalPairwiseDifference
    )
  }

  const leftQuantitiesByCandidate = getSplitPlanQuantitiesByCandidate(left)
  const rightQuantitiesByCandidate = getSplitPlanQuantitiesByCandidate(right)
  const leftCandidateCountSignature =
    getSplitPlanCandidateCountSignature(leftQuantitiesByCandidate)
  const rightCandidateCountSignature =
    getSplitPlanCandidateCountSignature(rightQuantitiesByCandidate)

  if (leftCandidateCountSignature === rightCandidateCountSignature) {
    const leftBalance = getSplitPlanBalanceMetrics(leftQuantitiesByCandidate)
    const rightBalance = getSplitPlanBalanceMetrics(rightQuantitiesByCandidate)

    if (leftBalance.largestGroupSpread !== rightBalance.largestGroupSpread) {
      return leftBalance.largestGroupSpread - rightBalance.largestGroupSpread
    }

    if (leftBalance.totalPairwiseDifference !== rightBalance.totalPairwiseDifference) {
      return leftBalance.totalPairwiseDifference - rightBalance.totalPairwiseDifference
    }
  }

  if (Math.abs(left.totalVolumetricWeight - right.totalVolumetricWeight) > 0.0001) {
    return left.totalVolumetricWeight - right.totalVolumetricWeight
  }

  if (left.totalBoxOrder !== right.totalBoxOrder) {
    return left.totalBoxOrder - right.totalBoxOrder
  }

  const leftSignature = getCanonicalSplitPlanSignature(left)
  const rightSignature = getCanonicalSplitPlanSignature(right)

  return leftSignature.localeCompare(rightSignature)
}

function getSplitPlanOverallBalanceMetrics(plan: SplitPlan) {
  const sortedQuantities = [...plan.steps]
    .map((step) => step.assignedQuantity)
    .sort((left, right) => right - left)

  if (sortedQuantities.length < 2) {
    return {
      largestSpread: 0,
      totalPairwiseDifference: 0,
    }
  }

  let totalPairwiseDifference = 0

  for (let index = 0; index < sortedQuantities.length; index += 1) {
    for (
      let compareIndex = index + 1;
      compareIndex < sortedQuantities.length;
      compareIndex += 1
    ) {
      totalPairwiseDifference += sortedQuantities[index] - sortedQuantities[compareIndex]
    }
  }

  return {
    largestSpread: sortedQuantities[0] - sortedQuantities[sortedQuantities.length - 1],
    totalPairwiseDifference,
  }
}

function getSplitPlanQuantitiesByCandidate(plan: SplitPlan) {
  const quantitiesByCandidate = new Map<string, number[]>()

  for (const step of plan.steps) {
    const candidateKey = getCandidateKey(step.candidate)
    const quantities = quantitiesByCandidate.get(candidateKey)

    if (quantities) {
      quantities.push(step.assignedQuantity)
      continue
    }

    quantitiesByCandidate.set(candidateKey, [step.assignedQuantity])
  }

  return quantitiesByCandidate
}

function getSplitPlanCandidateCountSignature(quantitiesByCandidate: Map<string, number[]>) {
  return [...quantitiesByCandidate.entries()]
    .map(([candidateKey, quantities]) => `${candidateKey}:${quantities.length}`)
    .sort()
    .join('|')
}

function getSplitPlanBalanceMetrics(quantitiesByCandidate: Map<string, number[]>) {
  let largestGroupSpread = 0
  let totalPairwiseDifference = 0

  for (const quantities of quantitiesByCandidate.values()) {
    if (quantities.length < 2) {
      continue
    }

    const sortedQuantities = [...quantities].sort((left, right) => right - left)
    const spread = sortedQuantities[0] - sortedQuantities[sortedQuantities.length - 1]

    if (spread > largestGroupSpread) {
      largestGroupSpread = spread
    }

    for (let index = 0; index < sortedQuantities.length; index += 1) {
      for (
        let compareIndex = index + 1;
        compareIndex < sortedQuantities.length;
        compareIndex += 1
      ) {
        totalPairwiseDifference += sortedQuantities[index] - sortedQuantities[compareIndex]
      }
    }
  }

  return {
    largestGroupSpread,
    totalPairwiseDifference,
  }
}

function getCanonicalSplitPlanSignature(plan: SplitPlan) {
  return [...plan.steps]
    .sort((left, right) => {
      const leftCandidateKey = getCandidateKey(left.candidate)
      const rightCandidateKey = getCandidateKey(right.candidate)

      if (leftCandidateKey !== rightCandidateKey) {
        return leftCandidateKey.localeCompare(rightCandidateKey)
      }

      return right.assignedQuantity - left.assignedQuantity
    })
    .map((step) => `${getCandidateKey(step.candidate)}:${step.assignedQuantity}`)
    .join('|')
}

export const MAX_REQUEST_QUANTITY = 100_000

export function getEffectiveQuantity(quantity: number, multiplier = 1) {
  const scale = 1_000_000
  return Math.ceil((quantity * Math.round(multiplier * scale)) / scale)
}

type PackingOption = { candidate: Candidate; min: number; max: number }
type QuantityRange = { min: number; max: number }

function mergeRanges(ranges: QuantityRange[]) {
  const merged: QuantityRange[] = []
  for (const range of [...ranges].sort((a, b) => a.min - b.min)) {
    const previous = merged[merged.length - 1]
    if (previous && range.min <= previous.max + 1) {
      previous.max = Math.max(previous.max, range.max)
    } else {
      merged.push({ ...range })
    }
  }
  return merged
}

// Sliding minima over capacity intervals avoid enumerating every box quantity
// for every subtotal. Only minimum box counts are stored, not complete plans.
function minimumBoxCounts(options: PackingOption[], quantity: number, low = 1, high = quantity) {
  const ranges = mergeRanges(options
    .map((option) => ({ min: Math.max(low, option.min), max: Math.min(high, option.max) }))
    .filter((range) => range.min <= range.max))
  const unreachable = quantity + 1
  const counts = new Int32Array(quantity + 1).fill(unreachable)
  counts[0] = 0
  const queues = ranges.map(() => ({ values: new Int32Array(quantity + 1), head: 0, tail: 0 }))
  for (let total = 1; total <= quantity; total += 1) {
    for (let index = 0; index < ranges.length; index += 1) {
      const range = ranges[index]
      const queue = queues[index]
      const incoming = total - range.min
      if (incoming >= 0 && counts[incoming] < unreachable) {
        while (queue.tail > queue.head && counts[queue.values[queue.tail - 1]] >= counts[incoming]) {
          queue.tail -= 1
        }
        queue.values[queue.tail++] = incoming
      }
      while (queue.head < queue.tail && queue.values[queue.head] < total - range.max) {
        queue.head += 1
      }
      if (queue.head < queue.tail) {
        counts[total] = Math.min(counts[total], counts[queue.values[queue.head]] + 1)
      }
    }
  }
  return counts
}

function makePlan(steps: SplitPlanStep[]): SplitPlan {
  steps.sort((a, b) => b.assignedQuantity - a.assignedQuantity ||
    a.candidate.box.order - b.candidate.box.order ||
    getCandidateKey(a.candidate).localeCompare(getCandidateKey(b.candidate)))
  return {
    steps,
    boxCount: steps.length,
    totalVolumetricWeight: steps.reduce((sum, step) => sum + step.candidate.box.volumetricWeight, 0),
    totalBoxOrder: steps.reduce((sum, step) => sum + step.candidate.box.order, 0),
  }
}

function chooseCandidate(options: PackingOption[], quantity: number) {
  return options.filter((option) => option.min <= quantity && option.max >= quantity)
    .sort((a, b) => a.candidate.box.volumetricWeight - b.candidate.box.volumetricWeight ||
      a.candidate.box.order - b.candidate.box.order ||
      getCandidateKey(a.candidate).localeCompare(getCandidateKey(b.candidate)))[0]?.candidate
}

function reconstructPlan(
  options: PackingOption[], counts: Int32Array, quantity: number,
  multiplier: number, low = 1, high = quantity,
) {
  const steps: SplitPlanStep[] = []
  let remaining = quantity
  while (remaining > 0) {
    const boxCount = counts[remaining]
    const average = remaining / boxCount
    let chosenQuantity = 0
    let chosen: Candidate | undefined
    for (const option of options) {
      for (let assigned = Math.max(low, option.min); assigned <= Math.min(high, option.max, remaining); assigned += 1) {
        if (counts[remaining - assigned] !== boxCount - 1) continue
        const delta = Math.abs(assigned - average)
        const previousDelta = Math.abs(chosenQuantity - average)
        if (!chosen || delta < previousDelta ||
          (delta === previousDelta && (assigned > chosenQuantity ||
            (assigned === chosenQuantity && (option.candidate.box.volumetricWeight < chosen.box.volumetricWeight ||
              (option.candidate.box.volumetricWeight === chosen.box.volumetricWeight && option.candidate.box.order < chosen.box.order)))))) {
          chosen = option.candidate
          chosenQuantity = assigned
        }
      }
    }
    if (!chosen) return null
    steps.push({ candidate: chosen, assignedQuantity: chosenQuantity,
      effectiveQuantity: getEffectiveQuantity(chosenQuantity, multiplier) })
    remaining -= chosenQuantity
  }
  return makePlan(steps)
}

export function buildSplitPlan(candidates: Candidate[], quantity: number, multiplier = 1): SplitPlan | null {
  if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity > MAX_REQUEST_QUANTITY ||
    !Number.isFinite(multiplier) || multiplier <= 0) return null
  const scale = 1_000_000
  const factor = Math.round(multiplier * scale)
  if (factor <= 0) return null
  const options: PackingOption[] = candidates.filter((candidate) => isNumericRule(candidate.rule))
    .map((candidate) => ({
      candidate,
      min: Math.max(1, Math.floor(((candidate.rule.quantity.min! - 1) * scale) / factor) + 1),
      max: Math.min(quantity, Math.floor((candidate.rule.quantity.max! * scale) / factor)),
    })).filter((option) => option.min <= option.max)
  if (options.length === 0) return null

  const largestCapacity = Math.max(...options.map((option) => option.max))
  const lowerBoundCount = Math.ceil(quantity / largestCapacity)
  const smaller = Math.floor(quantity / lowerBoundCount)
  const larger = Math.ceil(quantity / lowerBoundCount)
  const smallCandidate = chooseCandidate(options, smaller)
  const largeCandidate = chooseCandidate(options, larger)
  if (smallCandidate && largeCandidate) {
    const remainder = quantity % lowerBoundCount
    return makePlan(Array.from({ length: lowerBoundCount }, (_, index) => {
      const assignedQuantity = index < remainder ? larger : smaller
      return { candidate: index < remainder ? largeCandidate : smallCandidate,
        assignedQuantity, effectiveQuantity: getEffectiveQuantity(assignedQuantity, multiplier) }
    }))
  }

  const counts = minimumBoxCounts(options, quantity)
  const boxCount = counts[quantity]
  if (boxCount > quantity) return null
  let best = reconstructPlan(options, counts, quantity, multiplier)
  if (!best) return null

  // Find the narrowest feasible quantity interval with the same minimum box
  // count. This preserves balanced allocations even when catalog ranges have gaps.
  for (let high = Math.ceil(quantity / boxCount); high <= largestCapacity; high += 1) {
    if (!options.some((option) => option.min <= high && option.max >= high)) continue
    const spread = getSplitPlanOverallBalanceMetrics(best).largestSpread
    let low = Math.max(1, high - spread)
    let upper = Math.floor(quantity / boxCount)
    let feasibleLow = 0
    let feasibleCounts: Int32Array | null = null
    while (low <= upper) {
      const middle = Math.floor((low + upper) / 2)
      const restricted = minimumBoxCounts(options, quantity, middle, high)
      if (restricted[quantity] === boxCount) {
        feasibleLow = middle
        feasibleCounts = restricted
        low = middle + 1
      } else {
        upper = middle - 1
      }
    }
    if (feasibleCounts) {
      const plan = reconstructPlan(options, feasibleCounts, quantity, multiplier, feasibleLow, high)
      if (plan && compareSplitPlans(plan, best) < 0) best = plan
    }
  }
  return best
}

export function getItemUnits(itemId: string | null) {
  if (!itemId) {
    return []
  }

  return Array.from(
    new Set(
      boxCatalog.flatMap((box) =>
        box.rules.filter((rule) => rule.itemId === itemId).map((rule) => rule.unit),
      ),
    ),
  )
}

export function getCandidateKey(candidate: Candidate) {
  const { box, rule, kind } = candidate

  return [
    kind,
    box.id,
    rule.itemId,
    rule.unit,
    rule.source,
    rule.quantity.min ?? 'none',
    rule.quantity.max ?? 'none',
    rule.note ?? 'none',
  ].join('::')
}

export function findSplitStepIndex(
  result: RequestResult | null,
  candidateKey: string | null,
  preferredIndex: number | null = null,
) {
  if (!result || !candidateKey || result.splitPlanSteps.length === 0) {
    return null
  }

  if (
    preferredIndex !== null &&
    preferredIndex >= 0 &&
    preferredIndex < result.splitPlanSteps.length &&
    getCandidateKey(result.splitPlanSteps[preferredIndex].candidate) === candidateKey
  ) {
    return preferredIndex
  }

  const matchedIndex = result.splitPlanSteps.findIndex(
    (step) => getCandidateKey(step.candidate) === candidateKey,
  )

  return matchedIndex >= 0 ? matchedIndex : null
}

export function getBoardTargetKey(
  result: RequestResult | null,
  candidate: Candidate | null,
  splitStepIndex: number | null,
) {
  if (!result || !candidate) {
    return null
  }

  if (splitStepIndex !== null) {
    return `${result.line.id}::${result.quantity}::${result.line.unit}::split::${splitStepIndex}::${getCandidateKey(candidate)}`
  }

  return `${result.line.id}::${result.quantity}::${result.line.unit}::candidate::${getCandidateKey(candidate)}`
}
