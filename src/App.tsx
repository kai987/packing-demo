import {
  type CSSProperties,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { Language, StepId, PackUnit, RuleSource, FontScale, ShippingScope, FulfillmentMode, CopyBoardState, OuterSizeParts, BoxRule, BoxSpec, Candidate, SplitPlanStep, RequestLine, RequestResult, BoardEditorState, BoardStore, Draft, UiCopy } from './types.ts'
import { localeTags, languageOptions, fontScaleOrder, uiCopy, localizedMetaText } from './i18n.ts'
import { itemCatalog } from './catalog.ts'
import { createBoardStore, getBoardEditor, updateBoardStore, removeBoardTargets } from './boardState.ts'
import { formatBoardBoxLabel, formatPackerMark, formatBoardModeMark, formatCanvasOuterSizeParts, drawShippingBoard, getBoardLayout, getBoardProductLines, formatBoardWeight, type BoardDrawingData } from './boardDrawing.ts'
import { getItemUnits, getCandidateKey, findSplitStepIndex, getBoardTargetKey } from './packing.ts'
import { usePackingResults } from './usePackingResults.ts'
import { readDraft, readFontScale } from './draft.ts'
import { useDraftPersistence } from './useDraftPersistence.ts'
import './App.css'

const stepOrder: StepId[] = ['item', 'result']
function createRequestLine(): RequestLine {
  return {
    id: `request-${crypto.randomUUID()}`,
    itemId: null,
    unit: null,
    quantityInput: '',
    quantityInputHasInvalidChars: false,
  }
}

function formatNumber(value: number, language: Language) {
  return new Intl.NumberFormat(localeTags[language]).format(value)
}

function formatDecimal(value: number, language: Language) {
  return new Intl.NumberFormat(localeTags[language], {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

function formatUnitPrice(unitPriceYen: number | undefined, language: Language, ui: UiCopy) {
  if (unitPriceYen === undefined) {
    return ui.unitPriceUnavailable
  }

  return `${formatNumber(unitPriceYen, language)} 円`
}

function formatPackUnitOptionLabel(unit: PackUnit, language: Language) {
  switch (unit) {
    case 'B':
      return language === 'ja' ? 'B (ボックス)' : language === 'zh' ? 'B（盒）' : 'B (Box)'
    case 'C':
      return language === 'ja' ? 'C (カートン)' : language === 'zh' ? 'C（箱）' : 'C (Carton)'
    case 'BOX':
      return language === 'ja' ? 'BOX (セット)' : language === 'zh' ? 'BOX（套装）' : 'BOX (Set)'
    case '個':
      return language === 'ja' ? '個 (個数)' : language === 'zh' ? '個（件）' : '個 (Piece)'
  }
}

function parseOuterSizeNumber(value: string) {
  const normalized = value.trim().replace(/,/g, '')

  if (!normalized) {
    return null
  }

  const parsed = Number(normalized)

  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function sanitizeOuterSizeInput(value: string) {
  return value.replace(/[^\d]/g, '')
}

function sanitizeQuantityInput(value: string) {
  return value.replace(/[^\d]/g, '')
}

function translateMetaText(value: string | undefined, language: Language) {
  if (!value) {
    return ''
  }

  return localizedMetaText[value]?.[language] ?? value
}

function formatBoxDisplayNo(boxNo: string, language: Language) {
  if (!/^\d+$/.test(boxNo)) {
    return boxNo
  }

  const formattedNumber = formatNumber(Number(boxNo), language)

  if (language === 'en') {
    return `No. ${formattedNumber}`
  }

  return `${formattedNumber}号`
}

function formatRange(rule: BoxRule, language: Language) {
  const { min, max } = rule.quantity

  if (min === null || max === null) {
    return translateMetaText(rule.note, language)
  }

  if (min === max) {
    return `${rule.itemId} × ${min}${rule.unit}`
  }

  return `${rule.itemId} × ${min}~${max}${rule.unit}`
}

type SourceSummaryGroup = {
  itemIds: string[]
  unit: PackUnit
  min: number | null
  max: number | null
  note?: string
}

function formatSourceSummaryGroup(group: SourceSummaryGroup, language: Language) {
  const items = group.itemIds.join(', ')

  if (group.min === null || group.max === null) {
    const translatedNote = translateMetaText(group.note, language)
    return translatedNote ? `${items} (${translatedNote})` : items
  }

  if (group.min === group.max) {
    return `${items}*${group.min}${group.unit}`
  }

  return `${items}*${group.min}~${group.max}${group.unit}`
}

function getSourceSummary(box: BoxSpec, source: RuleSource, language: Language) {
  const groups = box.rules
    .filter((rule) => rule.source === source)
    .reduce<SourceSummaryGroup[]>((allGroups, rule) => {
      const matchingGroup = allGroups.find(
        (group) =>
          group.unit === rule.unit &&
          group.min === rule.quantity.min &&
          group.max === rule.quantity.max &&
          group.note === rule.note,
      )

      if (matchingGroup) {
        matchingGroup.itemIds.push(rule.itemId)
        return allGroups
      }

      allGroups.push({
        itemIds: [rule.itemId],
        unit: rule.unit,
        min: rule.quantity.min,
        max: rule.quantity.max,
        note: rule.note,
      })

      return allGroups
    }, [])

  return groups.map((group) => formatSourceSummaryGroup(group, language)).join('\n')
}

function App() {
  const [initialDraft] = useState(readDraft)
  const [language, setLanguage] = useState<Language>(() => initialDraft?.language ?? 'ja')
  const [fontScale, setFontScale] = useState<FontScale>(() => initialDraft?.fontScale ?? readFontScale())
  const [isFontSizeMenuOpen, setIsFontSizeMenuOpen] = useState(false)
  const [isLanguageMenuOpen, setIsLanguageMenuOpen] = useState(false)
  const [openHelpKey, setOpenHelpKey] = useState<string | null>(null)
  const [activeStep, setActiveStep] = useState<StepId>(() => initialDraft?.activeStep ?? 'item')
  const [isItemMenuOpen, setIsItemMenuOpen] = useState(false)
  const [activePickerLineId, setActivePickerLineId] = useState<string | null>(null)
  const [itemSearch, setItemSearch] = useState('')
  const [requestLines, setRequestLines] = useState<RequestLine[]>(() => initialDraft?.requestLines ?? [createRequestLine()])
  const [selectedResultLineId, setSelectedResultLineId] = useState<string | null>(() => initialDraft?.selectedResultLineId ?? null)
  const [selectedCandidateKey, setSelectedCandidateKey] = useState<string | null>(() => initialDraft?.selectedCandidateKey ?? null)
  const [selectedSplitStepIndex, setSelectedSplitStepIndex] = useState<number | null>(() => initialDraft?.selectedSplitStepIndex ?? null)
  const [boardStore, setBoardStore] = useState<BoardStore>(() => initialDraft?.boardStore ?? createBoardStore())
  const [helpPopoverShift, setHelpPopoverShift] = useState(0)
  const [copyBoardState, setCopyBoardState] = useState<CopyBoardState>('idle')
  const fontSizeMenuRef = useRef<HTMLDivElement | null>(null)
  const languageMenuRef = useRef<HTMLDivElement | null>(null)
  const itemMenuRef = useRef<HTMLDivElement | null>(null)
  const boardCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const wizardCardRef = useRef<HTMLElement | null>(null)
  const copyBoardResetTimeoutRef = useRef<number | null>(null)
  const helpPopoverRefs = useRef(new Map<string, HTMLSpanElement>())
  const quantityInputRefs = useRef(new Map<string, HTMLInputElement>())

  const deferredItemSearch = useDeferredValue(itemSearch.trim().toLowerCase())
  const ui = uiCopy[language]
  const currentLanguageOption =
    languageOptions.find((option) => option.id === language) ?? languageOptions[0]
  const fontScaleIndex = fontScaleOrder.indexOf(fontScale)
  const currentFontSizeValue = fontScale
  const canDecreaseFontScale = fontScaleIndex > 0
  const canIncreaseFontScale = fontScaleIndex < fontScaleOrder.length - 1
  const updateBoardEditorState = (
    updater: (current: BoardEditorState) => BoardEditorState,
  ) => {
    setBoardStore((current) => updateBoardStore(current, resolvedBoardTargetKey,
      selectedPreviewCandidate, resolvedSelectedSplitStepIndex, updater))
  }

  const setPackerName = (value: string) => {
    updateBoardEditorState((current) => ({ ...current, packerName: value }))
  }

  const setPackageNumber = (value: string) => {
    updateBoardEditorState((current) => ({ ...current, packageNumber: value }))
  }

  const setRecipientName = (value: string) => {
    updateBoardEditorState((current) => ({ ...current, recipientName: value }))
  }

  const setPackageIndex = (value: string) => {
    updateBoardEditorState((current) => ({ ...current, packageIndex: value }))
  }

  const setShippingScope = (value: ShippingScope) => {
    updateBoardEditorState((current) => ({ ...current, shippingScope: value }))
  }

  const setFulfillmentMode = (value: FulfillmentMode) => {
    updateBoardEditorState((current) => ({ ...current, fulfillmentMode: value }))
  }

  const setOuterSizeInputs = (
    next:
      | OuterSizeParts
      | ((current: OuterSizeParts) => OuterSizeParts),
  ) => {
    updateBoardEditorState((current) => ({
      ...current,
      outerSizeInputs:
        typeof next === 'function'
          ? (next as (current: OuterSizeParts) => OuterSizeParts)(current.outerSizeInputs)
          : next,
    }))
  }

  const setWeightInput = (value: string) => {
    updateBoardEditorState((current) => ({ ...current, weightInput: value }))
  }

  useEffect(() => {
    document.documentElement.lang = localeTags[language]
    document.title = ui.pageTitle
  }, [language, ui.pageTitle])

  useEffect(() => {
    document.documentElement.style.fontSize = `${fontScale}px`
    try {
      window.localStorage.setItem('packing-demo-font-scale', String(fontScale))
    } catch { /* The form remains usable when browser storage is unavailable. */ }

    return () => {
      document.documentElement.style.fontSize = ''
    }
  }, [fontScale])

  useEffect(() => {
    return () => {
      if (copyBoardResetTimeoutRef.current !== null) {
        window.clearTimeout(copyBoardResetTimeoutRef.current)
      }
    }
  }, [])

  useLayoutEffect(() => {
    if (!openHelpKey) {
      setHelpPopoverShift(0)
      return
    }

    const popover = helpPopoverRefs.current.get(openHelpKey)

    if (!popover) {
      setHelpPopoverShift(0)
      return
    }

    const updateHelpPopoverShift = () => {
      const padding = 12
      const rect = popover.getBoundingClientRect()
      let nextShift = 0

      if (rect.left < padding) {
        nextShift += padding - rect.left
      }

      if (rect.right > window.innerWidth - padding) {
        nextShift -= rect.right - (window.innerWidth - padding)
      }

      setHelpPopoverShift(nextShift)
    }

    setHelpPopoverShift(0)
    updateHelpPopoverShift()
    window.addEventListener('resize', updateHelpPopoverShift)

    return () => {
      window.removeEventListener('resize', updateHelpPopoverShift)
    }
  }, [fontScale, language, openHelpKey])

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target

      if (!(target instanceof Node)) {
        return
      }

      if (
        document.activeElement instanceof HTMLInputElement &&
        document.activeElement.classList.contains('quantity-input') &&
        (!(target instanceof Element) || !target.closest('.quantity-input'))
      ) {
        document.activeElement.blur()
      }

      if (!fontSizeMenuRef.current?.contains(target)) {
        setIsFontSizeMenuOpen(false)
      }

      if (!languageMenuRef.current?.contains(target)) {
        setIsLanguageMenuOpen(false)
      }

      if (!itemMenuRef.current?.contains(target)) {
        setIsItemMenuOpen(false)
        setActivePickerLineId(null)
      }

      if (!(target instanceof Element) || !target.closest('.weight-help')) {
        setOpenHelpKey(null)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsFontSizeMenuOpen(false)
        setIsLanguageMenuOpen(false)
        setIsItemMenuOpen(false)
        setActivePickerLineId(null)
        setOpenHelpKey(null)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  const filteredItems = itemCatalog.filter((item) => {
    if (!deferredItemSearch) {
      return true
    }

    return [item.label, ...item.aliases].some((entry) =>
      entry.toLowerCase().includes(deferredItemSearch),
    )
  })

  const { requestResults, isCalculating, calculationFailed, retryCalculation } = usePackingResults(requestLines)
  const completedRequestResults = useMemo(() => requestResults.filter((result) => result.isComplete), [requestResults])
  const hasIncompleteRequestLines = requestResults.some(
    (result) => !result.isEmpty && !result.isComplete,
  )
  const defaultPreviewResult =
    completedRequestResults.find((result) => result.defaultCandidate) ?? null
  const selectedResult =
    selectedResultLineId
      ? completedRequestResults.find((result) => result.line.id === selectedResultLineId) ?? null
      : null
  const selectedResolvedCandidate =
    selectedResult && selectedCandidateKey
      ? selectedResult.relevantCandidates.find(
          (candidate) => getCandidateKey(candidate) === selectedCandidateKey,
        ) ?? null
      : null
  const resolvedSelectedResult = selectedResolvedCandidate ? selectedResult : defaultPreviewResult
  const resolvedSelectedCandidateKey = selectedResolvedCandidate
    ? selectedCandidateKey
    : resolvedSelectedResult?.defaultCandidate
      ? getCandidateKey(resolvedSelectedResult.defaultCandidate)
      : null
  const resolvedSelectedSplitStepIndex = findSplitStepIndex(
    resolvedSelectedResult,
    resolvedSelectedCandidateKey,
    selectedResolvedCandidate ? selectedSplitStepIndex : null,
  )
  const selectedPreviewResult = resolvedSelectedResult
  const selectedPreviewCandidate = selectedResolvedCandidate ?? resolvedSelectedResult?.defaultCandidate ?? null
  const selectedPreviewSplitStep =
    resolvedSelectedSplitStepIndex !== null && selectedPreviewResult
      ? selectedPreviewResult.splitPlanSteps[resolvedSelectedSplitStepIndex] ?? null
      : null
  const resolvedBoardTargetKey = getBoardTargetKey(
    selectedPreviewResult,
    selectedPreviewCandidate,
    resolvedSelectedSplitStepIndex,
  )
  const boardEditorState = getBoardEditor(boardStore, resolvedBoardTargetKey, selectedPreviewCandidate, resolvedSelectedSplitStepIndex)
  const {
    packerName,
    packageNumber,
    recipientName,
    packageIndex,
    shippingScope,
    fulfillmentMode,
    outerSizeInputs,
    weightInput,
  } = boardEditorState
  const draft = useMemo<Draft>(() => ({
    version: 1, requestLines, boardStore, language, fontScale, activeStep,
    selectedResultLineId, selectedCandidateKey, selectedSplitStepIndex,
  }), [requestLines, boardStore, language, fontScale, activeStep, selectedResultLineId, selectedCandidateKey, selectedSplitStepIndex])
  const draftStatus = useDraftPersistence(draft)
  const boardProductLines = useMemo(() => getBoardProductLines(completedRequestResults,
    selectedPreviewResult?.line.id, selectedPreviewSplitStep),
  [completedRequestResults, selectedPreviewResult?.line.id, selectedPreviewSplitStep])
  const hasAnyOuterSizeInput = outerSizeInputs.some((value) => value.trim() !== '')
  const [outerLength, outerWidth, outerHeight] =
    outerSizeInputs.map(parseOuterSizeNumber) as [number | null, number | null, number | null]
  const calculatedVolumetricWeight =
    outerLength !== null && outerWidth !== null && outerHeight !== null
      ? (outerLength * outerWidth * outerHeight) / 5000
      : null

  const handleOuterSizeInputChange = (index: 0 | 1 | 2, value: string) => {
    setOuterSizeInputs((current) => {
      const next: OuterSizeParts = [...current]
      next[index] = sanitizeOuterSizeInput(value)
      return next
    })
  }

  const updateRequestLine = (
    lineId: string,
    updater: (current: RequestLine) => RequestLine,
  ) => {
    setRequestLines((currentLines) =>
      currentLines.map((line) => (line.id === lineId ? updater(line) : line)),
    )
  }

  const handleQuantityInputChange = (lineId: string, value: string) => {
    const sanitizedValue = sanitizeQuantityInput(value)

    updateRequestLine(lineId, (line) => ({
      ...line,
      quantityInput: sanitizedValue,
      quantityInputHasInvalidChars: value !== sanitizedValue,
    }))
  }

  const focusRequestQuantityInput = (lineId: string) => {
    window.requestAnimationFrame(() => {
      const input = quantityInputRefs.current.get(lineId)

      if (!input) {
        return
      }

      input.focus()
      input.select()
    })
  }

  const addRequestLine = () => {
    const nextLine = createRequestLine()
    setRequestLines((currentLines) => [...currentLines, nextLine])
    setActivePickerLineId(null)
    setIsItemMenuOpen(false)
    setItemSearch('')
  }

  const removeRequestLine = (lineId: string) => {
    setRequestLines((currentLines) => {
      if (currentLines.length === 1) {
        return [createRequestLine()]
      }

      return currentLines.filter((line) => line.id !== lineId)
    })

    if (activePickerLineId === lineId) {
      setActivePickerLineId(null)
      setIsItemMenuOpen(false)
      setItemSearch('')
    }

    if (selectedResultLineId === lineId) {
      setSelectedResultLineId(null)
      setSelectedCandidateKey(null)
    }

    setBoardStore((current) => removeBoardTargets(current, lineId))
  }

  const selectItemForLine = (lineId: string, itemId: string) => {
    const nextUnits = getItemUnits(itemId)
    const nextItem = itemCatalog.find((item) => item.id === itemId) ?? null
    const nextUnit =
      nextUnits.find((unit) => unit === nextItem?.preferredUnit) ?? nextUnits[0] ?? null

    updateRequestLine(lineId, (line) => ({
      ...line,
      itemId,
      unit: nextUnit,
    }))

    setActivePickerLineId(null)
    setIsItemMenuOpen(false)
    setItemSearch('')
    focusRequestQuantityInput(lineId)
  }

  const selectResultSummary = (result: RequestResult) => {
    if (result.splitPlanSteps[0]) {
      selectCandidate(result, result.splitPlanSteps[0].candidate, 0)
      return
    }

    if (result.defaultCandidate) {
      selectCandidate(result, result.defaultCandidate, null)
      return
    }

    setSelectedResultLineId(result.line.id)
    setSelectedCandidateKey(null)
    setSelectedSplitStepIndex(null)
  }

  const selectCandidate = (
    result: RequestResult | null,
    candidate: Candidate | null,
    splitStepIndex: number | null = null,
  ) => {
    if (!candidate) {
      setSelectedResultLineId(null)
      setSelectedCandidateKey(null)
      setSelectedSplitStepIndex(null)
      return
    }

    setSelectedResultLineId(result?.line.id ?? null)
    setSelectedCandidateKey(getCandidateKey(candidate))
    setSelectedSplitStepIndex(splitStepIndex)
  }

  useEffect(() => {
    if (isCalculating || calculationFailed || activeStep !== 'result' || !defaultPreviewResult || !defaultPreviewResult.defaultCandidate) {
      return
    }

    if (selectedResolvedCandidate && selectedResultLineId === selectedResult?.line.id) {
      return
    }

    const defaultSplitStepIndex = findSplitStepIndex(
      defaultPreviewResult,
      getCandidateKey(defaultPreviewResult.defaultCandidate),
    )

    selectCandidate(
      defaultPreviewResult,
      defaultPreviewResult.defaultCandidate,
      defaultSplitStepIndex,
    )
  }, [
    activeStep,
    isCalculating,
    calculationFailed,
    defaultPreviewResult,
    selectedSplitStepIndex,
    selectedResolvedCandidate,
    selectedResult,
    selectedResultLineId,
  ])

  const setCopyBoardStateWithReset = (state: CopyBoardState) => {
    setCopyBoardState(state)

    if (copyBoardResetTimeoutRef.current !== null) {
      window.clearTimeout(copyBoardResetTimeoutRef.current)
    }

    copyBoardResetTimeoutRef.current = window.setTimeout(() => {
      setCopyBoardState('idle')
      copyBoardResetTimeoutRef.current = null
    }, 1800)
  }

  const copyBoardImage = async () => {
    const canvas = boardCanvasRef.current

    if (
      !canvas ||
      typeof navigator === 'undefined' ||
      !navigator.clipboard?.write ||
      typeof ClipboardItem === 'undefined'
    ) {
      setCopyBoardStateWithReset('error')
      return
    }

    try {
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, 'image/png')
      })

      if (!blob) {
        throw new Error('Failed to create canvas image blob.')
      }

      await navigator.clipboard.write([
        new ClipboardItem({
          'image/png': blob,
        }),
      ])

      setCopyBoardStateWithReset('success')
    } catch {
      setCopyBoardStateWithReset('error')
    }
  }

  useEffect(() => {
    const canvas = boardCanvasRef.current

    if (!canvas) {
      return
    }

    const context = canvas.getContext('2d')

    if (!context) {
      return
    }

    const boardData: BoardDrawingData = {
      recipient: recipientName.trim() || ui.notEntered,
      packerMark: formatPackerMark(packerName),
      modeMark: formatBoardModeMark(shippingScope, fulfillmentMode),
      boxLabel: formatBoardBoxLabel(
        packageNumber.trim() || selectedPreviewCandidate?.box.boxNo || ui.notEntered,
        packageIndex,
      ),
      weightText: formatBoardWeight(weightInput, ui.notEntered),
      outerSizeText:
        formatCanvasOuterSizeParts(outerSizeInputs) || ui.notEntered,
      productLines: boardProductLines.length > 0 ? boardProductLines : [ui.notEntered],
    }

    const paint = () => {
      const width = canvas.getBoundingClientRect().width || 560
      const height = getBoardLayout(width, boardData.productLines.length).height
      const devicePixelRatio = window.devicePixelRatio || 1
      canvas.width = Math.round(width * devicePixelRatio)
      canvas.height = Math.round(height * devicePixelRatio)
      context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
      drawShippingBoard(context, width, height, boardData)
    }
    paint()
    const observer = new ResizeObserver(paint)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [
    activeStep,
    boardProductLines,
    fulfillmentMode,
    packageIndex,
    packageNumber,
    packerName,
    outerSizeInputs,
    recipientName,
    selectedPreviewCandidate,
    shippingScope,
    weightInput,
    ui.notEntered,
  ])

  const canGoNext =
    activeStep === 'item'
      ? completedRequestResults.length > 0 && !hasIncompleteRequestLines && !isCalculating && !calculationFailed
        : false

  const goNext = () => {
    const currentIndex = stepOrder.indexOf(activeStep)
    const nextStep = stepOrder[currentIndex + 1]

    if (nextStep) {
      setOpenHelpKey(null)
      const shouldScrollToWizardTop = activeStep === 'item' && nextStep === 'result'

      if (nextStep === 'result') {
        const defaultSplitStepIndex =
          defaultPreviewResult?.defaultCandidate
            ? findSplitStepIndex(
                defaultPreviewResult,
                getCandidateKey(defaultPreviewResult.defaultCandidate),
              )
            : null

        selectCandidate(
          defaultPreviewResult,
          defaultPreviewResult?.defaultCandidate ?? null,
          defaultSplitStepIndex,
        )
      }
      setActiveStep(nextStep)

      if (shouldScrollToWizardTop) {
        window.requestAnimationFrame(() => {
          const wizardCard = wizardCardRef.current

          if (!wizardCard) {
            return
          }

          const scrollOffset =
            window.innerWidth <= 760
              ? 114
              : window.innerWidth <= 1100
                ? 126
                : 134
          const top = window.scrollY + wizardCard.getBoundingClientRect().top - scrollOffset
          window.scrollTo({
            top: Math.max(0, top),
            behavior: 'smooth',
          })
        })
      }
    }
  }

  const goBack = () => {
    const currentIndex = stepOrder.indexOf(activeStep)
    const previousStep = stepOrder[currentIndex - 1]

    if (previousStep) {
      setOpenHelpKey(null)
      setActiveStep(previousStep)
    }
  }

  const resetWizard = () => {
    setOpenHelpKey(null)
    setActiveStep('item')
    setIsItemMenuOpen(false)
    setActivePickerLineId(null)
    setItemSearch('')
    setRequestLines([createRequestLine()])
    setSelectedResultLineId(null)
    setSelectedCandidateKey(null)
    setSelectedSplitStepIndex(null)
    setBoardStore(createBoardStore())
  }

  const decreaseFontScale = () => {
    if (!canDecreaseFontScale) {
      return
    }

    setFontScale(fontScaleOrder[fontScaleIndex - 1])
  }

  const increaseFontScale = () => {
    if (!canIncreaseFontScale) {
      return
    }

    setFontScale(fontScaleOrder[fontScaleIndex + 1])
  }

  const renderMetaHelp = (helpKey: string, label: string, body: string) => {
    const isOpen = openHelpKey === helpKey
    const popoverStyle = isOpen
      ? ({
          '--help-popover-shift': `${helpPopoverShift}px`,
        } as CSSProperties)
      : undefined

    return (
      <span className={isOpen ? 'weight-help is-open' : 'weight-help'}>
        <button
          type="button"
          className="weight-help-trigger"
          aria-label={label}
          aria-expanded={isOpen}
          onClick={(event) => {
            event.stopPropagation()
            setOpenHelpKey((currentKey) => (currentKey === helpKey ? null : helpKey))
          }}
        >
          ?
        </button>
        <span
          className={isOpen ? 'weight-help-popover is-open' : 'weight-help-popover'}
          ref={(element) => {
            if (element) {
              helpPopoverRefs.current.set(helpKey, element)
              return
            }

            helpPopoverRefs.current.delete(helpKey)
          }}
          style={popoverStyle}
          onClick={(event) => event.stopPropagation()}
        >
          {body}
        </span>
      </span>
    )
  }

  const renderWeightHelp = (helpKey: string) =>
    renderMetaHelp(
      helpKey,
      ui.volumetricWeightHelpLabel,
      `${ui.volumetricWeightHelpBody}\n\n${ui.volumetricWeightBillingBody}`,
    )

  const renderSourceHelp = (
    helpKey: string,
    box: BoxSpec,
    source: RuleSource,
  ) => {
    const body = getSourceSummary(box, source, language)

    if (!body) {
      return null
    }

    return renderMetaHelp(helpKey, ui.sourceColumnHelpLabel, body)
  }

  const formatAssignedQuantity = (assignedQuantity: number, unit: PackUnit | null) =>
    `${formatNumber(assignedQuantity, language)}${unit ?? ''}`

  const renderCandidateCard = (result: RequestResult, candidate: Candidate) => {
    const candidateKey = getCandidateKey(candidate)
    const resultCandidateKey = `${result.line.id}::${candidateKey}`
    const isSelected =
      result.line.id === selectedPreviewResult?.line.id &&
      candidateKey === resolvedSelectedCandidateKey
    const badge =
      candidate.kind === 'exact'
        ? ui.exactBadge
        : candidate.kind === 'near'
          ? ui.nearBadge
          : ui.noteBadge

    return (
      <article
        key={resultCandidateKey}
        className={
          isSelected
            ? `result-card ${candidate.kind} is-interactive is-selected`
            : `result-card ${candidate.kind} is-interactive`
        }
        tabIndex={0}
        onClick={() => selectCandidate(result, candidate, null)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            selectCandidate(result, candidate, null)
          }
        }}
      >
        <div className="result-header">
          <span className="result-badge">{badge}</span>
          <h4>
            {formatBoxDisplayNo(candidate.box.boxNo, language)}
            {candidate.box.variant ? ` / ${translateMetaText(candidate.box.variant, language)}` : ''}
          </h4>
        </div>
        <dl className="meta-grid">
          <div>
            <dt>{ui.partNo}</dt>
            <dd>{translateMetaText(candidate.box.partNo, language)}</dd>
          </div>
          <div>
            <dt>{ui.sizeGroup}</dt>
            <dd>{candidate.box.sizeGroup}</dd>
          </div>
          <div>
            <dt>{ui.outerSize}</dt>
            <dd>{translateMetaText(candidate.box.outerSize, language)}</dd>
          </div>
          <div>
            <dt className="meta-label-row">
              <span>{ui.volumetricWeight}</span>
              {renderWeightHelp(`${resultCandidateKey}-weight`)}
            </dt>
            <dd>{formatDecimal(candidate.box.volumetricWeight, language)} kg</dd>
          </div>
          <div>
            <dt className="meta-label-row">
              <span>{ui.sourceColumn}</span>
              {renderSourceHelp(`${resultCandidateKey}-source`, candidate.box, candidate.rule.source)}
            </dt>
            <dd>{translateMetaText(candidate.rule.source, language)}</dd>
          </div>
          <div>
            <dt>{ui.matchedRule}</dt>
            <dd>{candidate.kind === 'note' ? ui.quantityUnknown : formatRange(candidate.rule, language)}</dd>
          </div>
          <div>
            <dt>{ui.unitPriceYen}</dt>
            <dd>{formatUnitPrice(candidate.box.unitPriceYen, language, ui)}</dd>
          </div>
        </dl>
        {candidate.rule.note || candidate.box.note || candidate.kind === 'note' ? (
          <p className="result-note">
            <strong>{ui.extraNote}: </strong>
            {candidate.rule.note
              ? translateMetaText(candidate.rule.note, language)
              : candidate.box.note
                ? translateMetaText(candidate.box.note, language)
                : ui.quantityUnknownBody}
          </p>
        ) : null}
      </article>
    )
  }

  const renderSplitPlanCard = (result: RequestResult, step: SplitPlanStep, index: number) => {
    const candidate = step.candidate
    const candidateKey = getCandidateKey(candidate)
    const splitCardKey = `${result.line.id}::${candidateKey}::${index}::${step.assignedQuantity}`
    const isSelected =
      result.line.id === selectedPreviewResult?.line.id &&
      (resolvedSelectedSplitStepIndex !== null
        ? index === resolvedSelectedSplitStepIndex
        : candidateKey === resolvedSelectedCandidateKey)

    return (
      <article
        key={splitCardKey}
        className={
          isSelected
            ? 'result-card exact is-interactive is-selected'
            : 'result-card exact is-interactive'
        }
        tabIndex={0}
        onClick={() => selectCandidate(result, candidate, index)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            selectCandidate(result, candidate, index)
          }
        }}
      >
        <div className="result-header">
          <span className="result-badge split-box-badge">{ui.splitBoxBadge(index + 1)}</span>
          <h4>
            {formatBoxDisplayNo(candidate.box.boxNo, language)}
            {candidate.box.variant ? ` / ${translateMetaText(candidate.box.variant, language)}` : ''}
          </h4>
        </div>
        <dl className="meta-grid">
          <div>
            <dt>{ui.splitAssignedQuantity}</dt>
            <dd>{formatAssignedQuantity(step.assignedQuantity, result.line.unit)}</dd>
          </div>
          {result.item?.multiplier ? (
            <div>
              <dt>{ui.effectiveQuantity}</dt>
              <dd>{formatNumber(step.effectiveQuantity, language)}</dd>
            </div>
          ) : null}
          <div>
            <dt>{ui.partNo}</dt>
            <dd>{translateMetaText(candidate.box.partNo, language)}</dd>
          </div>
          <div>
            <dt>{ui.sizeGroup}</dt>
            <dd>{candidate.box.sizeGroup}</dd>
          </div>
          <div>
            <dt>{ui.outerSize}</dt>
            <dd>{translateMetaText(candidate.box.outerSize, language)}</dd>
          </div>
          <div>
            <dt className="meta-label-row">
              <span>{ui.volumetricWeight}</span>
              {renderWeightHelp(`${splitCardKey}-weight`)}
            </dt>
            <dd>{formatDecimal(candidate.box.volumetricWeight, language)} kg</dd>
          </div>
          <div>
            <dt className="meta-label-row">
              <span>{ui.sourceColumn}</span>
              {renderSourceHelp(`${splitCardKey}-source`, candidate.box, candidate.rule.source)}
            </dt>
            <dd>{translateMetaText(candidate.rule.source, language)}</dd>
          </div>
          <div>
            <dt>{ui.matchedRule}</dt>
            <dd>{formatRange(candidate.rule, language)}</dd>
          </div>
          <div>
            <dt>{ui.unitPriceYen}</dt>
            <dd>{formatUnitPrice(candidate.box.unitPriceYen, language, ui)}</dd>
          </div>
        </dl>
        {candidate.rule.note || candidate.box.note ? (
          <p className="result-note">
            <strong>{ui.extraNote}: </strong>
            {candidate.rule.note
              ? translateMetaText(candidate.rule.note, language)
              : translateMetaText(candidate.box.note, language)}
          </p>
        ) : null}
      </article>
    )
  }

  return (
    <div className="page-shell">
      <div
        className={isFontSizeMenuOpen ? 'font-size-menu is-open' : 'font-size-menu'}
        ref={fontSizeMenuRef}
      >
        <button
          type="button"
          className={
            isFontSizeMenuOpen
              ? 'font-size-trigger is-collapsed-hidden'
              : 'font-size-trigger'
          }
          aria-expanded={isFontSizeMenuOpen}
          aria-controls="font-size-panel"
          aria-hidden={isFontSizeMenuOpen}
          tabIndex={isFontSizeMenuOpen ? -1 : 0}
          onClick={() => setIsFontSizeMenuOpen(true)}
        >
          {ui.fontSizeLabel}
        </button>

        <div
          className={isFontSizeMenuOpen ? 'font-size-panel is-open' : 'font-size-panel'}
          id="font-size-panel"
          aria-hidden={!isFontSizeMenuOpen}
        >
          <button
            type="button"
            className="font-size-trigger is-open"
            aria-expanded={isFontSizeMenuOpen}
            aria-controls="font-size-panel"
            tabIndex={isFontSizeMenuOpen ? 0 : -1}
            onClick={() => setIsFontSizeMenuOpen(false)}
          >
            {ui.fontSizeLabel}
          </button>
          <div className="font-size-stepper">
            <button
              type="button"
              className="font-size-control"
              aria-label={ui.decreaseFontSize}
              tabIndex={isFontSizeMenuOpen ? 0 : -1}
              onClick={decreaseFontScale}
              disabled={!canDecreaseFontScale}
            >
              -
            </button>
            <output
              className="font-size-value"
              aria-label={ui.currentFontSizeAria(currentFontSizeValue)}
              aria-live="polite"
            >
              {currentFontSizeValue}
            </output>
            <button
              type="button"
              className="font-size-control"
              aria-label={ui.increaseFontSize}
              tabIndex={isFontSizeMenuOpen ? 0 : -1}
              onClick={increaseFontScale}
              disabled={!canIncreaseFontScale}
            >
              +
            </button>
          </div>
        </div>
      </div>

      <div className="language-menu" ref={languageMenuRef}>
        <button
          type="button"
          className={isLanguageMenuOpen ? 'language-trigger is-open' : 'language-trigger'}
          aria-haspopup="menu"
          aria-expanded={isLanguageMenuOpen}
          aria-label={ui.switchLanguage}
          onClick={() => setIsLanguageMenuOpen((open) => !open)}
        >
          <span className="language-trigger-copy">
            <span className="language-trigger-caption">{ui.languageButton}</span>
            <strong>{currentLanguageOption.label}</strong>
          </span>
          <span className="language-caret" aria-hidden="true"></span>
        </button>

        <div
          className={isLanguageMenuOpen ? 'language-dropdown is-open' : 'language-dropdown'}
          role="menu"
          aria-label={ui.chooseLanguage}
        >
          {languageOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              role="menuitemradio"
              aria-checked={option.id === language}
              aria-label={ui.languageOptionAria(option.label)}
              className={
                option.id === language
                  ? 'language-option is-active'
                  : 'language-option'
              }
              onClick={() => {
                setLanguage(option.id)
                setIsLanguageMenuOpen(false)
              }}
            >
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      </div>

      <main className="wizard-shell">
        <section className="hero-card hero-card--single panel">
          <div className="hero-copy">
            <h1 className="hero-headline">{ui.pageHeadline}</h1>
            <p className="hero-text">{ui.pageIntro}</p>
            <p className="source-note">{ui.sourceNote}</p>
            <p className="unit-legend hero-unit-legend">{ui.unitLegend}</p>
          </div>
        </section>

        <section className="stepper panel">
          {stepOrder.map((step, index) => {
            const currentIndex = stepOrder.indexOf(activeStep)
            const isActive = step === activeStep
            const isComplete = index < currentIndex

            return (
              <button
                key={step}
                type="button"
                className={
                  isActive
                    ? 'step-pill is-active'
                    : isComplete
                      ? 'step-pill is-complete'
                      : 'step-pill'
                }
                onClick={() => {
                  if (step === 'item' || canGoNext) {
                    if (step === 'result') {
                      const defaultSplitStepIndex =
                        defaultPreviewResult?.defaultCandidate
                          ? findSplitStepIndex(
                              defaultPreviewResult,
                              getCandidateKey(defaultPreviewResult.defaultCandidate),
                            )
                          : null

                      selectCandidate(
                        defaultPreviewResult,
                        defaultPreviewResult?.defaultCandidate ?? null,
                        defaultSplitStepIndex,
                      )
                    }
                    setActiveStep(step)
                  }
                }}
              >
                <span className="step-number">{index + 1}</span>
                <span className="step-copy">
                  <strong>{ui.stepLabels[step]}</strong>
                  <small>{ui.stepDescriptions[step]}</small>
                </span>
              </button>
            )
          })}
        </section>

        <section className="wizard-card panel" ref={wizardCardRef}>
          <p className="draft-status" role="status">
            {draftStatus === 'saved' ? ui.draftSaved : draftStatus === 'unavailable' ? ui.draftUnavailable : ui.draftSaving}
          </p>
          {isCalculating ? <p className="input-feedback" role="status">{ui.calculatingBoxes}</p> : null}
          {calculationFailed ? (
            <div className="calculation-feedback" role="alert">
              <p className="input-feedback is-error">{ui.calculationFailed}</p>
              <button type="button" className="ghost-button" onClick={retryCalculation}>{ui.retryCalculation}</button>
            </div>
          ) : null}
          {activeStep === 'item' ? (
            <div className="step-layout item-layout">
              <div className="step-copy-block">
                <p className="eyebrow">{ui.stepLabels.item}</p>
                <h2>{ui.chooseItem}</h2>
                <p className="panel-note">{ui.stepDescriptions.item}</p>
              </div>

              <div className="field-stack">
                <div className="callout-card">
                  <p>{ui.itemListHint}</p>
                  <p className="panel-note">{ui.itemHint}</p>
                </div>

                <div className="request-list">
                  {requestResults.map((result, index) => {
                    const isPickerOpen = isItemMenuOpen && activePickerLineId === result.line.id

                    return (
                      <section key={result.line.id} className="request-card">
                        <div className="request-card-header">
                          <div>
                            <p className="eyebrow">{ui.itemLine(index + 1)}</p>
                            <h3>{result.item?.label ?? ui.chooseItem}</h3>
                          </div>
                          {requestLines.length > 1 ? (
                            <button
                              type="button"
                              className="ghost-button request-card-remove"
                              onClick={() => removeRequestLine(result.line.id)}
                            >
                              {ui.removeItem}
                            </button>
                          ) : null}
                        </div>

                        <div
                          className={isPickerOpen ? 'picker-card is-open' : 'picker-card'}
                          ref={isPickerOpen ? itemMenuRef : undefined}
                        >
                          <label className="field-label">{ui.searchLabel}</label>
                          <button
                            type="button"
                            className={isPickerOpen ? 'picker-trigger is-open' : 'picker-trigger'}
                            aria-haspopup="listbox"
                            aria-expanded={isPickerOpen}
                            onClick={() => {
                              const isSameLine = activePickerLineId === result.line.id
                              setActivePickerLineId(result.line.id)
                              setIsItemMenuOpen((open) => (isSameLine ? !open : true))
                              if (!isSameLine) {
                                setItemSearch('')
                              }
                            }}
                          >
                            <span>{result.item?.label ?? ui.chooseItem}</span>
                            <span className="picker-caret" aria-hidden="true"></span>
                          </button>

                          <div className={isPickerOpen ? 'picker-popover is-open' : 'picker-popover'}>
                            <input
                              type="search"
                              className="picker-search"
                              value={itemSearch}
                              placeholder={ui.searchPlaceholder}
                              onChange={(event) => setItemSearch(event.target.value)}
                            />
                            <div className="picker-options" role="listbox" aria-label={ui.searchLabel}>
                              {filteredItems.length > 0 ? (
                                filteredItems.map((item) => (
                                  <button
                                    key={item.id}
                                    type="button"
                                    className={
                                      item.id === result.line.itemId
                                        ? 'picker-option is-active'
                                        : 'picker-option'
                                    }
                                    onClick={() => selectItemForLine(result.line.id, item.id)}
                                  >
                                    <span>{item.label}</span>
                                    {item.multiplier ? (
                                      <small>× {item.multiplier.toFixed(2)}</small>
                                    ) : null}
                                  </button>
                                ))
                              ) : (
                                <div className="picker-empty">{ui.noItems}</div>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="request-meta-grid">
                          <div className="selection-card">
                            <span>{ui.selectedItem}</span>
                            <strong>{result.item?.label ?? '—'}</strong>
                          </div>

                          {result.availableUnits.length > 0 ? (
                            <div className="unit-card">
                              <label className="field-label">{ui.unitLabel}</label>
                              <div className="unit-row">
                                {result.availableUnits.map((unit) => (
                                  <button
                                    key={unit}
                                    type="button"
                                    className={
                                      result.line.unit === unit
                                        ? 'unit-chip is-active'
                                        : 'unit-chip'
                                    }
                                    onClick={() => {
                                      updateRequestLine(result.line.id, (line) => ({
                                        ...line,
                                        unit,
                                      }))
                                      focusRequestQuantityInput(result.line.id)
                                    }}
                                  >
                                    {formatPackUnitOptionLabel(unit, language)}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ) : null}

                          <div className="quantity-card">
                            <label className="field-label" htmlFor={`quantity-input-${result.line.id}`}>
                              {ui.quantityLabel}
                            </label>
                            <input
                              id={`quantity-input-${result.line.id}`}
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              className="quantity-input"
                              ref={(element) => {
                                if (element) {
                                  quantityInputRefs.current.set(result.line.id, element)
                                  return
                                }

                                quantityInputRefs.current.delete(result.line.id)
                              }}
                              value={result.line.quantityInput}
                              placeholder={ui.quantityPlaceholder}
                              onChange={(event) =>
                                handleQuantityInputChange(result.line.id, event.target.value)
                              }
                            />
                            {result.line.quantityInputHasInvalidChars ? (
                              <p className="input-feedback is-error">{ui.quantityDigitsOnlyHint}</p>
                            ) : null}
                            {result.line.quantityInput && !result.line.quantityInputHasInvalidChars && result.quantity === 0 ? (
                              <p className="input-feedback is-error">{ui.quantityLimitHint}</p>
                            ) : null}
                          </div>

                          {result.item?.multiplier ? (
                            <div className="callout-card">
                              <p className="callout-title">{ui.conversionRule}</p>
                              <p>{ui.conversionBody(result.item.label, result.item.multiplier)}</p>
                              <p className="callout-accent">
                                {ui.effectiveQuantity}:{' '}
                                {result.effectiveQuantity > 0
                                  ? formatNumber(result.effectiveQuantity, language)
                                  : '—'}
                              </p>
                            </div>
                          ) : null}
                        </div>
                      </section>
                    )
                  })}
                </div>

                {hasIncompleteRequestLines ? (
                  <p className="input-feedback is-error">{ui.incompleteItemsHint}</p>
                ) : null}

                <button type="button" className="ghost-button request-add-button" onClick={addRequestLine}>
                  {ui.addItem}
                </button>
              </div>
            </div>
          ) : null}

          {activeStep === 'result' ? (
            <div className="step-layout results-layout">
              <div className="step-copy-block">
                <p className="eyebrow">{ui.stepLabels.result}</p>
                <h2>{ui.matchingBoxes}</h2>
                <p className="panel-note">{ui.stepDescriptions.result}</p>

                <div className="result-overview-grid">
                  <div className="result-summary request-summary-list">
                    {completedRequestResults.map((result, index) => (
                      <button
                        key={result.line.id}
                        type="button"
                        className={
                          result.line.id === selectedPreviewResult?.line.id
                            ? 'selection-card result-summary-button is-highlighted'
                            : 'selection-card result-summary-button'
                        }
                        aria-pressed={result.line.id === selectedPreviewResult?.line.id}
                        onClick={() => selectResultSummary(result)}
                      >
                        <span>{ui.itemLine(index + 1)}</span>
                        <strong>{result.item?.label ?? '—'}</strong>
                        <p className="request-summary-meta">
                          {ui.requestSummary(
                            result.quantity,
                            result.line.unit ?? 'B',
                            result.effectiveQuantity,
                          )}
                        </p>
                      </button>
                    ))}
                  </div>

                  <div className="label-editor-card">
                    <p className="label-editor-title">{ui.labelBoard}</p>
                    <p className="panel-note">{ui.labelBoardHint}</p>

                    <div className="label-editor-grid">
                      <label className="label-field is-wide" htmlFor="packer-name-input">
                        <span className="field-label">{ui.packerNameLabel}</span>
                        <input
                          id="packer-name-input"
                          type="text"
                          className="text-input"
                          value={packerName}
                          placeholder={ui.packerNamePlaceholder}
                          onChange={(event) => setPackerName(event.target.value)}
                        />
                      </label>

                      <label className="label-field is-wide" htmlFor="recipient-name-input">
                        <span className="field-label">{ui.recipientLabel}</span>
                        <input
                          id="recipient-name-input"
                          type="text"
                          className="text-input"
                          value={recipientName}
                          placeholder={ui.recipientPlaceholder}
                          onChange={(event) => setRecipientName(event.target.value)}
                        />
                      </label>

                      <label className="label-field" htmlFor="package-number-input">
                        <span className="field-label">{ui.packageNumberLabel}</span>
                        <input
                          id="package-number-input"
                          type="text"
                          className="text-input"
                          value={packageNumber}
                          placeholder={ui.packageNumberPlaceholder}
                          onChange={(event) => setPackageNumber(event.target.value)}
                        />
                      </label>

                      <label className="label-field" htmlFor="package-index-input">
                        <span className="field-label">{ui.packageIndexLabel}</span>
                        <div className="package-index-control">
                          <span className="package-index-prefix" aria-hidden="true">
                            #
                          </span>
                          <div className="select-input-wrap">
                            <select
                              id="package-index-input"
                              className="select-input"
                              value={packageIndex}
                              onChange={(event) => setPackageIndex(event.target.value)}
                            >
                              {Array.from({ length: Math.max(10, selectedPreviewResult?.splitPlanSteps.length ?? 0, Number(packageIndex) || 1) }, (_, index) => {
                                const value = String(index + 1)

                                return (
                                  <option key={value} value={value}>
                                    {value}
                                  </option>
                                )
                              })}
                            </select>
                            <span className="select-input-caret" aria-hidden="true"></span>
                          </div>
                        </div>
                      </label>

                      <div className="label-field is-wide">
                        <span
                          className="field-label field-label-preserve-case"
                          id="outer-size-inputs-label"
                        >
                          {ui.outerSize} (cm)
                        </span>
                        <div className="outer-size-control" role="group" aria-labelledby="outer-size-inputs-label">
                          <input
                            id="outer-size-length-input"
                            type="number"
                            min="0"
                            step="1"
                            inputMode="numeric"
                            className="quantity-input outer-size-input"
                            value={outerSizeInputs[0]}
                            aria-label={`${ui.outerSize} 1`}
                            onChange={(event) => handleOuterSizeInputChange(0, event.target.value)}
                          />
                          <span className="outer-size-separator" aria-hidden="true">
                            x
                          </span>
                          <input
                            id="outer-size-width-input"
                            type="number"
                            min="0"
                            step="1"
                            inputMode="numeric"
                            className="quantity-input outer-size-input"
                            value={outerSizeInputs[1]}
                            aria-label={`${ui.outerSize} 2`}
                            onChange={(event) => handleOuterSizeInputChange(1, event.target.value)}
                          />
                          <span className="outer-size-separator" aria-hidden="true">
                            x
                          </span>
                          <input
                            id="outer-size-height-input"
                            type="number"
                            min="0"
                            step="1"
                            inputMode="numeric"
                            className="quantity-input outer-size-input"
                            value={outerSizeInputs[2]}
                            aria-label={`${ui.outerSize} 3`}
                            onChange={(event) => handleOuterSizeInputChange(2, event.target.value)}
                          />
                        </div>
                        {hasAnyOuterSizeInput ? (
                          <p
                            className={
                              calculatedVolumetricWeight === null
                                ? 'outer-size-feedback'
                                : 'outer-size-feedback is-ready'
                            }
                          >
                            {calculatedVolumetricWeight === null
                              ? ui.outerSizeVolumetricWeightHint
                              : ui.outerSizeVolumetricWeightValue(
                                  formatDecimal(calculatedVolumetricWeight, language),
                                )}
                          </p>
                        ) : null}
                      </div>

                      <label className="label-field" htmlFor="weight-input">
                        <span className="field-label field-label-preserve-case">
                          {ui.weightInputLabel}
                        </span>
                        <input
                          id="weight-input"
                          type="number"
                          min="0"
                          step="0.01"
                          inputMode="decimal"
                          className="text-input"
                          value={weightInput}
                          placeholder={ui.weightInputPlaceholder}
                          onChange={(event) => setWeightInput(event.target.value)}
                        />
                      </label>

                      <div className="label-field is-wide">
                        <span className="field-label">{ui.shippingScopeLabel}</span>
                        <div className="toggle-group">
                          <button
                            type="button"
                            className={
                              shippingScope === 'domestic'
                                ? 'toggle-chip is-active'
                                : 'toggle-chip'
                            }
                            onClick={() => setShippingScope('domestic')}
                          >
                            {ui.domesticOption}
                          </button>
                          <button
                            type="button"
                            className={
                              shippingScope === 'overseas'
                                ? 'toggle-chip is-active'
                                : 'toggle-chip'
                            }
                            onClick={() => setShippingScope('overseas')}
                          >
                            {ui.overseasOption}
                          </button>
                        </div>
                      </div>

                      {shippingScope === 'overseas' ? (
                        <div className="label-field is-wide">
                          <span className="field-label">{ui.fulfillmentLabel}</span>
                          <div className="toggle-group">
                            <button
                              type="button"
                              className={
                                fulfillmentMode === 'direct'
                                  ? 'toggle-chip is-active'
                                  : 'toggle-chip'
                              }
                              onClick={() => setFulfillmentMode('direct')}
                            >
                              {ui.directOption}
                            </button>
                            <button
                              type="button"
                              className={
                                fulfillmentMode === 'agency'
                                  ? 'toggle-chip is-active'
                                  : 'toggle-chip'
                              }
                              onClick={() => setFulfillmentMode('agency')}
                            >
                              {ui.agencyOption}
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>

              <div className="results-stack">
                <div className="label-preview-card">
                  <div className="label-preview-header">
                    <div>
                      <p className="eyebrow">{ui.labelBoard}</p>
                      <h3>
                        {selectedPreviewCandidate
                          ? `${formatBoxDisplayNo(selectedPreviewCandidate.box.boxNo, language)}`
                          : ui.labelBoard}
                        {selectedPreviewCandidate?.box.variant
                          ? ` / ${translateMetaText(selectedPreviewCandidate.box.variant, language)}`
                          : ''}
                      </h3>
                    </div>
                    <p className="panel-note">{ui.selectedBoxHint}</p>
                  </div>
                  {selectedPreviewResult?.splitPlanSteps.length ? (
                    <div className="label-split-selector">
                      <p className="callout-title">{ui.splitPlanTitle}</p>
                      <div className="label-split-list">
                        {selectedPreviewResult.splitPlanSteps.map((step, stepIndex) => (
                          <button
                            key={`${selectedPreviewResult.line.id}::label-split::${stepIndex}::${step.assignedQuantity}`}
                            type="button"
                            className={
                              stepIndex === resolvedSelectedSplitStepIndex
                                ? 'label-split-chip is-active'
                                : 'label-split-chip'
                            }
                            onClick={() =>
                              selectCandidate(selectedPreviewResult, step.candidate, stepIndex)
                            }
                          >
                            <span>{ui.splitBoxBadge(stepIndex + 1)}</span>
                            <strong>
                              {formatAssignedQuantity(
                                step.assignedQuantity,
                                selectedPreviewResult.line.unit,
                              )}
                            </strong>
                            <small>
                              {formatBoxDisplayNo(step.candidate.box.boxNo, language)}
                              {step.candidate.box.variant
                                ? ` / ${translateMetaText(step.candidate.box.variant, language)}`
                                : ''}
                            </small>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <div className="label-canvas-wrap">
                    <p className="label-canvas-hint">{ui.copyBoardHint}</p>
                    <div className="label-canvas-stage">
                      <button
                        type="button"
                        className={
                          copyBoardState === 'success'
                            ? 'label-preview-copy is-success'
                            : copyBoardState === 'error'
                              ? 'label-preview-copy is-error'
                              : 'label-preview-copy'
                        }
                        aria-label={
                          copyBoardState === 'success'
                            ? ui.copiedBoardImage
                            : copyBoardState === 'error'
                              ? ui.copyBoardImageFailed
                              : ui.copyBoardImage
                        }
                        title={
                          copyBoardState === 'success'
                            ? ui.copiedBoardImage
                            : copyBoardState === 'error'
                              ? ui.copyBoardImageFailed
                              : ui.copyBoardImage
                        }
                        onClick={copyBoardImage}
                        disabled={isCalculating || calculationFailed}
                      >
                        {copyBoardState === 'success' ? (
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path
                              d="M5 12.5 9.2 16.7 19 6.9"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        ) : (
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <rect
                              x="9"
                              y="4"
                              width="10"
                              height="12"
                              rx="2"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.8"
                            />
                            <rect
                              x="5"
                              y="8"
                              width="10"
                              height="12"
                              rx="2"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.8"
                            />
                          </svg>
                        )}
                      </button>
                      <canvas ref={boardCanvasRef} className="label-canvas"
                        style={{ aspectRatio: `560 / ${getBoardLayout(560, Math.max(1, boardProductLines.length)).height}` }}
                        aria-label={`${ui.labelBoard}: ${boardProductLines.join(', ')}`}>
                        {boardProductLines.join('\n')}
                      </canvas>
                    </div>
                  </div>
                </div>

                {completedRequestResults.map((result, index) => (
                  <section key={result.line.id} className="request-results-card">
                    <div className="request-results-header">
                      <div>
                        <p className="eyebrow">{ui.itemLine(index + 1)}</p>
                        <h3>{result.item?.label ?? ui.matchingBoxes}</h3>
                      </div>
                      <p className="panel-note">
                        {ui.requestSummary(
                          result.quantity,
                          result.line.unit ?? 'B',
                          result.effectiveQuantity,
                        )}
                      </p>
                    </div>

                    {result.splitPlan && result.splitPlanSteps.length > 0 ? (
                      <div className="results-group">
                        <h3>{ui.splitPlanTitle}</h3>
                        <div className="callout-card split-plan-summary">
                          <p className="callout-title">{ui.splitPlanSummaryTitle}</p>
                          <p>
                            {ui.splitPlanSummary(
                              result.splitPlan.boxCount,
                              result.quantity,
                              result.line.unit ?? 'B',
                            )}
                          </p>
                        </div>
                        <div className="results-grid">
                          {result.splitPlanSteps.map((step, stepIndex) =>
                            renderSplitPlanCard(result, step, stepIndex),
                          )}
                        </div>
                      </div>
                    ) : null}

                    {result.exactMatches.length > 0 ? (
                      <div className="results-group">
                        <h3>{ui.matchingBoxes}</h3>
                        <div className="results-grid">
                          {result.exactMatches.map((candidate) => renderCandidateCard(result, candidate))}
                        </div>
                      </div>
                    ) : null}

                    {result.exactMatches.length === 0 && result.nearbyMatches.length > 0 ? (
                      <div className="results-group">
                        <h3>{ui.nearbyBoxes}</h3>
                        <div className="empty-card">
                          <strong>{ui.noExactTitle}</strong>
                          <p>{ui.noExactBody}</p>
                        </div>
                        <div className="results-grid">
                          {result.nearbyMatches.map((candidate) => renderCandidateCard(result, candidate))}
                        </div>
                      </div>
                    ) : null}

                    {result.noteMatches.length > 0 ? (
                      <div className="results-group">
                        <h3>{ui.noteOnlyBoxes}</h3>
                        <div className="results-grid">
                          {result.noteMatches.map((candidate) => renderCandidateCard(result, candidate))}
                        </div>
                      </div>
                    ) : null}
                  </section>
                ))}
              </div>
            </div>
          ) : null}

          <div className="wizard-actions">
            <button
              type="button"
              className="ghost-button"
              onClick={resetWizard}
            >
              {ui.startOver}
            </button>

            <div className="nav-actions">
              {activeStep !== 'item' ? (
                <button type="button" className="ghost-button" onClick={goBack}>
                  {ui.back}
                </button>
              ) : null}

              {activeStep !== 'result' ? (
                <button
                  type="button"
                  className="primary-button"
                  disabled={!canGoNext}
                  onClick={goNext}
                >
                  {ui.next}
                </button>
              ) : null}
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}

export default App
