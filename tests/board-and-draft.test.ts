import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateRequestResults, getBoardTargetKey } from '../src/packing.ts'
import { createBoardEditorState, createBoardStore, getBoardEditor, updateBoardStore, removeBoardTargets } from '../src/boardState.ts'
import { drawShippingBoard, formatBoardWeight, getBoardLayout, getBoardProductLines } from '../src/boardDrawing.ts'
import { parseDraft, readDraft, saveDraft } from '../src/draft.ts'
import { uiCopy } from '../src/i18n.ts'
import type { Draft, RequestLine } from '../src/types.ts'

const line: RequestLine = { id: 'request-test', itemId: '151', unit: 'B', quantityInput: '101', quantityInputHasInvalidChars: false }
const result = calculateRequestResults([line], true)[0]
const [first, second] = result.splitPlanSteps
const firstKey = getBoardTargetKey(result, first.candidate, 0)!
const secondKey = getBoardTargetKey(result, second.candidate, 1)!

function draft(): Draft {
  return { version: 1, requestLines: [line], boardStore: createBoardStore(), language: 'ja',
    fontScale: 16, activeStep: 'result', selectedResultLineId: line.id,
    selectedCandidateKey: null, selectedSplitStepIndex: 0 }
}

test('measured weight starts empty instead of being populated with volumetric weight', () => {
  const editor = createBoardEditorState(createBoardStore().lastEditor, first.candidate, 0)
  assert.equal(editor.weightInput, '')
  assert.equal(editor.packageIndex, '1')
  assert.equal(formatBoardWeight('', '未入力'), '未入力')
  assert.equal(formatBoardWeight('-1', '未入力'), '未入力')
  assert.equal(formatBoardWeight('0', '未入力'), '未入力')
  assert.equal(formatBoardWeight('2.35', '未入力'), '2.35kg')
})

test('each split box retains its own edits through switching and JSON restoration', () => {
  let store = updateBoardStore(createBoardStore(), firstKey, first.candidate, 0,
    (current) => ({ ...current, packerName: 'A', recipientName: 'Customer A', weightInput: '2.35', outerSizeInputs: ['31', '32', '33'] }))
  assert.equal(getBoardEditor(store, secondKey, second.candidate, 1).weightInput, '')
  store = updateBoardStore(store, secondKey, second.candidate, 1,
    (current) => ({ ...current, recipientName: 'Customer B', weightInput: '3.25' }))
  const restored = parseDraft(JSON.stringify({ ...draft(), boardStore: store }))!
  assert.ok(restored)
  const a = getBoardEditor(restored.boardStore, firstKey, first.candidate, 0)
  const b = getBoardEditor(restored.boardStore, secondKey, second.candidate, 1)
  assert.equal(a.recipientName, 'Customer A')
  assert.equal(a.weightInput, '2.35')
  assert.deepEqual(a.outerSizeInputs, ['31', '32', '33'])
  assert.equal(b.recipientName, 'Customer B')
  assert.equal(b.weightInput, '3.25')
  assert.equal(b.packageIndex, '2')
})

test('a changed order quantity gets a new board target', () => {
  const updated = calculateRequestResults([{ ...line, quantityInput: '100' }], true)[0]
  assert.notEqual(getBoardTargetKey(updated, updated.splitPlanSteps[0].candidate, 0), firstKey)
})

test('deleting an item removes only its board entries', () => {
  const store = updateBoardStore(createBoardStore(), firstKey, first.candidate, 0, (current) => current)
  store.byTarget['another-item::test'] = { ...store.lastEditor, recipientName: 'keep' }
  const next = removeBoardTargets(store, line.id)
  assert.equal(next.byTarget[firstKey], undefined)
  assert.equal(next.byTarget['another-item::test'].recipientName, 'keep')
})

test('all six products are rendered on the board and canvas grows to fit them', () => {
  const results = calculateRequestResults(Array.from({ length: 6 }, (_, index) => ({ ...line, id: `request-${index}` })), true)
  const productLines = getBoardProductLines(results, results[0].line.id, results[0].splitPlanSteps[0])
  assert.equal(productLines.length, 6)
  assert.equal(productLines[0], '151 x 51B')
  assert.equal(productLines[5], '151 x 101B')
  const drawn: { text: string; y: number }[] = []
  const context = {
    clearRect() {}, fillRect() {}, beginPath() {}, ellipse() {}, stroke() {},
    createLinearGradient() { return { addColorStop() {} } },
    measureText(text: string) { return { width: text.length * 8 } },
    fillText(text: string, _x: number, y: number) { drawn.push({ text, y }) },
  } as unknown as CanvasRenderingContext2D
  const layout = getBoardLayout(560, productLines.length)
  drawShippingBoard(context, 560, layout.height, {
    recipient: 'Test', packerMark: 'A', modeMark: '国内', boxLabel: '11#1',
    weightText: '未入力', outerSizeText: '31, 32, 33', productLines,
  })
  assert.equal(drawn.filter((entry) => entry.text.startsWith('151 x ')).length, 6)
  assert.ok(drawn.every((entry) => entry.y < layout.height))
  assert.ok(layout.height > getBoardLayout(560, 4).height)
})

test('converted products use actual per-box quantities on the board', () => {
  const [converted] = calculateRequestResults([{ ...line, itemId: 'BBDX', quantityInput: '1000' }], true)
  assert.deepEqual(getBoardProductLines([converted], line.id, converted.splitPlanSteps[0]), ['BBDX x 112B'])
})

test('long product names can be shortened without hiding the quantity', () => {
  const drawn: string[] = []
  const context = {
    clearRect() {}, fillRect() {}, beginPath() {}, ellipse() {}, stroke() {},
    createLinearGradient() { return { addColorStop() {} } },
    measureText(text: string) { return { width: text.length * 20 } },
    fillText(text: string) { drawn.push(text) },
  } as unknown as CanvasRenderingContext2D
  drawShippingBoard(context, 375, getBoardLayout(375, 1).height, {
    recipient: 'Test', packerMark: 'A', modeMark: '', boxLabel: '11#1',
    weightText: '未入力', outerSizeText: '31, 32, 33',
    productLines: ['ワンピースストレージBOXセット・商品名が長い場合 x 123B'],
  })
  assert.ok(drawn.some((text) => text.endsWith(' x 123B') && text.includes('…')))
})

test('invalid, old-version or corrupt drafts are ignored', () => {
  assert.equal(parseDraft('{broken'), null)
  assert.equal(parseDraft(JSON.stringify({ ...draft(), version: 2 })), null)
  assert.equal(parseDraft(JSON.stringify({ ...draft(), requestLines: [{ ...line, itemId: 'missing' }] })), null)
  assert.equal(parseDraft(JSON.stringify({ ...draft(), boardStore: { byTarget: {}, lastEditor: {} } })), null)
  assert.equal(parseDraft(JSON.stringify({ ...draft(), requestLines: [line, line] })), null)
  assert.equal(parseDraft(JSON.stringify({ ...draft(), requestLines: [{ ...line, quantityInput: '100000000000' }] })), null)
})

test('blocked browser storage fails gracefully', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'window', { configurable: true,
    get() { throw new Error('Storage unavailable') } })
  try {
    assert.equal(readDraft(), null)
    assert.equal(saveDraft(draft()), false)
  } finally {
    if (previous) Object.defineProperty(globalThis, 'window', previous)
    else Reflect.deleteProperty(globalThis, 'window')
  }
})

test('new status and measured-weight labels are localized in all three languages', () => {
  for (const language of ['ja', 'zh', 'en'] as const) {
    assert.ok(uiCopy[language].notEntered)
    assert.ok(uiCopy[language].draftSaved)
    assert.ok(uiCopy[language].calculatingBoxes)
    assert.notEqual(uiCopy[language].weightInputPlaceholder, '10.67')
  }
})
