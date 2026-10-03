import assert from 'node:assert/strict'
import test from 'node:test'
import { buildSplitPlan, calculateRequestResults, getCandidateKey, getEffectiveQuantity, MAX_REQUEST_QUANTITY } from '../src/packing.ts'
import { itemCatalog, boxCatalog } from '../src/catalog.ts'
import type { Candidate, PackUnit, RequestLine } from '../src/types.ts'

function line(itemId: string, quantity: number, unit: PackUnit = 'B'): RequestLine {
  return { id: 'request-test', itemId, unit, quantityInput: String(quantity), quantityInputHasInvalidChars: false }
}

function options(itemId: string, unit: PackUnit = 'B') {
  return boxCatalog.flatMap((box) => box.rules.filter((rule) => rule.itemId === itemId && rule.unit === unit)
    .map((rule): Candidate => ({ box, rule, distance: 1, kind: 'near' })))
}

for (const [quantity, expected] of [[100, [50, 50]], [101, [51, 50]]] as const) {
  test(`${quantity} items split evenly, with the largest box first`, () => {
    const plan = buildSplitPlan(options('151'), quantity)
    assert.deepEqual(plan?.steps.map((step) => step.assignedQuantity), expected)
  })
}

test('capacity limit is respected when more than two boxes are needed', () => {
  const template = options('151')[0]
  const candidate = { ...template, rule: { ...template.rule, quantity: { min: 1, max: 60 } } }
  assert.deepEqual(buildSplitPlan([candidate], 121)?.steps.map((step) => step.assignedQuantity), [41, 40, 40])
})

test('catalog gaps retain the minimum box count and a balanced remainder', () => {
  const plan = buildSplitPlan(options('151'), 1000)!
  assert.equal(plan.boxCount, 8)
  assert.deepEqual(plan.steps.map((step) => step.assignedQuantity), [152, 152, 152, 152, 152, 152, 44, 44])
})

for (const itemId of ['BBDX', 'WFDX']) {
  test(`${itemId} splits actual quantities rather than converted quantities`, () => {
    const result = calculateRequestResults([line(itemId, 1000)], true)[0]
    assert.equal(result.effectiveQuantity, 770)
    assert.equal(result.splitPlan?.boxCount, 9)
    assert.equal(result.splitPlanSteps.reduce((sum, step) => sum + step.assignedQuantity, 0), 1000)
    assert.deepEqual(result.splitPlanSteps.map((step) => step.assignedQuantity), [112, 111, 111, 111, 111, 111, 111, 111, 111])
    for (const step of result.splitPlanSteps) {
      assert.equal(step.effectiveQuantity, getEffectiveQuantity(step.assignedQuantity, 0.77))
      assert.ok(step.effectiveQuantity >= step.candidate.rule.quantity.min!)
      assert.ok(step.effectiveQuantity <= step.candidate.rule.quantity.max!)
    }
  })
}

test('decimal multipliers use integer arithmetic at rounding boundaries', () => {
  assert.equal(getEffectiveQuantity(100, 0.77), 77)
  assert.equal(getEffectiveQuantity(101, 0.77), 78)
})

test('invalid or excessive quantities do not enter the solver', () => {
  for (const quantity of [0, -1, 1.5, Infinity, NaN, MAX_REQUEST_QUANTITY + 1, 2 ** 32]) {
    assert.equal(buildSplitPlan(options('151'), quantity), null)
    assert.equal(calculateRequestResults([line('151', quantity)])[0].isComplete, false)
  }
})

test('lightweight input results do not calculate a split plan', () => {
  const result = calculateRequestResults([line('151', 101)])[0]
  assert.equal(result.quantity, 101)
  assert.equal(result.splitPlan, null)
  assert.equal(result.isComplete, true)
})

test('all catalog products conserve quantity and stay within per-box capacities', () => {
  for (const item of itemCatalog) {
    const unit = item.preferredUnit!
    const candidates = options(item.id, unit).filter((candidate) => candidate.rule.quantity.max !== null)
    if (!candidates.length) continue
    const quantity = 333
    const plan = buildSplitPlan(candidates, quantity, item.multiplier)
    if (!plan) continue
    assert.equal(plan.steps.reduce((sum, step) => sum + step.assignedQuantity, 0), quantity, item.id)
    for (const step of plan.steps) {
      assert.ok(step.assignedQuantity > 0)
      assert.ok(step.effectiveQuantity >= step.candidate.rule.quantity.min!, getCandidateKey(step.candidate))
      assert.ok(step.effectiveQuantity <= step.candidate.rule.quantity.max!, getCandidateKey(step.candidate))
    }
    assert.deepEqual(plan.steps.map((step) => step.assignedQuantity),
      plan.steps.map((step) => step.assignedQuantity).sort((a, b) => b - a))
  }
})

test('minimum box count and spread agree with exhaustive search for gapped capacities', () => {
  const template = options('151')[0]
  const candidates = [2, 5, 8].map((quantity, index): Candidate => ({
    ...template,
    box: { ...template.box, id: `synthetic-${index}`, order: index },
    rule: { ...template.rule, quantity: { min: quantity, max: quantity } },
  }))
  for (let total = 1; total <= 32; total += 1) {
    let bestCount = Infinity
    let bestSpread = Infinity
    for (let a = 0; a <= Math.floor(total / 2); a += 1) {
      for (let b = 0; b <= Math.floor(total / 5); b += 1) {
        const rest = total - 2 * a - 5 * b
        if (rest < 0 || rest % 8 !== 0) continue
        const c = rest / 8
        const quantities = [...Array(a).fill(2), ...Array(b).fill(5), ...Array(c).fill(8)] as number[]
        const count = quantities.length
        const spread = Math.max(...quantities) - Math.min(...quantities)
        if (count < bestCount || (count === bestCount && spread < bestSpread)) {
          bestCount = count
          bestSpread = spread
        }
      }
    }
    const plan = buildSplitPlan(candidates, total)
    if (bestCount === Infinity) assert.equal(plan, null)
    else {
      assert.equal(plan?.boxCount, bestCount, `count for ${total}`)
      assert.equal(Math.max(...plan!.steps.map((step) => step.assignedQuantity)) -
        Math.min(...plan!.steps.map((step) => step.assignedQuantity)), bestSpread, `spread for ${total}`)
    }
  }
})
