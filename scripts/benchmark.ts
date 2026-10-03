import { performance } from 'node:perf_hooks'
import { calculateRequestResults } from '../src/packing.ts'

for (const quantity of [1000, 10_000, 100_000]) {
  const start = performance.now()
  const [result] = calculateRequestResults([{
    id: 'benchmark', itemId: '151', unit: 'B', quantityInput: String(quantity), quantityInputHasInvalidChars: false,
  }], true)
  console.log(JSON.stringify({ quantity, boxes: result.splitPlan?.boxCount, milliseconds: Math.round(performance.now() - start) }))
}
