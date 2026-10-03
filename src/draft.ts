import { itemCatalog } from './catalog.ts'
import { getItemUnits, MAX_REQUEST_QUANTITY } from './packing.ts'
import type { BoardEditorState, Draft, FontScale, RequestLine } from './types.ts'

export const DRAFT_STORAGE_KEY = 'packing-demo-draft-v1'

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function isRequestLine(value: unknown): value is RequestLine {
  if (!isRecord(value) || typeof value.id !== 'string' || !/^[\w-]+$/.test(value.id) ||
    !isNullableString(value.itemId) || !isNullableString(value.unit) ||
    typeof value.quantityInput !== 'string' || !/^\d*$/.test(value.quantityInput) ||
    value.quantityInput.length > 12 || Number(value.quantityInput) > MAX_REQUEST_QUANTITY ||
    typeof value.quantityInputHasInvalidChars !== 'boolean') return false
  if (value.itemId === null) return value.unit === null
  return itemCatalog.some((item) => item.id === value.itemId) &&
    getItemUnits(value.itemId).some((unit) => unit === value.unit)
}

function isBoardEditor(value: unknown): value is BoardEditorState {
  if (!isRecord(value)) return false
  return ['packerName', 'recipientName', 'packageNumber', 'packageIndex', 'weightInput']
    .every((key) => typeof value[key] === 'string' && value[key].length <= 2000) &&
    Number.isSafeInteger(Number(value.packageIndex)) && Number(value.packageIndex) >= 1 &&
    Number(value.packageIndex) <= MAX_REQUEST_QUANTITY &&
    (value.shippingScope === 'domestic' || value.shippingScope === 'overseas') &&
    (value.fulfillmentMode === 'direct' || value.fulfillmentMode === 'agency') &&
    Array.isArray(value.outerSizeInputs) && value.outerSizeInputs.length === 3 &&
    value.outerSizeInputs.every((part) => typeof part === 'string' && part.length <= 100)
}

export function parseDraft(json: string): Draft | null {
  try {
    const value: unknown = JSON.parse(json)
    if (!isRecord(value) || value.version !== 1 ||
      !Array.isArray(value.requestLines) || value.requestLines.length === 0 ||
      !value.requestLines.every(isRequestLine) ||
      new Set(value.requestLines.map((line) => line.id)).size !== value.requestLines.length ||
      !isRecord(value.boardStore) || !isRecord(value.boardStore.byTarget) ||
      !Object.values(value.boardStore.byTarget).every(isBoardEditor) ||
      !isBoardEditor(value.boardStore.lastEditor) ||
      !['ja', 'en', 'zh'].includes(String(value.language)) ||
      !Number.isInteger(value.fontScale) || Number(value.fontScale) < 13 || Number(value.fontScale) > 25 ||
      (value.activeStep !== 'item' && value.activeStep !== 'result') ||
      !isNullableString(value.selectedResultLineId) || !isNullableString(value.selectedCandidateKey) ||
      (value.selectedSplitStepIndex !== null &&
        (!Number.isInteger(value.selectedSplitStepIndex) || Number(value.selectedSplitStepIndex) < 0))) return null
    return value as unknown as Draft
  } catch {
    return null
  }
}

export function readDraft(): Draft | null {
  try {
    const saved = window.localStorage.getItem(DRAFT_STORAGE_KEY)
    return saved ? parseDraft(saved) : null
  } catch {
    return null
  }
}

export function saveDraft(draft: Draft): boolean {
  try {
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft))
    return true
  } catch {
    return false
  }
}

export function readFontScale(): FontScale {
  try {
    const stored = window.localStorage.getItem('packing-demo-font-scale')
    const legacy = { sm: 15, md: 16, lg: 17 } as const
    const value = stored && stored in legacy ? legacy[stored as keyof typeof legacy] : Number(stored)
    return Number.isInteger(value) && value >= 13 && value <= 25 ? value as FontScale : 16
  } catch {
    return 16
  }
}
