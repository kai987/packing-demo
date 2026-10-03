import { calculateRequestResults } from './packing.ts'
import type { RequestLine } from './types.ts'

self.onmessage = (event: MessageEvent<RequestLine[]>) => {
  self.postMessage(calculateRequestResults(event.data, true))
}
