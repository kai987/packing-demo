import {
  type CSSProperties,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import './App.css'

type Language = 'en' | 'zh' | 'ja'
type StepId = 'item' | 'result'
type PackUnit = 'B' | 'C' | 'BOX' | '個'
type RuleSource = '備考1（カートン）' | '備考2' | '備考3（BOX等）'
type ResultKind = 'exact' | 'near' | 'note'
type FontScale = 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23 | 24 | 25
type ShippingScope = 'domestic' | 'overseas'
type FulfillmentMode = 'direct' | 'agency'
type CopyBoardState = 'idle' | 'success' | 'error'
type OuterSizeParts = [string, string, string]

type CatalogItem = {
  id: string
  label: string
  aliases: string[]
  preferredUnit?: PackUnit
  multiplier?: number
}

type RuleQuantity = {
  min: number | null
  max: number | null
}

type BoxRule = {
  itemId: string
  unit: PackUnit
  quantity: RuleQuantity
  source: RuleSource
  note?: string
}

type BoxSpec = {
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

type Candidate = {
  box: BoxSpec
  rule: BoxRule
  distance: number
  kind: ResultKind
}

type SplitPlanStep = {
  candidate: Candidate
  assignedQuantity: number
}

type SplitPlan = {
  steps: SplitPlanStep[]
  boxCount: number
  totalVolumetricWeight: number
  totalBoxOrder: number
}

type RequestLine = {
  id: string
  itemId: string | null
  unit: PackUnit | null
  quantityInput: string
  quantityInputHasInvalidChars: boolean
}

type RequestResult = {
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

type BoardEditorState = {
  packerName: string
  packageNumber: string
  recipientName: string
  packageIndex: string
  shippingScope: ShippingScope
  fulfillmentMode: FulfillmentMode
  outerSizeInputs: OuterSizeParts
  weightInput: string
}

type UiCopy = {
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

const localeTags: Record<Language, string> = {
  en: 'en',
  zh: 'zh-CN',
  ja: 'ja-JP',
}

const languageOptions = [
  { id: 'ja', short: '日', label: '日本語' },
  { id: 'zh', short: '中', label: '中文' },
  { id: 'en', short: 'EN', label: 'English' },
] as const satisfies ReadonlyArray<{
  id: Language
  short: string
  label: string
}>

const fontScaleOrder: FontScale[] = [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25]

const uiCopy: Record<Language, UiCopy> = {
  en: {
    pageTitle: 'Carton Wizard',
    languageButton: 'Language',
    chooseLanguage: 'Choose language',
    switchLanguage: 'Switch language',
    fontSizeLabel: 'Text size',
    decreaseFontSize: 'Decrease text size',
    increaseFontSize: 'Increase text size',
    currentFontSizeAria: (value) => `Current text size ${value} px`,
    pageKicker: 'PDF-driven carton wizard',
    pageHeadline: 'Pick an item, enter quantity, and find the right carton.',
    pageIntro:
      'This multi-step form is based on the hand-drawn sketch and the remarks. Search an item name, enter quantity, and the wizard returns matching box numbers, outer dimensions, and volumetric weight.',
    sourceNote: 'Source: ダンボール表 / 備考',
    stepLabels: {
      item: 'Select Item & Quantity',
      result: 'Review Boxes',
    },
    stepDescriptions: {
      item: 'Search an item name from the remarks, then choose the unit and enter the quantity in the same step.',
      result: 'See exact matches first, then nearby box options when there is no exact rule.',
    },
    searchLabel: 'Item search',
    searchPlaceholder: '151, BBDX, OP, PRB-01...',
    chooseItem: 'Choose an item',
    addItem: 'Add item',
    removeItem: 'Remove',
    itemLine: (index) => `Item ${index}`,
    itemListHint: 'Add multiple items when the shipment includes more than one product.',
    incompleteItemsHint: 'Finish or remove incomplete items before continuing.',
    itemHint: 'The dropdown is searchable and built from all item names found in the remarks.',
    noItems: 'No item matches your search.',
    selectedItem: 'Selected item',
    quantityLabel: 'Quantity',
    quantityPlaceholder: 'Enter a quantity',
    quantityDigitsOnlyHint: 'Only digits are allowed in quantity.',
    unitLabel: 'Count unit',
    unitLegend: 'B = box, C = carton, BOX = boxed set, 個 = piece',
    conversionRule: 'PDF conversion rule',
    conversionBody: (item, factor) =>
      `${item} uses the PDF multiplier × ${factor.toFixed(2)} before box matching.`,
    effectiveQuantity: 'Effective quantity for matching',
    next: 'Next',
    back: 'Back',
    startOver: 'Reset form',
    matchingBoxes: 'Matching boxes',
    nearbyBoxes: 'Closest alternatives',
    noteOnlyBoxes: 'Linked boxes from the PDF',
    noExactTitle: 'No exact rule matched this quantity.',
    noExactBody:
      'The cards below are the nearest box rules for the selected item and unit.',
    boxNo: 'Box No.',
    partNo: 'Part No.',
    sizeGroup: 'Size group',
    outerSize: 'Outer size',
    volumetricWeight: 'Volumetric weight',
    volumetricWeightHelpLabel: 'How volumetric weight is calculated',
    volumetricWeightHelpBody:
      'Air shipment (DHL/FedEx): length (cm) × width (cm) × height (cm) / 5000 = volumetric weight (kg)',
    volumetricWeightBillingBody:
      'Applicable rate: the higher of actual weight and volumetric weight is used as the billable weight.',
    sourceColumn: 'Source column',
    sourceColumnHelpLabel: 'Show source column details',
    matchedRule: 'Matched rule',
    unitPriceYen: 'Unit price',
    unitPriceUnavailable: 'Not loaded from the PDF yet',
    extraNote: 'Note',
    selectedSummary: 'Item',
    quantitySummary: 'Entered quantity',
    effectiveSummary: 'Effective quantity',
    requestSummary: (quantity, unit, effectiveQuantity) =>
      `${quantity}${unit} / effective ${effectiveQuantity}`,
    exactBadge: 'Exact',
    nearBadge: 'Nearby',
    noteBadge: 'Reference',
    splitPlanTitle: 'Split box plan',
    splitPlanSummaryTitle: 'Recommended split',
    splitPlanSummary: (boxCount, quantity, unit) =>
      `Pack ${quantity}${unit} into ${boxCount} boxes.`,
    splitAssignedQuantity: 'Packed quantity',
    splitBoxBadge: (index) => `Box ${index} #${index}`,
    quantityUnknown: 'Quantity not specified in the PDF',
    quantityUnknownBody:
      'This item appears in the remarks column, but the PDF does not list a numeric range for automatic matching.',
    labelBoard: 'Shipping board',
    labelBoardHint:
      'Click a box card and the canvas preview on the right updates in a handwritten style.',
    packerNameLabel: 'Packer name',
    packerNamePlaceholder: 'Packer name',
    packageNumberLabel: 'Package number',
    packageNumberPlaceholder: '11',
    recipientLabel: 'Customer / company',
    recipientPlaceholder: 'Customer / Company',
    packageIndexLabel: 'Box index',
    packageIndexPlaceholder: '1',
    shippingScopeLabel: 'Shipment',
    domesticOption: 'Domestic',
    overseasOption: 'Overseas',
    fulfillmentLabel: 'Fulfillment',
    directOption: 'Direct',
    agencyOption: 'Agency',
    weightInputLabel: 'Weight (kg)',
    weightInputPlaceholder: '10.67',
    outerSizeVolumetricWeightValue: (weight) => `Calculated volumetric weight: ${weight} kg`,
    outerSizeVolumetricWeightHint: 'Enter all three dimensions to calculate volumetric weight.',
    selectedBoxHint: 'The selected box feeds the box number, size, and canvas board.',
    copyBoardHint: 'Click the copy button to copy the image below.',
    copyBoardImage: 'Copy board image',
    copiedBoardImage: 'Board image copied',
    copyBoardImageFailed: 'Copy failed',
    languageOptionAria: (label) => `Switch language to ${label}`,
  },
  zh: {
    pageTitle: '纸箱向导',
    languageButton: '语言',
    chooseLanguage: '选择语言',
    switchLanguage: '切换语言',
    fontSizeLabel: '字号',
    decreaseFontSize: '减小字号',
    increaseFontSize: '增大字号',
    currentFontSizeAria: (value) => `当前字号 ${value}`,
    pageKicker: '基于 PDF 的纸箱向导',
    pageHeadline: '选择物品并输入数量，快速找到对应纸箱。',
    pageIntro:
      '这个分页表单依据示意图和备注制作。搜索物品名，输入数量后，会返回匹配的纸箱编号、外寸和容积重量。',
    sourceNote: '数据来源：ダンボール表 / 備考',
    stepLabels: {
      item: '选择物品并输入数量',
      result: '查看纸箱',
    },
    stepDescriptions: {
      item: '先搜索备注中的物品名，再在同一步里选择单位并输入数量。',
      result: '优先显示精确匹配，没有精确规则时显示最接近的纸箱。',
    },
    searchLabel: '物品搜索',
    searchPlaceholder: '搜索 151、BBDX、OP、PRB-01...',
    chooseItem: '选择物品',
    addItem: '添加商品',
    removeItem: '删除',
    itemLine: (index) => `商品 ${index}`,
    itemListHint: '如果同一票货里有多个商品，可以继续添加。',
    incompleteItemsHint: '请先补全或删除未填写完整的商品行。',
    itemHint: '下拉菜单支持搜索，内容来自备注里的全部物品名。',
    noItems: '没有匹配的物品。',
    selectedItem: '已选物品',
    quantityLabel: '数量',
    quantityPlaceholder: '请输入数量',
    quantityDigitsOnlyHint: '数量只能输入数字。',
    unitLabel: '计数单位',
    unitLegend: 'B = 盒，C = 箱，BOX = 套装，個 = 件',
    conversionRule: 'PDF 换算规则',
    conversionBody: (item, factor) =>
      `${item} 会先按 PDF 规则乘以 ${factor.toFixed(2)}，再参与纸箱匹配。`,
    effectiveQuantity: '用于匹配的换算数量',
    next: '下一步',
    back: '上一步',
    startOver: '重置表单',
    matchingBoxes: '精确匹配纸箱',
    nearbyBoxes: '最接近的纸箱',
    noteOnlyBoxes: 'PDF 关联纸箱',
    noExactTitle: '当前数量没有精确命中规则。',
    noExactBody: '下面显示的是当前物品和单位下最接近的纸箱规则。',
    boxNo: '纸箱编号',
    partNo: '品番',
    sizeGroup: '尺寸组',
    outerSize: '外寸',
    volumetricWeight: '容积重量',
    volumetricWeightHelpLabel: '容积重量计算说明',
    volumetricWeightHelpBody:
      '航空便（DHL/FedEx）：长(cm) × 宽(cm) × 高(cm) / 5000 = 容积重量(kg)',
    volumetricWeightBillingBody:
      '适用费率：实际重量和容积重量中较高的一个将作为“计费重量”。',
    sourceColumn: '来源列',
    sourceColumnHelpLabel: '查看参考列内容',
    matchedRule: '匹配规则',
    unitPriceYen: '单价',
    unitPriceUnavailable: '仓库里还没有录入 PDF 单价',
    extraNote: '备注',
    selectedSummary: '物品',
    quantitySummary: '输入数量',
    effectiveSummary: '换算数量',
    requestSummary: (quantity, unit, effectiveQuantity) =>
      `${quantity}${unit} / 换算 ${effectiveQuantity}`,
    exactBadge: '精确',
    nearBadge: '接近',
    noteBadge: '参考',
    splitPlanTitle: '分箱方案',
    splitPlanSummaryTitle: '推荐分箱',
    splitPlanSummary: (boxCount, quantity, unit) => `共 ${boxCount} 箱，合计 ${quantity}${unit}。`,
    splitAssignedQuantity: '每箱数量',
    splitBoxBadge: (index) => `第${index}箱 #${index}`,
    quantityUnknown: 'PDF 未标注数量',
    quantityUnknownBody:
      '这个物品出现在备注列中，但 PDF 没有提供可自动匹配的数量区间。',
    labelBoard: '出货看板',
    labelBoardHint: '点击纸箱卡片后，右侧 canvas 会按手写样式更新。',
    packerNameLabel: '打包者姓名',
    packerNamePlaceholder: '打包者姓名',
    packageNumberLabel: '包裹号码',
    packageNumberPlaceholder: '11',
    recipientLabel: '顾客名 / 公司名',
    recipientPlaceholder: '顾客名 / 公司名',
    packageIndexLabel: '第几箱',
    packageIndexPlaceholder: '1',
    shippingScopeLabel: '寄送区域',
    domesticOption: '国内',
    overseasOption: '海外',
    fulfillmentLabel: '代行方式',
    directOption: '直发',
    agencyOption: '代行',
    weightInputLabel: '重量 (kg)',
    weightInputPlaceholder: '10.67',
    outerSizeVolumetricWeightValue: (weight) => `容积重量：${weight} kg`,
    outerSizeVolumetricWeightHint: '输入完整 3 个尺寸后会自动计算容积重量。',
    selectedBoxHint: '当前选中的箱子会同步到箱号、外寸和右侧看板。',
    copyBoardHint: '点击复制按钮，可以复制下方图片。',
    copyBoardImage: '复制看板图片',
    copiedBoardImage: '已复制看板图片',
    copyBoardImageFailed: '复制失败',
    languageOptionAria: (label) => `切换到${label}`,
  },
  ja: {
    pageTitle: '段ボールナビ',
    languageButton: '言語',
    chooseLanguage: '言語を選択',
    switchLanguage: '言語を切り替え',
    fontSizeLabel: '文字サイズ',
    decreaseFontSize: '文字サイズを小さく',
    increaseFontSize: '文字サイズを大きく',
    currentFontSizeAria: (value) => `現在の文字サイズ ${value}`,
    pageKicker: 'PDFベースの段ボールナビ',
    pageHeadline: '商品と数量を選んで、合う段ボール番号をすぐ確認。',
    pageIntro:
      'このページは手書きイメージと備考をもとにしたページ分割フォームです。商品名を検索し、数量を入れると、該当する箱番号・外寸・容積重量を表示します。',
    sourceNote: '参照元：ダンボール表 / 備考',
    stepLabels: {
      item: '商品選択と数量入力',
      result: '箱確認',
    },
    stepDescriptions: {
      item: '備考にある商品名を検索し、同じステップで単位と数量を入力します。',
      result: 'まず完全一致、その後に近い箱候補を表示します。',
    },
    searchLabel: '商品検索',
    searchPlaceholder: '151、BBDX、OP、PRB-01 を検索...',
    chooseItem: '商品を選択',
    addItem: '商品を追加',
    removeItem: '削除',
    itemLine: (index) => `商品 ${index}`,
    itemListHint: '同じ出荷に複数商品がある場合は、この下に追加できます。',
    incompleteItemsHint: '未入力の行は入力を完了するか削除してから進んでください。',
    itemHint: 'プルダウンは検索対応で、備考にある商品名をすべて収録しています。',
    noItems: '該当する商品がありません。',
    selectedItem: '選択中の商品',
    quantityLabel: '数量',
    quantityPlaceholder: '数量を入力',
    quantityDigitsOnlyHint: '数量には数字のみ入力できます。',
    unitLabel: '数量単位',
    unitLegend: 'B = ボックス、C = カートン、BOX = セット、個 = 個数',
    conversionRule: 'PDF 換算ルール',
    conversionBody: (item, factor) =>
      `${item} は PDF ルールに従って × ${factor.toFixed(2)} に換算してから箱判定します。`,
    effectiveQuantity: '判定に使う換算数量',
    next: '次へ',
    back: '戻る',
    startOver: 'フォームをリセット',
    matchingBoxes: '一致した箱',
    nearbyBoxes: '近い箱候補',
    noteOnlyBoxes: 'PDF に紐づく箱',
    noExactTitle: 'この数量に完全一致するルールはありません。',
    noExactBody: '下のカードに、選択した商品と単位に近い箱候補を表示しています。',
    boxNo: '箱番号',
    partNo: '品番',
    sizeGroup: 'サイズ区分',
    outerSize: '外寸',
    volumetricWeight: '容積重量',
    volumetricWeightHelpLabel: '容積重量の計算方法',
    volumetricWeightHelpBody:
      '航空便（DHL/FedEx）: 縦 (cm) × 横 (cm) × 高さ (cm) / 5000＝ 容積重量(kg)',
    volumetricWeightBillingBody:
      '適用運賃: 実重量と容積重量のうち、重い方が「請求重量」として使われます。',
    sourceColumn: '参照列',
    sourceColumnHelpLabel: '参照列の内容を表示',
    matchedRule: '一致ルール',
    unitPriceYen: '単価',
    unitPriceUnavailable: 'PDF の単価はまだ取り込まれていません',
    extraNote: '補足',
    selectedSummary: '商品',
    quantitySummary: '入力数量',
    effectiveSummary: '換算数量',
    requestSummary: (quantity, unit, effectiveQuantity) =>
      `${quantity}${unit} / 換算 ${effectiveQuantity}`,
    exactBadge: '一致',
    nearBadge: '近い',
    noteBadge: '参照',
    splitPlanTitle: '分箱プラン',
    splitPlanSummaryTitle: '推奨分箱',
    splitPlanSummary: (boxCount, quantity, unit) => `合計 ${quantity}${unit} を ${boxCount} 箱に分けます。`,
    splitAssignedQuantity: '箱内数量',
    splitBoxBadge: (index) => `${index}箱目 #${index}`,
    quantityUnknown: 'PDF に数量記載なし',
    quantityUnknownBody:
      'この商品名は備考欄にありますが、自動判定に使える数量レンジは PDF に記載されていません。',
    labelBoard: '発送看板',
    labelBoardHint: '箱カードを選ぶと、右側のプレビューが手書き風に更新されます。',
    packerNameLabel: '梱包者名',
    packerNamePlaceholder: '梱包者名',
    packageNumberLabel: '荷物番号',
    packageNumberPlaceholder: '11',
    recipientLabel: '顧客名/会社名',
    recipientPlaceholder: '顧客名/会社名',
    packageIndexLabel: '何箱目',
    packageIndexPlaceholder: '1',
    shippingScopeLabel: '発送先',
    domesticOption: '国内',
    overseasOption: '海外',
    fulfillmentLabel: '出荷方法',
    directOption: '直送',
    agencyOption: '代行',
    weightInputLabel: '重量 (kg)',
    weightInputPlaceholder: '10.67',
    outerSizeVolumetricWeightValue: (weight) => `計算した容積重量: ${weight} kg`,
    outerSizeVolumetricWeightHint: '3 辺をすべて入力すると容積重量を計算します。',
    selectedBoxHint: '選択中の箱の番号・外寸・看板プレビューをここに反映します。',
    copyBoardHint: 'コピーボタンをクリックすると、下の画像をコピーできます。',
    copyBoardImage: '看板画像をコピー',
    copiedBoardImage: '看板画像をコピーしました',
    copyBoardImageFailed: 'コピーに失敗しました',
    languageOptionAria: (label) => `${label} に切り替え`,
  },
}

const localizedMetaText: Record<string, Record<Language, string>> = {
  '薄 / 海外': {
    en: 'Thin / Overseas',
    zh: '薄 / 海外',
    ja: '薄 / 海外',
  },
  '厚 / 国内': {
    en: 'Thick / Domestic',
    zh: '厚 / 国内',
    ja: '厚 / 国内',
  },
  厚: {
    en: 'Thick',
    zh: '厚',
    ja: '厚',
  },
  '厚 / 薄': {
    en: 'Thick / Thin',
    zh: '厚 / 薄',
    ja: '厚 / 薄',
  },
  '薄 / 上段': {
    en: 'Thin / Upper layer',
    zh: '薄 / 上层',
    ja: '薄 / 上段',
  },
  '薄 / 下段': {
    en: 'Thin / Lower layer',
    zh: '薄 / 下层',
    ja: '薄 / 下段',
  },
  '8は平置き': {
    en: '8 laid flat',
    zh: '8 需要平码放置',
    ja: '8は平置き',
  },
  海外: {
    en: 'Overseas',
    zh: '海外',
    ja: '海外',
  },
  国内: {
    en: 'Domestic',
    zh: '国内',
    ja: '国内',
  },
  '海外 / おとす': {
    en: 'Overseas / lowered',
    zh: '海外 / 放低',
    ja: '海外 / おとす',
  },
  '国内 / おとす': {
    en: 'Domestic / lowered',
    zh: '国内 / 放低',
    ja: '国内 / おとす',
  },
  'PRB01 / 薄 / 海外 / おとす': {
    en: 'PRB01 / Thin / Overseas / lowered',
    zh: 'PRB01 / 薄 / 海外 / 放低',
    ja: 'PRB01 / 薄 / 海外 / おとす',
  },
  'PRB01 / 厚 / 国内 / おとす': {
    en: 'PRB01 / Thick / Domestic / lowered',
    zh: 'PRB01 / 厚 / 国内 / 放低',
    ja: 'PRB01 / 厚 / 国内 / おとす',
  },
  容積重量注意: {
    en: 'Watch volumetric weight',
    zh: '注意容积重量',
    ja: '容積重量注意',
  },
  'PRB02 / 上下反対にしておとす': {
    en: 'PRB02 / flip upside down and lower',
    zh: 'PRB02 / 上下反转后放低',
    ja: 'PRB02 / 上下反対にしておとす',
  },
  上下反対にしておとす: {
    en: 'Flip upside down and lower',
    zh: '上下反转后放低',
    ja: '上下反対にしておとす',
  },
  おとす: {
    en: 'Lowered',
    zh: '放低',
    ja: 'おとす',
  },
  画像では型番記載なし: {
    en: 'Model number not shown in the image',
    zh: '图片里未写型号',
    ja: '画像では型番記載なし',
  },
  専用: {
    en: 'Dedicated',
    zh: '专用',
    ja: '専用',
  },
  'PDF marks this row as 薄 / 厚.': {
    en: 'The source sheet marks this row as thin / thick.',
    zh: '原表将这一行标注为薄 / 厚。',
    ja: '原表ではこの行に薄 / 厚の注記があります。',
  },
  'PDF marks stock as unavailable.': {
    en: 'The source sheet marks this carton as unavailable.',
    zh: '原表标注该纸箱暂时无库存。',
    ja: '原表では在庫なし表記です。',
  },
  'PDF does not list a numeric quantity.': {
    en: 'The source sheet does not list a numeric quantity.',
    zh: '原表未写明可自动匹配的数量。',
    ja: '原表に数量記載がありません。',
  },
  'Not listed clearly in PDF': {
    en: 'Not listed clearly in the PDF',
    zh: 'PDF 中未清晰标注',
    ja: 'PDF で明確に読めません',
  },
  'The PDF preview does not show a readable outer size for FedEx Big.': {
    en: 'The PDF preview does not show a readable outer size for FedEx Big.',
    zh: 'PDF 预览中无法清晰读取 FedEx Big 的外寸。',
    ja: 'PDF プレビューでは FedEx Big の外寸が判読できません。',
  },
  オーダーメイド: {
    en: 'Custom-made',
    zh: '定制',
    ja: 'オーダーメイド',
  },
  '備考1（カートン）': {
    en: 'Remark 1 (Carton)',
    zh: '备注1（纸箱）',
    ja: '備考1（カートン）',
  },
  備考2: {
    en: 'Remark 2',
    zh: '备注2',
    ja: '備考2',
  },
  '備考3（BOX等）': {
    en: 'Remark 3 (BOX etc.)',
    zh: '备注3（BOX等）',
    ja: '備考3（BOX等）',
  },
}

const rangeRule = (
  itemId: string,
  unit: PackUnit,
  min: number,
  max: number,
  source: RuleSource,
  note?: string,
): BoxRule => ({
  itemId,
  unit,
  quantity: { min, max },
  source,
  note,
})

const noteRule = (
  itemId: string,
  unit: PackUnit,
  source: RuleSource,
  note: string,
): BoxRule => ({
  itemId,
  unit,
  quantity: { min: null, max: null },
  source,
  note,
})

const itemCatalog: CatalogItem[] = [
  { id: '151', label: '151', aliases: ['151'], preferredUnit: 'B' },
  { id: 'BBDX', label: 'BBDX', aliases: ['bbdx'], preferredUnit: 'B', multiplier: 0.77 },
  { id: 'WFDX', label: 'WFDX', aliases: ['wfdx'], preferredUnit: 'B', multiplier: 0.77 },
  { id: 'OP', label: 'OP', aliases: ['one piece op'], preferredUnit: 'B' },
  { id: 'PRB', label: 'PRB', aliases: ['prb'], preferredUnit: 'B' },
  { id: 'PRB-01', label: 'PRB-01', aliases: ['prb01'], preferredUnit: 'C' },
  { id: 'PRB-02', label: 'PRB-02', aliases: ['prb02'], preferredUnit: 'C' },
  { id: 'OP-08', label: 'OP-08', aliases: ['op08'], preferredUnit: 'C' },
  { id: 'OP-09', label: 'OP-09', aliases: ['op09'], preferredUnit: 'B' },
  { id: 'VSTAR', label: 'VSTAR', aliases: ['vstar'], preferredUnit: 'C' },
  { id: 'テラスタル', label: 'テラスタル', aliases: ['terasutaru', 'テラス'], preferredUnit: 'B' },
  { id: 'トウホク', label: 'トウホク', aliases: ['touhoku'], preferredUnit: 'B' },
  { id: 'ラブブビッグ', label: 'ラブブビッグ', aliases: ['labubu big'], preferredUnit: '個' },
  { id: 'ラブブマカロン', label: 'ラブブマカロン', aliases: ['labubu macaron'], preferredUnit: '個' },
  { id: 'ラブブコーラ', label: 'ラブブコーラ', aliases: ['labubu cola'], preferredUnit: '個' },
  { id: 'マリィ', label: 'マリィ', aliases: ['marnie'], preferredUnit: 'BOX' },
  { id: 'OPストレージBOX', label: 'OPストレージBOX', aliases: ['op storage box', 'opストレージbox', 'opストーレージbox'], preferredUnit: '個' },
  { id: 'OPストレージBOXセット', label: 'OPストレージBOXセット', aliases: ['op storage box set'], preferredUnit: 'BOX' },
  { id: 'メガトレーナー', label: 'メガトレーナー', aliases: ['mega trainer'], preferredUnit: 'B' },
  { id: 'ワンピースストレージBOX', label: 'ワンピースストレージBOX', aliases: ['one piece storage box'], preferredUnit: 'BOX' },
  { id: 'smisuki', label: 'smisuki', aliases: ['smiski'], preferredUnit: '個' },
  { id: 'キューピー(Dog)', label: 'キューピー(Dog)', aliases: ['qpie dog'], preferredUnit: '個' },
  { id: 'ユニアリ', label: 'ユニアリ', aliases: ['uni ari'], preferredUnit: 'C' },
  { id: 'ロルカナ', label: 'ロルカナ', aliases: ['lorcana'], preferredUnit: 'C' },
  { id: 'リーリエ', label: 'リーリエ', aliases: ['lillie'], preferredUnit: '個' },
  { id: 'アタッシュケース', label: 'アタッシュケース', aliases: ['attache case'], preferredUnit: '個' },
  { id: 'ソニーエンジェル', label: 'ソニーエンジェル', aliases: ['sony angel'], preferredUnit: '個' },
]

const boxCatalog: BoxSpec[] = [
  {
    id: 'box-1',
    order: 1,
    boxNo: '1',
    partNo: 'MA60-033',
    sizeGroup: '60',
    outerSize: '23 × 18 × 18 cm',
    volumetricWeight: 1.49,
    unitPriceYen: 64,
    rules: [
      rangeRule('151', 'B', 1, 5, '備考3（BOX等）'),
      rangeRule('テラスタル', 'B', 1, 8, '備考3（BOX等）'),
      rangeRule('BBDX', 'B', 8, 8, '備考3（BOX等）'),
      rangeRule('WFDX', 'B', 8, 8, '備考3（BOX等）'),
      rangeRule('OP', 'B', 1, 4, '備考3（BOX等）'),
      rangeRule('PRB', 'B', 1, 8, '備考3（BOX等）'),
    ],
  },
  {
    id: 'box-2',
    order: 2,
    boxNo: '2',
    partNo: 'MA80-1538',
    sizeGroup: '80',
    outerSize: '29 × 21 × 24 cm',
    volumetricWeight: 2.92,
    unitPriceYen: 93,
    rules: [
      rangeRule('PRB', 'C', 1, 1, '備考1（カートン）', 'PRB01'),
      rangeRule('PRB-01', 'C', 1, 1, '備考1（カートン）'),
      rangeRule('151', 'B', 6, 8, '備考3（BOX等）', '8は平置き'),
      rangeRule('テラスタル', 'B', 9, 12, '備考3（BOX等）'),
      rangeRule('BBDX', 'B', 8, 10, '備考3（BOX等）'),
      rangeRule('WFDX', 'B', 8, 10, '備考3（BOX等）'),
      rangeRule('OP', 'B', 5, 6, '備考3（BOX等）'),
      rangeRule('PRB', 'B', 9, 10, '備考3（BOX等）'),
    ],
  },
  {
    id: 'box-3',
    order: 3,
    boxNo: '3',
    partNo: 'MA80-059',
    sizeGroup: '80',
    outerSize: '31 × 31 × 17 cm',
    volumetricWeight: 3.26,
    unitPriceYen: 113,
    note: 'PDF marks this row as 薄 / 厚.',
    rules: [
      rangeRule('151', 'C', 1, 1, '備考1（カートン）'),
      rangeRule('151', 'B', 9, 14, '備考3（BOX等）'),
      rangeRule('テラスタル', 'B', 13, 18, '備考3（BOX等）'),
      rangeRule('BBDX', 'B', 11, 18, '備考3（BOX等）'),
      rangeRule('WFDX', 'B', 11, 18, '備考3（BOX等）'),
      rangeRule('OP', 'B', 7, 9, '備考3（BOX等）'),
      rangeRule('PRB', 'B', 11, 15, '備考3（BOX等）'),
    ],
  },
  {
    id: 'box-4',
    order: 4,
    boxNo: '4',
    partNo: 'MA100-531',
    sizeGroup: '100',
    outerSize: '36 × 27 × 22 cm',
    volumetricWeight: 4.27,
    unitPriceYen: 122,
    rules: [
      rangeRule('OP', 'C', 1, 1, '備考1（カートン）'),
      rangeRule('OP-08', 'C', 1, 1, '備考1（カートン）'),
      rangeRule('テラスタル', 'B', 19, 21, '備考3（BOX等）'),
      rangeRule('PRB', 'B', 16, 18, '備考3（BOX等）'),
      rangeRule('OP', 'B', 10, 12, '備考3（BOX等）'),
      rangeRule('BBDX', 'B', 18, 18, '備考3（BOX等）'),
      rangeRule('WFDX', 'B', 18, 18, '備考3（BOX等）'),
      rangeRule('トウホク', 'B', 6, 6, '備考3（BOX等）'),
      rangeRule('ラブブビッグ', '個', 1, 1, '備考3（BOX等）'),
    ],
  },
  {
    id: 'box-5',
    order: 5,
    boxNo: '5',
    partNo: 'MA100-078',
    sizeGroup: '100',
    outerSize: '41 × 31 × 17 cm',
    volumetricWeight: 4.32,
    unitPriceYen: 133,
    rules: [
      rangeRule('VSTAR', 'C', 1, 1, '備考1（カートン）'),
      rangeRule('テラスタル', 'C', 1, 1, '備考1（カートン）'),
      rangeRule('テラスタル', 'B', 19, 30, '備考3（BOX等）'),
      rangeRule('151', 'B', 15, 18, '備考3（BOX等）'),
      rangeRule('BBDX', 'B', 22, 22, '備考3（BOX等）'),
      rangeRule('WFDX', 'B', 22, 22, '備考3（BOX等）'),
      rangeRule('OP', 'B', 13, 15, '備考3（BOX等）'),
      rangeRule('PRB', 'B', 19, 25, '備考3（BOX等）'),
    ],
  },
  {
    id: 'box-6',
    order: 6,
    boxNo: '6',
    partNo: 'MA100-1276',
    sizeGroup: '100',
    outerSize: '38 × 29 × 21 cm',
    volumetricWeight: 4.62,
    unitPriceYen: 88,
    rules: [
      rangeRule('PRB', 'C', 1, 1, '備考1（カートン）', 'PRB02'),
      rangeRule('PRB-02', 'C', 1, 1, '備考1（カートン）'),
    ],
  },
  {
    id: 'box-7',
    order: 7,
    boxNo: '7',
    partNo: 'MA100-371',
    sizeGroup: '100',
    outerSize: '43 × 32 × 25 cm',
    volumetricWeight: 6.88,
    unitPriceYen: 162,
    rules: [
      rangeRule('VSTAR', 'C', 2, 2, '備考1（カートン）'),
      rangeRule('テラスタル', 'C', 2, 2, '備考1（カートン）'),
      rangeRule('マリィ', 'BOX', 1, 13, '備考1（カートン）'),
      rangeRule('OPストレージBOX', '個', 2, 2, '備考3（BOX等）', '７番を２つ合わせる'),
      rangeRule('メガトレーナー', 'B', 10, 10, '備考3（BOX等）'),
      rangeRule('トウホク', 'B', 10, 10, '備考3（BOX等）'),
    ],
  },
  {
    id: 'box-8-thin',
    order: 8,
    boxNo: '8',
    partNo: 'MA100-030',
    sizeGroup: '100',
    outerSize: '32 × 32 × 32 cm',
    volumetricWeight: 6.55,
    unitPriceYen: 104,
    variant: '薄 / 海外',
    rules: [
      rangeRule('PRB', 'C', 2, 2, '備考1（カートン）', 'PRB01 / 薄 / 海外 / おとす'),
      rangeRule('PRB-01', 'C', 2, 2, '備考1（カートン）', '海外 / おとす'),
      rangeRule('151', 'C', 2, 2, '備考1（カートン）', '海外'),
    ],
  },
  {
    id: 'box-8-thick',
    order: 9,
    boxNo: '8',
    partNo: 'MA100-1328',
    sizeGroup: '100',
    outerSize: '32 × 32 × 34 cm',
    volumetricWeight: 6.96,
    unitPriceYen: 179,
    variant: '厚 / 国内',
    rules: [
      rangeRule('151', 'C', 2, 2, '備考1（カートン）', '国内'),
      rangeRule('PRB', 'C', 2, 2, '備考1（カートン）', 'PRB01 / 厚 / 国内 / おとす'),
      rangeRule('PRB-01', 'C', 2, 2, '備考1（カートン）', '国内 / おとす'),
      rangeRule('テラスタル', 'B', 31, 42, '備考3（BOX等）'),
      rangeRule('151', 'B', 23, 28, '備考3（BOX等）'),
      rangeRule('BBDX', 'B', 34, 34, '備考3（BOX等）'),
      rangeRule('WFDX', 'B', 34, 34, '備考3（BOX等）'),
    ],
  },
  {
    id: 'box-10',
    order: 10,
    boxNo: '10',
    partNo: 'MA120-991',
    sizeGroup: '120',
    outerSize: '36 × 36 × 37 cm',
    volumetricWeight: 9.59,
    unitPriceYen: 196,
    rules: [
      rangeRule('PRB', 'C', 4, 4, '備考1（カートン）', 'PRB01'),
      rangeRule('PRB-01', 'C', 4, 4, '備考1（カートン）'),
      rangeRule('OP-09', 'B', 32, 32, '備考1（カートン）'),
      rangeRule('smisuki', '個', 100, 100, '備考1（カートン）'),
      rangeRule('151', 'B', 29, 32, '備考3（BOX等）'),
      rangeRule('テラスタル', 'B', 43, 56, '備考3（BOX等）'),
      rangeRule('OP', 'B', 21, 32, '備考3（BOX等）'),
      rangeRule('PRB', 'B', 33, 48, '備考3（BOX等）', '容積重量注意'),
      rangeRule('BBDX', 'B', 40, 40, '備考3（BOX等）'),
      rangeRule('WFDX', 'B', 40, 40, '備考3（BOX等）'),
      rangeRule('ワンピースストレージBOX', 'BOX', 24, 24, '備考3（BOX等）'),
      rangeRule('キューピー(Dog)', '個', 100, 100, '備考3（BOX等）'),
    ],
  },
  {
    id: 'box-11',
    order: 11,
    boxNo: '11',
    partNo: 'オーダーメイド',
    sizeGroup: '120',
    outerSize: '55 × 34 × 32 cm',
    volumetricWeight: 11.96,
    unitPriceYen: 282,
    variant: '厚',
    rules: [
      rangeRule('151', 'C', 4, 4, '備考1（カートン）'),
      rangeRule('PRB', 'C', 3, 3, '備考1（カートン）', 'PRB01,02'),
      rangeRule('PRB-01', 'C', 3, 3, '備考1（カートン）', 'PRB01,02'),
      rangeRule('PRB-02', 'C', 3, 3, '備考1（カートン）', 'PRB01,02'),
      rangeRule('151', 'B', 49, 52, '備考3（BOX等）'),
      rangeRule('テラスタル', 'B', 71, 88, '備考3（BOX等）'),
      rangeRule('OP', 'B', 41, 50, '備考3（BOX等）'),
      rangeRule('BBDX', 'B', 60, 68, '備考3（BOX等）'),
      rangeRule('WFDX', 'B', 60, 68, '備考3（BOX等）'),
    ],
  },
  {
    id: 'box-12',
    order: 12,
    boxNo: '12',
    partNo: 'MA120-974',
    sizeGroup: '120',
    outerSize: '46 × 36 × 37 cm',
    volumetricWeight: 12.25,
    unitPriceYen: 211,
    variant: '厚 / 薄',
    rules: [
      rangeRule('ワンピースストレージBOX', 'BOX', 30, 30, '備考1（カートン）'),
      rangeRule('ユニアリ', 'C', 2, 2, '備考1（カートン）'),
      rangeRule('OP', 'C', 3, 3, '備考1（カートン）'),
      rangeRule('OP-08', 'C', 3, 3, '備考1（カートン）'),
      rangeRule('ロルカナ', 'C', 2, 4, '備考1（カートン）'),
      rangeRule('PRB', 'C', 5, 5, '備考1（カートン）', 'PRB01'),
      rangeRule('PRB-01', 'C', 5, 5, '備考1（カートン）'),
      rangeRule('151', 'C', 3, 3, '備考1（カートン）'),
      rangeRule('151', 'B', 33, 48, '備考3（BOX等）'),
      rangeRule('BBDX', 'B', 64, 64, '備考3（BOX等）', '下段8*4, 上段8*4'),
      rangeRule('WFDX', 'B', 64, 64, '備考3（BOX等）', '下段8*4, 上段8*4'),
      rangeRule('テラスタル', 'C', 3, 3, '備考1（カートン）'),
      rangeRule('テラスタル', 'B', 57, 70, '備考3（BOX等）'),
      rangeRule('OP', 'B', 33, 40, '備考3（BOX等）'),
      rangeRule('PRB', 'B', 49, 64, '備考3（BOX等）'),
      rangeRule('トウホク', 'B', 15, 15, '備考3（BOX等）'),
    ],
  },
  {
    id: 'box-13-upper',
    order: 13,
    boxNo: '13',
    partNo: 'K-120K',
    sizeGroup: '120',
    outerSize: '46 × 36 × 27 cm',
    volumetricWeight: 8.94,
    unitPriceYen: 156,
    variant: '薄 / 上段',
    rules: [
      rangeRule('OP', 'C', 2, 2, '備考1（カートン）'),
      rangeRule('PRB', 'C', 2, 2, '備考1（カートン）', 'PRB02 / 上下反対にしておとす'),
      rangeRule('OP-09', 'C', 2, 2, '備考1（カートン）'),
      rangeRule('PRB-02', 'C', 2, 2, '備考1（カートン）', '上下反対にしておとす'),
      rangeRule('リーリエ', '個', 10, 10, '備考3（BOX等）', 'おとす'),
    ],
  },
  {
    id: 'box-13-lower',
    order: 14,
    boxNo: '13',
    partNo: 'K-120K',
    sizeGroup: '120',
    outerSize: '46 × 36 × 18 cm',
    volumetricWeight: 5.96,
    unitPriceYen: 156,
    variant: '薄 / 下段',
    rules: [
      rangeRule('151', 'B', 19, 22, '備考3（BOX等）'),
      rangeRule('テラスタル', 'B', 40, 40, '備考3（BOX等）'),
      rangeRule('OP', 'B', 16, 20, '備考3（BOX等）'),
      rangeRule('PRB', 'B', 26, 32, '備考3（BOX等）'),
      rangeRule('OP-09', 'B', 20, 20, '備考3（BOX等）'),
      rangeRule('BBDX', 'B', 28, 28, '備考3（BOX等）'),
      rangeRule('WFDX', 'B', 28, 28, '備考3（BOX等）'),
    ],
  },
  {
    id: 'box-14',
    order: 15,
    boxNo: '14',
    partNo: 'MA140-643',
    sizeGroup: '140',
    outerSize: '52 × 42 × 44 cm',
    volumetricWeight: 19.21,
    unitPriceYen: 370,
    rules: [
      rangeRule('OP', 'C', 4, 4, '備考1（カートン）'),
      rangeRule('OP-08', 'C', 4, 4, '備考1（カートン）', 'おとす'),
      rangeRule('テラスタル', 'C', 5, 5, '備考1（カートン）', 'おとす'),
      rangeRule('アタッシュケース', '個', 2, 2, '備考1（カートン）'),
      rangeRule('151', 'B', 53, 60, '備考3（BOX等）'),
      rangeRule('BBDX', 'B', 76, 92, '備考3（BOX等）'),
      rangeRule('WFDX', 'B', 76, 92, '備考3（BOX等）'),
      rangeRule('OP', 'B', 51, 60, '備考3（BOX等）', 'おとす'),
      rangeRule('ラブブマカロン', '個', 4, 4, '備考3（BOX等）'),
    ],
  },
  {
    id: 'box-16',
    order: 16,
    boxNo: '16',
    partNo: 'K-DA012',
    sizeGroup: '140',
    outerSize: '61 × 41 × 37 cm',
    volumetricWeight: 18.5,
    note: 'PDF marks stock as unavailable.',
    rules: [
      rangeRule('OPストレージBOXセット', 'BOX', 20, 20, '備考1（カートン）', '専用'),
    ],
  },
  {
    id: 'box-dhl8',
    order: 17,
    boxNo: 'DHL8',
    partNo: 'DHL8',
    sizeGroup: '140',
    outerSize: '54 × 45 × 42 cm',
    volumetricWeight: 20.4,
    rules: [
      rangeRule('OP', 'C', 5, 5, '備考1（カートン）'),
      rangeRule('PRB', 'C', 4, 4, '備考1（カートン）', 'PRB02'),
      rangeRule('OP-08', 'C', 5, 5, '備考1（カートン）'),
      rangeRule('PRB-02', 'C', 4, 4, '備考1（カートン）'),
      rangeRule('151', 'C', 5, 5, '備考1（カートン）'),
      rangeRule('トウホク', 'B', 30, 30, '備考3（BOX等）', 'おとす'),
      rangeRule('ラブブコーラ', '個', 4, 4, '備考3（BOX等）'),
    ],
  },
  {
    id: 'box-dhl7',
    order: 18,
    boxNo: 'DHL7',
    partNo: 'DHL7',
    sizeGroup: '130',
    outerSize: '48 × 41 × 40 cm',
    volumetricWeight: 15.7,
    rules: [
      rangeRule('151', 'C', 4, 4, '備考1（カートン）'),
      rangeRule('OP', 'C', 4, 4, '備考1（カートン）'),
      rangeRule('PRB', 'C', 6, 6, '備考1（カートン）', 'PRB01'),
      rangeRule('PRB', 'C', 3, 3, '備考1（カートン）', 'PRB02'),
      rangeRule('OP-08', 'C', 4, 4, '備考1（カートン）'),
      rangeRule('PRB-01', 'C', 6, 6, '備考1（カートン）'),
      rangeRule('PRB-02', 'C', 3, 3, '備考1（カートン）'),
      noteRule('ソニーエンジェル', '個', '備考1（カートン）', 'PDF does not list a numeric quantity.'),
      rangeRule('151', 'B', 41, 60, '備考3（BOX等）'),
      rangeRule('テラスタル', 'B', 89, 90, '備考3（BOX等）'),
      rangeRule('BBDX', 'B', 76, 92, '備考3（BOX等）'),
      rangeRule('WFDX', 'B', 76, 92, '備考3（BOX等）'),
    ],
  },
  {
    id: 'box-dhl6',
    order: 19,
    boxNo: 'DHL6',
    partNo: 'DHL6',
    sizeGroup: '120',
    outerSize: '42 × 37 × 37 cm',
    volumetricWeight: 11.5,
    rules: [
      rangeRule('PRB', 'C', 4, 4, '備考1（カートン）', '画像では型番記載なし'),
      rangeRule('PRB-01', 'C', 4, 4, '備考1（カートン）'),
      rangeRule('PRB-02', 'C', 4, 4, '備考1（カートン）', '画像では型番記載なし'),
      rangeRule('151', 'B', 33, 40, '備考3（BOX等）'),
      rangeRule('BBDX', 'B', 50, 50, '備考3（BOX等）'),
      rangeRule('WFDX', 'B', 50, 50, '備考3（BOX等）'),
    ],
  },
  {
    id: 'box-dhl5',
    order: 20,
    boxNo: 'DHL5',
    partNo: 'DHL5',
    sizeGroup: '100',
    outerSize: '34 × 32 × 34 cm',
    volumetricWeight: 7.39,
    rules: [
      rangeRule('151', 'B', 17, 32, '備考3（BOX等）'),
    ],
  },
  {
    id: 'box-dhl4',
    order: 21,
    boxNo: 'DHL4',
    partNo: 'DHL4',
    sizeGroup: '86',
    outerSize: '34 × 33 × 19 cm',
    volumetricWeight: 4.26,
    rules: [
      rangeRule('151', 'B', 1, 16, '備考3（BOX等）'),
      rangeRule('BBDX', 'B', 22, 22, '備考3（BOX等）'),
      rangeRule('WFDX', 'B', 22, 22, '備考3（BOX等）'),
    ],
  },
  {
    id: 'box-fedex-small',
    order: 22,
    boxNo: 'FedEx Small',
    partNo: 'FedEx Small',
    sizeGroup: 'FedEx',
    outerSize: '33 × 26 × 33 cm',
    volumetricWeight: 7.39,
    rules: [
      rangeRule('151', 'C', 2, 2, '備考1（カートン）'),
      rangeRule('151', 'B', 24, 24, '備考3（BOX等）'),
    ],
  },
  {
    id: 'box-fedex-big',
    order: 23,
    boxNo: 'FedEx Big',
    partNo: 'FedEx Big',
    sizeGroup: 'FedEx',
    outerSize: 'Not listed clearly in PDF',
    volumetricWeight: 4.26,
    note: 'The PDF preview does not show a readable outer size for FedEx Big.',
    rules: [
      rangeRule('151', 'C', 5, 5, '備考1（カートン）'),
      rangeRule('151', 'B', 152, 152, '備考3（BOX等）'),
    ],
  },
]

const stepOrder: StepId[] = ['item', 'result']
let requestLineCounter = 0

function createRequestLine(): RequestLine {
  requestLineCounter += 1

  return {
    id: `request-${requestLineCounter}`,
    itemId: null,
    unit: null,
    quantityInput: '',
    quantityInputHasInvalidChars: false,
  }
}

function createEmptyBoardEditorState(): BoardEditorState {
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

function createBoardEditorState(
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
    weightInput: candidate.box.volumetricWeight.toFixed(2),
  }
}

function cloneBoardEditorState(state: BoardEditorState): BoardEditorState {
  return {
    ...state,
    outerSizeInputs: [...state.outerSizeInputs] as OuterSizeParts,
  }
}

function isBoardEditorStateEqual(left: BoardEditorState | undefined, right: BoardEditorState) {
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

function getInitialLanguage(): Language {
  return 'ja'
}

function getInitialFontScale(): FontScale {
  if (typeof window === 'undefined') {
    return 16
  }

  const stored = window.localStorage.getItem('packing-demo-font-scale')

  if (stored === 'sm') {
    return 15
  }

  if (stored === 'md') {
    return 16
  }

  if (stored === 'lg') {
    return 17
  }

  const parsed = Number(stored)

  if (
    parsed === 13 ||
    parsed === 14 ||
    parsed === 15 ||
    parsed === 16 ||
    parsed === 17 ||
    parsed === 18 ||
    parsed === 19 ||
    parsed === 20 ||
    parsed === 21 ||
    parsed === 22 ||
    parsed === 23 ||
    parsed === 24 ||
    parsed === 25
  ) {
    return parsed
  }

  return 16
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

function getDistance(rule: BoxRule, quantity: number) {
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

function isNumericRule(rule: BoxRule): rule is BoxRule & { quantity: { min: number; max: number } } {
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

function buildSplitPlan(candidates: Candidate[], quantity: number): SplitPlan | null {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return null
  }

  const options = candidates.filter((candidate) => isNumericRule(candidate.rule))

  if (options.length === 0) {
    return null
  }

  const plans: Array<SplitPlan | null> = Array.from({ length: quantity + 1 }, () => null)
  plans[0] = {
    steps: [],
    boxCount: 0,
    totalVolumetricWeight: 0,
    totalBoxOrder: 0,
  }

  for (let total = 1; total <= quantity; total += 1) {
    let bestPlan: SplitPlan | null = null

    for (const option of options) {
      const minQuantity = option.rule.quantity.min
      const maxQuantity = option.rule.quantity.max

      if (minQuantity === null || maxQuantity === null) {
        continue
      }

      if (minQuantity > total) {
        continue
      }

      const upperBound = Math.min(maxQuantity, total)

      for (
        let assignedQuantity = minQuantity;
        assignedQuantity <= upperBound;
        assignedQuantity += 1
      ) {
        const previousPlan = plans[total - assignedQuantity]

        if (!previousPlan) {
          continue
        }

        const nextPlan: SplitPlan = {
          steps: [
            ...previousPlan.steps,
            {
              candidate: option,
              assignedQuantity,
            },
          ],
          boxCount: previousPlan.boxCount + 1,
          totalVolumetricWeight:
            previousPlan.totalVolumetricWeight + option.box.volumetricWeight,
          totalBoxOrder: previousPlan.totalBoxOrder + option.box.order,
        }

        if (!bestPlan || compareSplitPlans(nextPlan, bestPlan) < 0) {
          bestPlan = nextPlan
        }
      }
    }

    plans[total] = bestPlan
  }

  return plans[quantity]
}

function getItemUnits(itemId: string | null) {
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

function getCandidateKey(candidate: Candidate) {
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

function findSplitStepIndex(
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

function getBoardTargetKey(
  result: RequestResult | null,
  candidate: Candidate | null,
  splitStepIndex: number | null,
) {
  if (!result || !candidate) {
    return null
  }

  if (splitStepIndex !== null) {
    return `${result.line.id}::split::${splitStepIndex}::${getCandidateKey(candidate)}`
  }

  return `${result.line.id}::candidate::${getCandidateKey(candidate)}`
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

function formatBoardBoxLabel(boxNo: string, packageIndex: string) {
  const safeIndex = packageIndex.trim() || '1'

  return `${boxNo}#${safeIndex}`
}

type BoardDrawingData = {
  recipient: string
  packerMark: string
  modeMark: string
  boxLabel: string
  weightText: string
  outerSizeText: string
  productLines: string[]
}

const canvasBoardFallbackText = {
  recipient: '顧客名/会社名',
  packageNumber: '11',
  outerSize: '外寸',
  product: '商品数量',
  weight: '10.67',
} as const

function drawSketchCircle(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
) {
  context.beginPath()
  context.ellipse(x, y, radius, radius * 0.92, -0.12, 0, Math.PI * 2)
  context.stroke()
  context.beginPath()
  context.ellipse(x + 1.5, y - 1, radius * 0.96, radius, 0.08, 0, Math.PI * 2)
  context.stroke()
}

function formatPackerMark(name: string) {
  const normalized = name.trim().replace(/\s+/g, '')

  if (!normalized) {
    return '包'
  }

  return Array.from(normalized).slice(0, 2).join('')
}

function formatBoardModeMark(
  shippingScope: ShippingScope,
  fulfillmentMode: FulfillmentMode,
) {
  if (shippingScope === 'domestic') {
    return '国内'
  }

  return fulfillmentMode === 'agency' ? '代' : ''
}

function formatCanvasOuterSize(text: string) {
  return text
    .trim()
    .replace(/\s*(?:×|x|X)\s*/g, ', ')
    .replace(/\s*cm\b/gi, '')
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseOuterSizeParts(text: string): OuterSizeParts {
  const normalized = text.trim().replace(/\s*cm\b/gi, '')

  if (!normalized) {
    return ['', '', '']
  }

  const separatedParts = normalized
    .split(/\s*(?:×|x|X|,)\s*/g)
    .map((part) => part.trim())
    .filter(Boolean)

  if (separatedParts.length >= 3) {
    return [separatedParts[0], separatedParts[1], separatedParts[2]]
  }

  const numericParts = normalized.match(/[\d.]+/g)

  if (numericParts && numericParts.length >= 3) {
    return [numericParts[0], numericParts[1], numericParts[2]]
  }

  return [separatedParts[0] ?? normalized, separatedParts[1] ?? '', separatedParts[2] ?? '']
}

function formatCanvasOuterSizeParts(parts: OuterSizeParts) {
  return parts
    .map((part) => formatCanvasOuterSize(part))
    .filter(Boolean)
    .join(', ')
}

function drawCircleText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  radius: number,
  fontFamily: string,
) {
  const characterCount = Array.from(text).length
  const fontSize = Math.round(radius * (characterCount > 1 ? 0.98 : 1.26))

  context.font = `700 ${fontSize}px ${fontFamily}`
  context.textAlign = 'center'
  context.fillText(text, x, y + 1)
}

function fitTextToWidth(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
) {
  if (maxWidth <= 0) {
    return ''
  }

  if (context.measureText(text).width <= maxWidth) {
    return text
  }

  const characters = Array.from(text)

  if (characters.length === 0) {
    return ''
  }

  const suffix = '…'
  let low = 0
  let high = characters.length

  while (low < high) {
    const mid = Math.ceil((low + high) / 2)
    const candidate = `${characters.slice(0, mid).join('')}${suffix}`

    if (context.measureText(candidate).width <= maxWidth) {
      low = mid
    } else {
      high = mid - 1
    }
  }

  return `${characters.slice(0, low).join('')}${suffix}`
}

function limitBoardProductLines(productLines: string[], maxLines: number) {
  if (productLines.length <= maxLines) {
    return productLines
  }

  return [
    ...productLines.slice(0, Math.max(0, maxLines - 1)),
    `${productLines[maxLines - 1]}…`,
  ]
}

function getBoardBoxLabelParts(boxLabel: string) {
  const match = boxLabel.match(/^(\d+)#(.+)$/)

  if (!match) {
    return null
  }

  return {
    boxNo: match[1],
    packageIndex: match[2],
  }
}

function measureBoardBoxLabel(
  context: CanvasRenderingContext2D,
  boxLabel: string,
  height: number,
  fontFamily: string,
) {
  const numericLabel = getBoardBoxLabelParts(boxLabel)

  context.font = `700 ${Math.round(height * 0.11)}px ${fontFamily}`

  if (!numericLabel) {
    return context.measureText(boxLabel).width
  }

  const circleRadius = height * (numericLabel.boxNo.length > 1 ? 0.076 : 0.062)
  const suffixWidth = context.measureText(`#${numericLabel.packageIndex}`).width
  const gap = height * -0.022

  return circleRadius * 2 + gap + suffixWidth
}

function drawBoardBoxLabel(
  context: CanvasRenderingContext2D,
  boxLabel: string,
  rightX: number,
  y: number,
  height: number,
  fontFamily: string,
) {
  const numericLabel = getBoardBoxLabelParts(boxLabel)

  context.font = `700 ${Math.round(height * 0.11)}px ${fontFamily}`

  if (!numericLabel) {
    context.textAlign = 'right'
    context.fillText(boxLabel, rightX, y + 2)
    return
  }

  const circleRadius = height * (numericLabel.boxNo.length > 1 ? 0.076 : 0.062)
  const gap = height * -0.022
  const suffix = `#${numericLabel.packageIndex}`
  const suffixWidth = context.measureText(suffix).width
  const circleCenterX = rightX - suffixWidth - gap - circleRadius

  drawSketchCircle(context, circleCenterX, y, circleRadius)
  drawCircleText(context, numericLabel.boxNo, circleCenterX, y, circleRadius, fontFamily)

  context.textAlign = 'right'
  context.fillText(suffix, rightX, y + 2)
}

function drawShippingBoard(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  data: BoardDrawingData,
) {
  context.clearRect(0, 0, width, height)

  const paperGradient = context.createLinearGradient(0, 0, width, height)
  paperGradient.addColorStop(0, '#fffdfa')
  paperGradient.addColorStop(1, '#f6efe5')
  context.fillStyle = paperGradient
  context.fillRect(0, 0, width, height)

  context.fillStyle = '#1f1915'
  context.strokeStyle = '#1f1915'
  context.lineCap = 'round'
  context.lineJoin = 'round'
  context.lineWidth = 3.2

  const fontFamily =
    '"Hiragino Sans", "Yu Gothic", "PingFang SC", "Avenir Next", sans-serif'

  context.font = `700 ${Math.round(height * 0.12)}px ${fontFamily}`
  context.textBaseline = 'middle'

  const topLineY = height * 0.28
  const secondLineY = height * 0.5
  const thirdLineY = height * 0.69
  const leftCircleX = width * 0.1
  const rightCircleX = width * 0.86
  const hasModeCircle = data.modeMark.trim().length > 0
  const rightCircleRadius =
    hasModeCircle
      ? data.modeMark === '国内'
        ? height * 0.104
        : Array.from(data.modeMark).length > 1
        ? height * 0.09
        : height * 0.074
      : 0
  const rightCircleTextRadius = data.modeMark === '国内' ? height * 0.09 : rightCircleRadius

  drawSketchCircle(context, leftCircleX, topLineY, height * 0.085)
  drawCircleText(context, data.packerMark, leftCircleX, topLineY, height * 0.085, fontFamily)

  if (hasModeCircle) {
    drawSketchCircle(context, rightCircleX, topLineY, rightCircleRadius)
    drawCircleText(
      context,
      data.modeMark,
      rightCircleX,
      topLineY,
      rightCircleTextRadius,
      fontFamily,
    )
  }

  const recipientFontSize =
    data.recipient.length > 14 ? Math.round(height * 0.1) : Math.round(height * 0.12)
  const recipientX = width * 0.18
  const boxLabelRightX = hasModeCircle
    ? rightCircleX - rightCircleRadius - height * 0.028
    : width * 0.94
  const topRowGap = width * 0.028

  const boxLabelWidth = measureBoardBoxLabel(context, data.boxLabel, height, fontFamily)

  context.font = `700 ${recipientFontSize}px ${fontFamily}`
  const recipientText = fitTextToWidth(
    context,
    data.recipient,
    boxLabelRightX - boxLabelWidth - topRowGap - recipientX,
  )
  context.textAlign = 'left'
  context.fillText(recipientText, recipientX, topLineY + 2)

  drawBoardBoxLabel(context, data.boxLabel, boxLabelRightX, topLineY, height, fontFamily)

  context.textAlign = 'left'
  context.fillText(data.weightText, width * 0.16, secondLineY)
  context.fillText(data.outerSizeText, width * 0.48, secondLineY)

  const visibleProductLines = limitBoardProductLines(data.productLines, 4)
  const productFontSize =
    visibleProductLines.length >= 4
      ? Math.round(height * 0.064)
      : visibleProductLines.length === 3
        ? Math.round(height * 0.076)
        : visibleProductLines.length === 2
          ? Math.round(height * 0.094)
          : Math.round(height * 0.12)
  const productLineHeight = productFontSize * 1.16
  const productMaxWidth = width * 0.74
  const productStartY = thirdLineY - (productLineHeight * (visibleProductLines.length - 1)) / 2

  context.font = `700 ${productFontSize}px ${fontFamily}`
  visibleProductLines.forEach((line, index) => {
    const fittedLine = fitTextToWidth(context, line, productMaxWidth)
    context.fillText(fittedLine, width * 0.16, productStartY + index * productLineHeight)
  })
}

function App() {
  const [language, setLanguage] = useState<Language>(getInitialLanguage)
  const [fontScale, setFontScale] = useState<FontScale>(getInitialFontScale)
  const [isFontSizeMenuOpen, setIsFontSizeMenuOpen] = useState(false)
  const [isLanguageMenuOpen, setIsLanguageMenuOpen] = useState(false)
  const [openHelpKey, setOpenHelpKey] = useState<string | null>(null)
  const [activeStep, setActiveStep] = useState<StepId>('item')
  const [isItemMenuOpen, setIsItemMenuOpen] = useState(false)
  const [activePickerLineId, setActivePickerLineId] = useState<string | null>(null)
  const [itemSearch, setItemSearch] = useState('')
  const [requestLines, setRequestLines] = useState<RequestLine[]>(() => [createRequestLine()])
  const [selectedResultLineId, setSelectedResultLineId] = useState<string | null>(null)
  const [selectedCandidateKey, setSelectedCandidateKey] = useState<string | null>(null)
  const [selectedSplitStepIndex, setSelectedSplitStepIndex] = useState<number | null>(null)
  const [boardEditorState, setBoardEditorState] = useState<BoardEditorState>(
    createEmptyBoardEditorState,
  )
  const [boardStateByTarget, setBoardStateByTarget] = useState<Record<string, BoardEditorState>>({})
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
  const lastLoadedBoardTargetKeyRef = useRef<string | null>(null)

  const deferredItemSearch = useDeferredValue(itemSearch.trim().toLowerCase())
  const ui = uiCopy[language]
  const currentLanguageOption =
    languageOptions.find((option) => option.id === language) ?? languageOptions[0]
  const fontScaleIndex = fontScaleOrder.indexOf(fontScale)
  const currentFontSizeValue = fontScale
  const canDecreaseFontScale = fontScaleIndex > 0
  const canIncreaseFontScale = fontScaleIndex < fontScaleOrder.length - 1
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

  const updateBoardEditorState = (
    updater: (current: BoardEditorState) => BoardEditorState,
  ) => {
    setBoardEditorState(updater)
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
    window.localStorage.setItem('packing-demo-font-scale', String(fontScale))

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

  const requestResults = requestLines.map<RequestResult>((line) => {
    const item = itemCatalog.find((catalogItem) => catalogItem.id === line.itemId) ?? null
    const parsedQuantity = Number(line.quantityInput)
    const quantity = Number.isFinite(parsedQuantity) && parsedQuantity > 0 ? parsedQuantity : 0
    const availableUnits = getItemUnits(line.itemId)
    const effectiveQuantity =
      item && quantity > 0
        ? Math.ceil(quantity * (item.multiplier ?? 1))
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
      exactMatches.length === 0 ? buildSplitPlan(relevantCandidates, effectiveQuantity) : null
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
    const isComplete = Boolean(item && line.unit && quantity > 0)

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
  const completedRequestResults = requestResults.filter((result) => result.isComplete)
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
  const hasAnyOuterSizeInput = outerSizeInputs.some((value) => value.trim() !== '')
  const [outerLength, outerWidth, outerHeight] =
    outerSizeInputs.map(parseOuterSizeNumber) as [number | null, number | null, number | null]
  const calculatedVolumetricWeight =
    outerLength !== null && outerWidth !== null && outerHeight !== null
      ? (outerLength * outerWidth * outerHeight) / 5000
      : null

  useEffect(() => {
    if (resolvedBoardTargetKey === lastLoadedBoardTargetKeyRef.current) {
      return
    }

    if (!resolvedBoardTargetKey) {
      setBoardEditorState(createEmptyBoardEditorState())
      lastLoadedBoardTargetKeyRef.current = null
      return
    }

    lastLoadedBoardTargetKeyRef.current = resolvedBoardTargetKey
    setBoardEditorState((current) =>
      cloneBoardEditorState(
        boardStateByTarget[resolvedBoardTargetKey] ??
          createBoardEditorState(
            current,
            selectedPreviewCandidate,
            resolvedSelectedSplitStepIndex,
          ),
      ),
    )
  }, [
    boardStateByTarget,
    resolvedBoardTargetKey,
    resolvedSelectedSplitStepIndex,
    selectedPreviewCandidate,
  ])

  useEffect(() => {
    if (!resolvedBoardTargetKey) {
      return
    }

    setBoardStateByTarget((current) => {
      if (isBoardEditorStateEqual(current[resolvedBoardTargetKey], boardEditorState)) {
        return current
      }

      return {
        ...current,
        [resolvedBoardTargetKey]: cloneBoardEditorState(boardEditorState),
      }
    })
  }, [boardEditorState, resolvedBoardTargetKey])

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

    setBoardStateByTarget((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([key]) => !key.startsWith(`${lineId}::`)),
      ),
    )
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
    if (activeStep !== 'result' || !defaultPreviewResult || !defaultPreviewResult.defaultCandidate) {
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

    const rect = canvas.getBoundingClientRect()
    const width = rect.width || 560
    const height = rect.height || 320
    const devicePixelRatio = window.devicePixelRatio || 1

    canvas.width = Math.round(width * devicePixelRatio)
    canvas.height = Math.round(height * devicePixelRatio)

    context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)

    const boardData: BoardDrawingData = {
      recipient: recipientName.trim() || canvasBoardFallbackText.recipient,
      packerMark: formatPackerMark(packerName),
      modeMark: formatBoardModeMark(shippingScope, fulfillmentMode),
      boxLabel: formatBoardBoxLabel(
        packageNumber.trim() || canvasBoardFallbackText.packageNumber,
        packageIndex,
      ),
      weightText: `${(weightInput.trim() || canvasBoardFallbackText.weight).replace(/\s+/g, '')}kg`,
      outerSizeText:
        formatCanvasOuterSizeParts(outerSizeInputs) || canvasBoardFallbackText.outerSize,
      productLines:
        completedRequestResults.length > 0
          ? completedRequestResults.map((result) =>
              result.item && result.line.unit && result.quantity > 0
                ? `${result.item.label} x ${
                    result.line.id === selectedPreviewResult?.line.id && selectedPreviewSplitStep
                      ? selectedPreviewSplitStep.assignedQuantity
                      : result.quantity
                  }${result.line.unit}`
                : canvasBoardFallbackText.product,
            )
          : [canvasBoardFallbackText.product],
    }

    drawShippingBoard(context, width, height, boardData)
  }, [
    completedRequestResults,
    fulfillmentMode,
    packageIndex,
    packageNumber,
    packerName,
    outerSizeInputs,
    recipientName,
    selectedPreviewResult,
    selectedPreviewSplitStep,
    shippingScope,
    weightInput,
  ])

  const canGoNext =
    activeStep === 'item'
      ? completedRequestResults.length > 0 && !hasIncompleteRequestLines
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
    setBoardStateByTarget({})
    setBoardEditorState(createEmptyBoardEditorState())
    lastLoadedBoardTargetKeyRef.current = null
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
                              {Array.from({ length: 10 }, (_, index) => {
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
                      <canvas ref={boardCanvasRef} className="label-canvas" />
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
                              result.effectiveQuantity,
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
