import type { OuterSizeParts, ShippingScope, FulfillmentMode, RequestResult, SplitPlanStep } from './types.ts'

export function formatBoardBoxLabel(boxNo: string, packageIndex: string) {
  const safeIndex = packageIndex.trim() || '1'

  return `${boxNo}#${safeIndex}`
}

export type BoardDrawingData = {
  recipient: string
  packerMark: string
  modeMark: string
  boxLabel: string
  weightText: string
  outerSizeText: string
  productLines: string[]
}

export function formatBoardWeight(value: string, notEntered: string) {
  const parsed = Number(value)
  return value.trim() && Number.isFinite(parsed) && parsed > 0 ? `${value.trim()}kg` : notEntered
}

export function getBoardProductLines(results: RequestResult[], selectedLineId: string | undefined, splitStep: SplitPlanStep | null) {
  return results.filter((result) => result.item && result.line.unit && result.quantity > 0)
    .map((result) => `${result.item!.label} x ${
      result.line.id === selectedLineId && splitStep ? splitStep.assignedQuantity : result.quantity
    }${result.line.unit}`)
}

export function getBoardLayout(width: number, productCount: number) {
  const baseHeight = width * 9 / 16
  const fontSize = Math.round(baseHeight * (productCount >= 4 ? 0.064 : productCount === 3 ? 0.076 : productCount === 2 ? 0.094 : 0.12))
  const lineHeight = fontSize * 1.16
  return {
    baseHeight,
    height: baseHeight + Math.max(0, productCount - 4) * lineHeight,
    productFontSize: fontSize,
    productLineHeight: lineHeight,
    productStartY: Math.max(baseHeight * 0.66,
      baseHeight * 0.69 - (lineHeight * (Math.min(4, productCount) - 1)) / 2),
  }
}

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

export function formatPackerMark(name: string) {
  const normalized = name.trim().replace(/\s+/g, '')

  if (!normalized) {
    return '包'
  }

  return Array.from(normalized).slice(0, 2).join('')
}

export function formatBoardModeMark(
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

export function parseOuterSizeParts(text: string): OuterSizeParts {
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

export function formatCanvasOuterSizeParts(parts: OuterSizeParts) {
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

function fitProductLine(context: CanvasRenderingContext2D, line: string, maxWidth: number) {
  const separator = line.lastIndexOf(' x ')
  if (separator < 0) return fitTextToWidth(context, line, maxWidth)
  const quantity = line.slice(separator)
  const name = fitTextToWidth(context, line.slice(0, separator),
    maxWidth - context.measureText(quantity).width)
  return `${name}${quantity}`
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

export function drawShippingBoard(
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

  const { baseHeight } = getBoardLayout(width, data.productLines.length)
  context.fillStyle = '#1f1915'
  context.strokeStyle = '#1f1915'
  context.lineCap = 'round'
  context.lineJoin = 'round'
  context.lineWidth = 3.2

  const fontFamily =
    '"Hiragino Sans", "Yu Gothic", "PingFang SC", "Avenir Next", sans-serif'

  context.font = `700 ${Math.round(baseHeight * 0.12)}px ${fontFamily}`
  context.textBaseline = 'middle'

  const topLineY = baseHeight * 0.28
  const secondLineY = baseHeight * 0.5
  const leftCircleX = width * 0.1
  const rightCircleX = width * 0.86
  const hasModeCircle = data.modeMark.trim().length > 0
  const rightCircleRadius =
    hasModeCircle
      ? data.modeMark === '国内'
        ? baseHeight * 0.104
        : Array.from(data.modeMark).length > 1
        ? baseHeight * 0.09
        : baseHeight * 0.074
      : 0
  const rightCircleTextRadius = data.modeMark === '国内' ? baseHeight * 0.09 : rightCircleRadius

  drawSketchCircle(context, leftCircleX, topLineY, baseHeight * 0.085)
  drawCircleText(context, data.packerMark, leftCircleX, topLineY, baseHeight * 0.085, fontFamily)

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
    data.recipient.length > 14 ? Math.round(baseHeight * 0.1) : Math.round(baseHeight * 0.12)
  const recipientX = width * 0.18
  const boxLabelRightX = hasModeCircle
    ? rightCircleX - rightCircleRadius - baseHeight * 0.028
    : width * 0.94
  const topRowGap = width * 0.028

  const boxLabelWidth = measureBoardBoxLabel(context, data.boxLabel, baseHeight, fontFamily)

  context.font = `700 ${recipientFontSize}px ${fontFamily}`
  const recipientText = fitTextToWidth(
    context,
    data.recipient,
    boxLabelRightX - boxLabelWidth - topRowGap - recipientX,
  )
  context.textAlign = 'left'
  context.fillText(recipientText, recipientX, topLineY + 2)

  drawBoardBoxLabel(context, data.boxLabel, boxLabelRightX, topLineY, baseHeight, fontFamily)

  context.textAlign = 'left'
  context.fillText(data.weightText, width * 0.16, secondLineY)
  context.fillText(data.outerSizeText, width * 0.48, secondLineY)

  const { productFontSize, productLineHeight, productStartY } = getBoardLayout(width, data.productLines.length)
  const productMaxWidth = width * 0.74

  context.font = `700 ${productFontSize}px ${fontFamily}`
  data.productLines.forEach((line, index) => {
    const fittedLine = fitProductLine(context, line, productMaxWidth)
    context.fillText(fittedLine, width * 0.16, productStartY + index * productLineHeight)
  })
}
