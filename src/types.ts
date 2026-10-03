export type Language = 'en' | 'zh' | 'ja'
export type StepId = 'item' | 'result'
export type PackUnit = 'B' | 'C' | 'BOX' | '個'
export type RuleSource = '備考1（カートン）' | '備考2' | '備考3（BOX等）'
export type ResultKind = 'exact' | 'near' | 'note'
export type FontScale = 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23 | 24 | 25
export type ShippingScope = 'domestic' | 'overseas'
export type FulfillmentMode = 'direct' | 'agency'
export type CopyBoardState = 'idle' | 'success' | 'error'
export type OuterSizeParts = [string, string, string]

export type CatalogItem = {
  id: string
  label: string
  aliases: string[]
  preferredUnit?: PackUnit
  multiplier?: number
}

export type RuleQuantity = {
  min: number | null
  max: number | null
}

export type BoxRule = {
  itemId: string
  unit: PackUnit
  quantity: RuleQuantity
  source: RuleSource
  note?: string
}

export type BoxSpec = {
  id: string
  order: number
  boxNo: string
  partNo: string
  sizeGroup: string
  outerSize: string
  volumetricWeight: number
  unitPriceYen?: number
  variant?: string
  note?: string
  rules: BoxRule[]
}

export type Candidate = {
  box: BoxSpec
  rule: BoxRule
  distance: number
  kind: ResultKind
}

export type SplitPlanStep = {
  candidate: Candidate
  assignedQuantity: number
  effectiveQuantity: number
}

export type SplitPlan = {
  steps: SplitPlanStep[]
  boxCount: number
  totalVolumetricWeight: number
  totalBoxOrder: number
}

export type RequestLine = {
  id: string
  itemId: string | null
  unit: PackUnit | null
  quantityInput: string
  quantityInputHasInvalidChars: boolean
}

export type RequestResult = {
  line: RequestLine
  item: CatalogItem | null
  availableUnits: PackUnit[]
  quantity: number
  effectiveQuantity: number
  relevantCandidates: Candidate[]
  exactMatches: Candidate[]
  noteMatches: Candidate[]
  nearbyMatches: Candidate[]
  splitPlan: SplitPlan | null
  splitPlanSteps: SplitPlanStep[]
  displayedCandidates: Candidate[]
  defaultCandidate: Candidate | null
  isComplete: boolean
  isEmpty: boolean
}

export type BoardEditorState = {
  packerName: string
  packageNumber: string
  recipientName: string
  packageIndex: string
  shippingScope: ShippingScope
  fulfillmentMode: FulfillmentMode
  outerSizeInputs: OuterSizeParts
  weightInput: string
}

export type BoardStore = {
  byTarget: Record<string, BoardEditorState>
  lastEditor: BoardEditorState
}

export type Draft = {
  version: 1
  requestLines: RequestLine[]
  boardStore: BoardStore
  language: Language
  fontScale: FontScale
  activeStep: StepId
  selectedResultLineId: string | null
  selectedCandidateKey: string | null
  selectedSplitStepIndex: number | null
}

export type UiCopy = {
  pageTitle: string
  languageButton: string
  chooseLanguage: string
  switchLanguage: string
  fontSizeLabel: string
  decreaseFontSize: string
  increaseFontSize: string
  currentFontSizeAria: (value: number) => string
  pageKicker: string
  pageHeadline: string
  pageIntro: string
  sourceNote: string
  stepLabels: Record<StepId, string>
  stepDescriptions: Record<StepId, string>
  searchLabel: string
  searchPlaceholder: string
  chooseItem: string
  addItem: string
  removeItem: string
  itemLine: (index: number) => string
  itemListHint: string
  incompleteItemsHint: string
  itemHint: string
  noItems: string
  selectedItem: string
  quantityLabel: string
  quantityPlaceholder: string
  quantityDigitsOnlyHint: string
  quantityLimitHint: string
  calculatingBoxes: string
  calculationFailed: string
  retryCalculation: string
  draftSaving: string
  draftSaved: string
  draftUnavailable: string
  notEntered: string
  unitLabel: string
  unitLegend: string
  conversionRule: string
  conversionBody: (item: string, factor: number) => string
  effectiveQuantity: string
  next: string
  back: string
  startOver: string
  matchingBoxes: string
  nearbyBoxes: string
  noteOnlyBoxes: string
  noExactTitle: string
  noExactBody: string
  boxNo: string
  partNo: string
  sizeGroup: string
  outerSize: string
  volumetricWeight: string
  volumetricWeightHelpLabel: string
  volumetricWeightHelpBody: string
  volumetricWeightBillingBody: string
  sourceColumn: string
  sourceColumnHelpLabel: string
  matchedRule: string
  unitPriceYen: string
  unitPriceUnavailable: string
  extraNote: string
  selectedSummary: string
  quantitySummary: string
  effectiveSummary: string
  requestSummary: (quantity: number, unit: PackUnit, effectiveQuantity: number) => string
  exactBadge: string
  nearBadge: string
  noteBadge: string
  splitPlanTitle: string
  splitPlanSummaryTitle: string
  splitPlanSummary: (boxCount: number, quantity: number, unit: PackUnit) => string
  splitAssignedQuantity: string
  splitBoxBadge: (index: number) => string
  quantityUnknown: string
  quantityUnknownBody: string
  labelBoard: string
  labelBoardHint: string
  packerNameLabel: string
  packerNamePlaceholder: string
  packageNumberLabel: string
  packageNumberPlaceholder: string
  recipientLabel: string
  recipientPlaceholder: string
  packageIndexLabel: string
  packageIndexPlaceholder: string
  shippingScopeLabel: string
  domesticOption: string
  overseasOption: string
  fulfillmentLabel: string
  directOption: string
  agencyOption: string
  weightInputLabel: string
  weightInputPlaceholder: string
  outerSizeVolumetricWeightValue: (weight: string) => string
  outerSizeVolumetricWeightHint: string
  selectedBoxHint: string
  copyBoardHint: string
  copyBoardImage: string
  copiedBoardImage: string
  copyBoardImageFailed: string
  languageOptionAria: (label: string) => string
}
