import { useEffect, useEffectEvent, useState } from 'react'
import { saveDraft } from './draft.ts'
import type { Draft } from './types.ts'

export function useDraftPersistence(draft: Draft) {
  const [lastSave, setLastSave] = useState<{ draft: Draft; saved: boolean } | null>(null)
  const persist = useEffectEvent(() => {
    setLastSave({ draft, saved: saveDraft(draft) })
  })
  useEffect(() => {
    const timer = window.setTimeout(() => persist(), 250)
    return () => window.clearTimeout(timer)
  }, [draft])
  useEffect(() => {
    const flush = () => persist()
    const handleVisibility = () => { if (document.visibilityState === 'hidden') persist() }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])
  return lastSave?.draft !== draft ? 'saving' : lastSave.saved ? 'saved' : 'unavailable'
}
