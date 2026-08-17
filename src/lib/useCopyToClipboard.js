/* useCopyToClipboard.js — copy a string and flash a confirmation.
   Used by the export sheet and the challenge invite code, which had the same
   try/catch and the same 1.8s reset written out twice. */
import { useCallback, useRef, useState } from 'react'

export function useCopyToClipboard(resetAfter = 1800) {
  const [copied, setCopied] = useState(null)
  const timer = useRef(null)

  const copy = useCallback(
    async (text, tag = true) => {
      try {
        await navigator.clipboard.writeText(text)
        setCopied(tag)
        clearTimeout(timer.current)
        timer.current = setTimeout(() => setCopied(null), resetAfter)
        return true
      } catch {
        // Clipboard needs a secure context; the text is on screen to read off anyway.
        return false
      }
    },
    [resetAfter],
  )

  return [copied, copy]
}
