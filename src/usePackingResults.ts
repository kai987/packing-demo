import { useEffect, useMemo, useState } from 'react'
import { calculateRequestResults } from './packing.ts'
import type { RequestLine, RequestResult } from './types.ts'

export function usePackingResults(requestLines: RequestLine[]) {
  const baseResults = useMemo(() => calculateRequestResults(requestLines), [requestLines])
  const key = JSON.stringify(requestLines)
  const needsCalculation = baseResults.some((result) => result.isComplete &&
    result.exactMatches.length === 0 && result.relevantCandidates.some((candidate) => candidate.kind !== 'note'))
  const [calculated, setCalculated] = useState<{ key: string; results: RequestResult[] } | null>(null)
  const [failedKey, setFailedKey] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  const current = calculated?.key === key ? calculated.results : null
  const needsWorker = needsCalculation && !current

  useEffect(() => {
    if (!needsWorker) return
    let worker: Worker | null = null
    let disposed = false
    const timer = window.setTimeout(() => {
      try {
        worker = new Worker(new URL('./packing.worker.ts', import.meta.url), { type: 'module' })
        worker.onmessage = (event: MessageEvent<RequestResult[]>) => {
          if (disposed) return
          setCalculated({ key, results: event.data })
          setFailedKey(null)
          worker?.terminate()
        }
        worker.onerror = () => {
          if (!disposed) setFailedKey(key)
          worker?.terminate()
        }
        worker.postMessage(requestLines)
      } catch {
        if (!disposed) setFailedKey(key)
        worker?.terminate()
      }
    }, 120)
    return () => {
      disposed = true
      window.clearTimeout(timer)
      worker?.terminate()
    }
  }, [key, needsWorker, requestLines, retry])

  const calculationFailed = needsCalculation && !current && failedKey === key
  return {
    requestResults: needsCalculation && current ? current : baseResults,
    isCalculating: needsCalculation && !current && !calculationFailed,
    calculationFailed,
    retryCalculation: () => { setFailedKey(null); setRetry((value) => value + 1) },
  }
}
