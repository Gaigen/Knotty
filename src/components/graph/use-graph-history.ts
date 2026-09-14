'use client'

import { useCallback, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { createHistoryStacks, pushHistory, type HistoryEntry } from '@/lib/graph-history'

export function useGraphHistory() {
  const t = useTranslations('graph.history')
  const stacksRef = useRef(createHistoryStacks())
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const busyRef = useRef(false)

  const syncFlags = useCallback(() => {
    setCanUndo(stacksRef.current.undo.length > 0)
    setCanRedo(stacksRef.current.redo.length > 0)
  }, [])

  const push = useCallback(
    (entry: HistoryEntry) => {
      pushHistory(stacksRef.current, entry)
      syncFlags()
    },
    [syncFlags]
  )

  const clear = useCallback(() => {
    stacksRef.current = createHistoryStacks()
    syncFlags()
  }, [syncFlags])

  const undo = useCallback(async () => {
    if (busyRef.current) return
    const entry = stacksRef.current.undo.pop()
    if (!entry) return
    busyRef.current = true
    try {
      await entry.undo()
      stacksRef.current.redo.push(entry)
      syncFlags()
    } catch {
      stacksRef.current.undo.push(entry)
      throw new Error(t('undoFailed'))
    } finally {
      busyRef.current = false
    }
  }, [syncFlags, t])

  const redo = useCallback(async () => {
    if (busyRef.current) return
    const entry = stacksRef.current.redo.pop()
    if (!entry) return
    busyRef.current = true
    try {
      await entry.redo()
      stacksRef.current.undo.push(entry)
      syncFlags()
    } catch {
      stacksRef.current.redo.push(entry)
      throw new Error(t('redoFailed'))
    } finally {
      busyRef.current = false
    }
  }, [syncFlags, t])

  return { push, undo, redo, clear, canUndo, canRedo }
}
