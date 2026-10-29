export function createBlurLock({ windowObject, documentObject, onChange }) {
  let enabled = null
  let workspaceId = ''
  let locked = false
  let pendingBlur = false
  let lossGeneration = 0
  let disposed = false

  function storageKey() {
    return `video-local-view.blur-locked:${workspaceId}`
  }

  function readStoredLock() {
    try {
      return windowObject.sessionStorage.getItem(storageKey()) === 'true'
    } catch {
      return false
    }
  }

  function persistLock() {
    if (!workspaceId) return
    try {
      if (locked) windowObject.sessionStorage.setItem(storageKey(), 'true')
      else windowObject.sessionStorage.removeItem(storageKey())
    } catch {
      // Keep protecting the current page when browser storage is unavailable.
    }
  }

  function setLocked(value) {
    const changed = locked !== value
    locked = value
    persistLock()
    if (changed) onChange(locked)
  }

  function loseFocus() {
    if (disposed || enabled === false) return
    lossGeneration += 1
    if (enabled === null) pendingBlur = true
    else setLocked(true)
  }

  function checkFocus() {
    if (documentObject.visibilityState === 'hidden' || !documentObject.hasFocus()) loseFocus()
  }

  function handleVisibilityChange() {
    if (documentObject.visibilityState === 'hidden') loseFocus()
  }

  windowObject.addEventListener('blur', loseFocus)
  windowObject.addEventListener('pagehide', loseFocus)
  windowObject.addEventListener('pageshow', checkFocus)
  documentObject.addEventListener('visibilitychange', handleVisibilityChange)

  return {
    get locked() { return locked },
    configure(config) {
      if (disposed) return
      const initializing = enabled === null || workspaceId !== config.workspaceId
      enabled = config.enabled === true
      workspaceId = config.workspaceId
      if (!enabled) setLocked(false)
      else {
        if (initializing) setLocked(pendingBlur || readStoredLock())
        checkFocus()
      }
      pendingBlur = false
    },
    async unlock(verifyPassword) {
      if (disposed) return false
      const generation = lossGeneration
      const verified = await verifyPassword()
      if (disposed || !verified || generation !== lossGeneration
        || documentObject.visibilityState === 'hidden' || !documentObject.hasFocus()) return false
      setLocked(false)
      return true
    },
    dispose() {
      disposed = true
      windowObject.removeEventListener('blur', loseFocus)
      windowObject.removeEventListener('pagehide', loseFocus)
      windowObject.removeEventListener('pageshow', checkFocus)
      documentObject.removeEventListener('visibilitychange', handleVisibilityChange)
    },
  }
}
