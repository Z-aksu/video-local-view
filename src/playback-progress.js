const SAVE_INTERVAL_MS = 5000

export function normalizePlaybackTime(value) {
  return Number.isFinite(value) && value >= 0 ? value : 0
}

export function trackPlaybackProgress(video, {
  initialTime = 0,
  onProgress,
  page = window,
  now = () => performance.now(),
}) {
  const resumeTime = normalizePlaybackTime(initialTime)
  let awaitingMetadata = true
  let restoring = false
  let disposed = false
  let lastSavedTime = resumeTime
  let lastSavedAt = now()

  function save(force = false) {
    // Keep the saved position until metadata and the initial seek are ready.
    if (disposed || awaitingMetadata || restoring || video.readyState < 1 || video.error) return
    if (!Number.isFinite(video.currentTime) || video.currentTime < 0) return

    const currentTime = video.ended ? 0 : video.currentTime
    const timestamp = now()
    if (currentTime === lastSavedTime || (!force && timestamp - lastSavedAt < SAVE_INTERVAL_MS)) return

    lastSavedTime = currentTime
    lastSavedAt = timestamp
    onProgress(currentTime)
  }

  function restore() {
    if (!awaitingMetadata || video.readyState < 1 || !Number.isFinite(video.duration) || video.duration <= 0) return
    awaitingMetadata = false

    if (resumeTime > 0 && resumeTime < video.duration) {
      restoring = true
      try {
        video.currentTime = resumeTime
      } catch {
        // An unsupported seek must not prevent normal playback or future saves.
        restoring = false
      }
      if (!video.seeking) restoring = false
    }

    save(true)
  }

  function onTimeUpdate() {
    save()
  }

  function onSeeked() {
    restoring = false
    save(true)
  }

  function flush() {
    save(true)
  }

  function onVisibilityChange() {
    if (page.document.visibilityState === 'hidden') flush()
  }

  const listeners = [
    ['loadedmetadata', restore],
    ['durationchange', restore],
    ['timeupdate', onTimeUpdate],
    ['seeked', onSeeked],
    ['pause', flush],
    ['ended', flush],
  ]
  for (const [event, listener] of listeners) video.addEventListener(event, listener)
  page.addEventListener('pagehide', flush)
  page.document.addEventListener('visibilitychange', onVisibilityChange)
  restore()

  return {
    destroy() {
      // Flush before ArtPlayer destroys the media element and resets its time.
      flush()
      disposed = true
      for (const [event, listener] of listeners) video.removeEventListener(event, listener)
      page.removeEventListener('pagehide', flush)
      page.document.removeEventListener('visibilitychange', onVisibilityChange)
    },
  }
}
