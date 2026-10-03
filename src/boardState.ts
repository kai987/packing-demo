import type { BoardEditorState, BoardStore, Candidate, ShippingScope, FulfillmentMode, OuterSizeParts } from './types.ts'
import { parseOuterSizeParts } from './boardDrawing.ts'

export function createEmptyBoardEditorState(): BoardEditorState {
  return {
    packerName: '',
    packageNumber: '',
    recipientName: '',
    packageIndex: '1',
    shippingScope: 'domestic',
    fulfillmentMode: 'direct',
    outerSizeInputs: ['', '', ''],
    weightInput: '',
  }
}

export function createBoardEditorState(
  current: BoardEditorState,
  candidate: Candidate | null,
  splitStepIndex: number | null,
): BoardEditorState {
  if (!candidate) {
    return createEmptyBoardEditorState()
  }

  return {
    packerName: current.packerName,
    packageNumber: current.packageNumber,
    recipientName: current.recipientName,
    packageIndex: splitStepIndex !== null ? String(splitStepIndex + 1) : current.packageIndex,
    shippingScope: inferShippingScope(candidate),
    fulfillmentMode: inferFulfillmentMode(candidate),
    outerSizeInputs: parseOuterSizeParts(candidate.box.outerSize),
    weightInput: '',
  }
}

export function createBoardStore(): BoardStore {
  return { byTarget: {}, lastEditor: createEmptyBoardEditorState() }
}

export function getBoardEditor(store: BoardStore, targetKey: string | null, candidate: Candidate | null, splitIndex: number | null) {
  return targetKey && store.byTarget[targetKey]
    ? store.byTarget[targetKey]
    : createBoardEditorState(store.lastEditor, candidate, splitIndex)
}

export function updateBoardStore(
  store: BoardStore, targetKey: string | null, candidate: Candidate | null,
  splitIndex: number | null, updater: (current: BoardEditorState) => BoardEditorState,
): BoardStore {
  const next = cloneBoardEditorState(updater(getBoardEditor(store, targetKey, candidate, splitIndex)))
  return {
    byTarget: targetKey ? { ...store.byTarget, [targetKey]: next } : store.byTarget,
    lastEditor: next,
  }
}

export function removeBoardTargets(store: BoardStore, lineId: string): BoardStore {
  return { ...store, byTarget: Object.fromEntries(
    Object.entries(store.byTarget).filter(([key]) => !key.startsWith(`${lineId}::`)),
  ) }
}

export function cloneBoardEditorState(state: BoardEditorState): BoardEditorState {
  return {
    ...state,
    outerSizeInputs: [...state.outerSizeInputs] as OuterSizeParts,
  }
}

export function isBoardEditorStateEqual(left: BoardEditorState | undefined, right: BoardEditorState) {
  if (!left) {
    return false
  }

  return (
    left.packerName === right.packerName &&
    left.packageNumber === right.packageNumber &&
    left.recipientName === right.recipientName &&
    left.packageIndex === right.packageIndex &&
    left.shippingScope === right.shippingScope &&
    left.fulfillmentMode === right.fulfillmentMode &&
    left.weightInput === right.weightInput &&
    left.outerSizeInputs[0] === right.outerSizeInputs[0] &&
    left.outerSizeInputs[1] === right.outerSizeInputs[1] &&
    left.outerSizeInputs[2] === right.outerSizeInputs[2]
  )
}

function inferShippingScope(candidate: Candidate | null): ShippingScope {
  if (!candidate) {
    return 'domestic'
  }

  const markerText = [candidate.box.variant, candidate.box.note, candidate.rule.note]
    .filter(Boolean)
    .join(' ')

  if (markerText.includes('海外')) {
    return 'overseas'
  }

  return 'domestic'
}

function inferFulfillmentMode(candidate: Candidate | null): FulfillmentMode {
  if (!candidate) {
    return 'direct'
  }

  const markerText = [candidate.box.variant, candidate.box.note, candidate.rule.note]
    .filter(Boolean)
    .join(' ')

  if (markerText.includes('代行')) {
    return 'agency'
  }

  return 'direct'
}
