<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import VideoPlayer from './components/VideoPlayer.vue'
import VideoTreeNode from './components/VideoTreeNode.vue'
import ThemeSwitcher from './components/ThemeSwitcher.vue'
import LockScreen from './components/LockScreen.vue'
import { createBlurLock } from './blur-lock.js'
import { normalizePlaybackTime } from './playback-progress.js'
import { applyTheme, readTheme, saveTheme } from './theme.js'

const activeTheme = ref(readTheme())
watch(activeTheme, (theme) => {
  applyTheme(theme)
  saveTheme(theme)
}, { flush: 'sync' })

const tree = ref([])
const videoCount = ref(0)
const selectedVideo = ref(null)
const privacyCovered = ref(false)
const playerRef = ref(null)
const configReady = ref(false)
const configLoading = ref(false)
const configError = ref('')
const screenLocked = ref(false)
const passwordRequired = ref(false)
const unlockPending = ref(false)
const unlockError = ref('')
const screenBlocked = computed(() => !configReady.value || screenLocked.value)
let blurLock = null

watch(screenBlocked, (blocked) => {
  // Hide the page and stop audio synchronously, before Vue renders the dialog.
  document.documentElement.classList.toggle('screen-blocked', blocked)
  playerRef.value?.setScreenLocked(blocked)
  if (blocked) {
    mobileMenuOpen.value = false
    desktopMenuOpen.value = false
    unlockError.value = ''
  }
}, { flush: 'sync' })
const snapshotMessage = ref('')
const loading = ref(true)
const refreshing = ref(false)
const errorMessage = ref('')
const mobileMenuOpen = ref(false)
const desktopMenuOpen = ref(false)
const isMobileViewport = ref(window.matchMedia('(max-width: 760px)').matches)
const sidebarElement = ref(null)
const mobileViewportQuery = window.matchMedia('(max-width: 760px)')
const SIDEBAR_COLLAPSED_STORAGE_KEY = 'video-local-view.sidebar-collapsed'
const SELECTED_VIDEO_STORAGE_KEY = 'video-local-view.selected-video'
let videoSessionId = null
let playbackTime = 0
let snapshotMessageTimer

async function captureSnapshot() {
  if (privacyCovered.value || screenBlocked.value) return
  snapshotMessage.value = ''
  try {
    const result = await playerRef.value?.captureFrame()
    snapshotMessage.value = result === 'copied' ? 'Screenshot copied' : 'Screenshot downloaded; clipboard unavailable'
  } catch (error) {
    snapshotMessage.value = error.message || 'Screenshot failed'
  }
  window.clearTimeout(snapshotMessageTimer)
  snapshotMessageTimer = window.setTimeout(() => { snapshotMessage.value = '' }, 2600)
}

function readSidebarCollapsed() {
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

const sidebarCollapsed = ref(readSidebarCollapsed())

function toggleSidebar() {
  sidebarCollapsed.value = !sidebarCollapsed.value
  desktopMenuOpen.value = false
  try {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(sidebarCollapsed.value))
  } catch {
    // The sidebar still works for this session when browser storage is unavailable.
  }
}

function handleSidebarToggle() {
  if (isMobileViewport.value) {
    mobileMenuOpen.value = !mobileMenuOpen.value
    return
  }

  if (sidebarCollapsed.value) desktopMenuOpen.value = !desktopMenuOpen.value
}

function closeMobileMenuOnOutsidePointer(event) {
  if ((mobileMenuOpen.value || desktopMenuOpen.value) && !sidebarElement.value?.contains(event.target)) {
    mobileMenuOpen.value = false
    desktopMenuOpen.value = false
  }
}

function closeMobileMenuOnEscape(event) {
  if (event.key === 'Escape') {
    mobileMenuOpen.value = false
    desktopMenuOpen.value = false
  }
}

function updateMobileViewport(event) {
  isMobileViewport.value = event.matches
  mobileMenuOpen.value = false
  desktopMenuOpen.value = false
}

function containsPath(nodes, requestedPath) {
  return nodes.some((node) => node.type === 'file'
    ? node.path === requestedPath
    : containsPath(node.children, requestedPath))
}

function findVideoByPath(nodes, requestedPath) {
  for (const node of nodes) {
    if (node.type === 'file' && node.path === requestedPath) return node
    if (node.type === 'directory') {
      const match = findVideoByPath(node.children, requestedPath)
      if (match) return match
    }
  }
  return null
}

function readSavedVideoSelection() {
  try {
    const value = window.sessionStorage.getItem(SELECTED_VIDEO_STORAGE_KEY)
    if (!value) return null
    const selection = JSON.parse(value)
    return typeof selection.path === 'string' && typeof selection.sessionId === 'string'
      ? selection
      : null
  } catch {
    return null
  }
}

function clearSavedVideoSelection() {
  try {
    window.sessionStorage.removeItem(SELECTED_VIDEO_STORAGE_KEY)
  } catch {
    // Video selection still works in memory when browser storage is unavailable.
  }
}

function saveVideoSessionState() {
  if (!selectedVideo.value || typeof videoSessionId !== 'string') {
    clearSavedVideoSelection()
    return
  }

  try {
    window.sessionStorage.setItem(SELECTED_VIDEO_STORAGE_KEY, JSON.stringify({
      path: selectedVideo.value.path,
      sessionId: videoSessionId,
      covered: privacyCovered.value,
      currentTime: playbackTime,
    }))
  } catch {
    // Video selection and privacy cover still work in memory when storage is unavailable.
  }
}

watch([selectedVideo, privacyCovered], saveVideoSessionState)

function savePlaybackProgress({ path, currentTime }) {
  // A previous player's teardown must not overwrite the newly selected video.
  if (selectedVideo.value?.path !== path) return
  playbackTime = normalizePlaybackTime(currentTime)
  saveVideoSessionState()
}

async function loadTree({ isRefresh = false } = {}) {
  if (isRefresh) refreshing.value = true
  else loading.value = true
  errorMessage.value = ''

  try {
    const response = await fetch('/api/tree', { cache: 'no-store' })
    if (!response.ok) throw new Error(`Unable to read the video library (${response.status})`)
    const result = await response.json()
    tree.value = result.tree
    videoCount.value = result.count

    const serverRestarted = videoSessionId !== null && videoSessionId !== result.sessionId
    if (serverRestarted) {
      playbackTime = 0
      selectedVideo.value = null
      privacyCovered.value = false
      clearSavedVideoSelection()
    } else if (selectedVideo.value && !containsPath(tree.value, selectedVideo.value.path)) {
      playbackTime = 0
      selectedVideo.value = null
      privacyCovered.value = false
      clearSavedVideoSelection()
    } else if (!selectedVideo.value) {
      const savedSelection = readSavedVideoSelection()
      const savedVideo = savedSelection?.sessionId === result.sessionId
        ? findVideoByPath(tree.value, savedSelection.path)
        : null
      if (savedVideo) {
        playbackTime = normalizePlaybackTime(savedSelection.currentTime)
        selectedVideo.value = { name: savedVideo.name, path: savedVideo.path, initialTime: playbackTime }
        privacyCovered.value = savedSelection.covered === true
      } else {
        privacyCovered.value = false
        clearSavedVideoSelection()
      }
    }
    videoSessionId = result.sessionId
  } catch (error) {
    errorMessage.value = error.message || 'Unable to connect to the local video server.'
  } finally {
    loading.value = false
    refreshing.value = false
  }
}

function selectVideo(video) {
  if (screenBlocked.value) return
  if (selectedVideo.value?.path !== video.path) {
    playbackTime = 0
    selectedVideo.value = { name: video.name, path: video.path }
  }
  privacyCovered.value = false
  mobileMenuOpen.value = false
  desktopMenuOpen.value = false
}

async function loadLockConfig() {
  if (configLoading.value) return
  configLoading.value = true
  configError.value = ''
  try {
    const response = await fetch('/api/config', { cache: 'no-store' })
    if (!response.ok) throw new Error('Unable to load local configuration. Try again.')
    const config = await response.json()
    if (typeof config.blurLockScreen !== 'boolean' || typeof config.hasLockPassword !== 'boolean'
      || typeof config.workspaceId !== 'string' || !config.workspaceId) {
      throw new Error('Invalid local configuration. Restart the server and try again.')
    }
    if (!blurLock) return
    passwordRequired.value = config.hasLockPassword
    blurLock.configure({ enabled: config.blurLockScreen, workspaceId: config.workspaceId })
    configReady.value = true
    await loadTree()
  } catch (error) {
    configError.value = error.message || 'Unable to load local configuration. Try again.'
  } finally {
    configLoading.value = false
  }
}

async function unlockScreen(password) {
  if (unlockPending.value || !configReady.value || !blurLock) return
  const controller = blurLock
  unlockPending.value = true
  unlockError.value = ''
  try {
    const unlocked = await controller.unlock(async () => {
      const response = await fetch('/api/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
        cache: 'no-store',
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to continue. Try again.')
      return result.unlocked === true
    })
    if (!unlocked) unlockError.value = 'Click the time to try again.'
  } catch (error) {
    unlockError.value = error.message || 'Unable to connect. Try again.'
  } finally {
    unlockPending.value = false
  }
}

onMounted(() => {
  document.documentElement.classList.add('screen-blocked')
  blurLock = createBlurLock({
    windowObject: window,
    documentObject: document,
    onChange: (locked) => { screenLocked.value = locked },
  })
  mobileViewportQuery.addEventListener('change', updateMobileViewport)
  document.addEventListener('pointerdown', closeMobileMenuOnOutsidePointer)
  document.addEventListener('keydown', closeMobileMenuOnEscape)
  loadLockConfig()
})

onBeforeUnmount(() => {
  blurLock?.dispose()
  blurLock = null
  document.documentElement.classList.remove('screen-blocked')
  window.clearTimeout(snapshotMessageTimer)
  mobileViewportQuery.removeEventListener('change', updateMobileViewport)
  document.removeEventListener('pointerdown', closeMobileMenuOnOutsidePointer)
  document.removeEventListener('keydown', closeMobileMenuOnEscape)
})
</script>

<template>
  <div class="app-frame" :inert="screenBlocked || undefined" :aria-hidden="screenBlocked || undefined" :class="{ 'sidebar-collapsed': sidebarCollapsed, 'mobile-menu-open': mobileMenuOpen, 'desktop-menu-open': desktopMenuOpen }">
    <aside ref="sidebarElement" class="sidebar" aria-label="Video library sidebar">
      <header class="brand-row">
        <div class="brand-symbol" aria-hidden="true">
          <svg viewBox="0 0 30 30">
            <rect x="3" y="5" width="24" height="20" rx="5" />
            <path d="m12 10 8 5-8 5V10Z" />
          </svg>
        </div>
        <div class="brand-copy">
          <span class="brand-name">FRAME / LOCAL</span>
          <span class="brand-subtitle">VIDEO LIBRARY</span>
        </div>
        <span class="live-indicator" title="Local server running"></span>
        <button
          v-if="isMobileViewport || sidebarCollapsed"
          class="sidebar-toggle"
          type="button"
          :aria-label="isMobileViewport ? mobileMenuOpen ? 'Close video menu' : 'Open video menu' : desktopMenuOpen ? 'Close video library' : 'Open video library'"
          :title="isMobileViewport ? mobileMenuOpen ? 'Close video menu' : 'Open video menu' : desktopMenuOpen ? 'Close video library' : 'Open video library'"
          :aria-expanded="isMobileViewport ? mobileMenuOpen : desktopMenuOpen"
          aria-controls="video-library-menu"
          @click="handleSidebarToggle"
        >
          <svg class="desktop-toggle-icon" viewBox="0 0 20 20" aria-hidden="true">
            <rect x="3.25" y="3.5" width="13.5" height="13" rx="3" />
            <path d="M7.5 4v12M10 7.5l2.5 2.5-2.5 2.5" />
          </svg>
          <svg class="mobile-toggle-icon" viewBox="0 0 20 20" aria-hidden="true">
            <path v-if="mobileMenuOpen" d="m5 5 10 10M15 5 5 15" />
            <path v-else d="M3 5h14M3 10h14M3 15h14" />
          </svg>
        </button>
      </header>

      <div id="video-library-menu" class="sidebar-menu" role="region" aria-label="Video menu" :inert="isMobileViewport ? !mobileMenuOpen : sidebarCollapsed && !desktopMenuOpen">
        <div class="list-heading">
          <span class="count-badge" :aria-label="`${videoCount} videos`" :title="`${videoCount} videos`">
            {{ videoCount }}
          </span>
          <button
            class="refresh-button"
            type="button"
            :disabled="loading || refreshing"
            aria-label="Rescan videos"
            title="Rescan"
            @click="loadTree({ isRefresh: true })"
          >
            <svg :class="{ 'is-spinning': refreshing }" viewBox="0 0 20 20" aria-hidden="true">
              <path d="M16 8a6.1 6.1 0 0 0-10.8-2L3.5 8M4 4v4h4M4 12a6.1 6.1 0 0 0 10.8 2l1.7-2M16 16v-4h-4" />
            </svg>
          </button>
        </div>

        <div class="tree-scroll">
          <div v-if="loading" class="sidebar-state">
            <span class="state-spinner"></span>
            Loading video library…
          </div>
          <div v-else-if="errorMessage" class="sidebar-state state-error" role="alert">
            {{ errorMessage }}
          </div>
          <div v-else-if="tree.length === 0" class="sidebar-state empty-tree">
            <span class="empty-folder" aria-hidden="true">—</span>
            <strong>No videos found</strong>
            <span>Supports MP4, MOV, MKV, WebM, and other common formats</span>
          </div>
          <nav v-else class="tree-list" aria-label="Video files">
            <VideoTreeNode
              v-for="node in tree"
              :key="node.path"
              :node="node"
              :selected-path="selectedVideo?.path || ''"
              @select="selectVideo"
            />
          </nav>
        </div>
      </div>

      <button
        class="sidebar-bottom-toggle"
        type="button"
        :aria-label="sidebarCollapsed ? 'Expand video library' : 'Collapse video library'"
        :title="sidebarCollapsed ? 'Expand video library' : 'Collapse video library'"
        :aria-expanded="!sidebarCollapsed"
        aria-controls="video-library-menu"
        @click="toggleSidebar"
      >
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <rect x="3" y="3.5" width="14" height="13" rx="3" />
          <path v-if="sidebarCollapsed" d="M8 4v12m2-8 2 2-2 2" />
          <path v-else d="M12 4v12M10 8l-2 2 2 2" />
        </svg>
      </button>
    </aside>

    <main class="main-panel">
      <header class="topbar">
        <div class="breadcrumb">
          <span>LIBRARY</span>
          <span class="breadcrumb-divider">/</span>
          <span class="breadcrumb-current">{{ selectedVideo ? 'NOW PLAYING' : 'READY' }}</span>
        </div>
        <div class="topbar-actions">
          <button
            v-if="selectedVideo"
            class="snapshot-toggle"
            type="button"
            :disabled="privacyCovered"
            :aria-label="privacyCovered ? 'Uncover the video before taking a screenshot' : 'Capture the current frame and copy it to the clipboard'"
            :title="privacyCovered ? 'Uncover the video to take a screenshot' : 'Screenshot and copy to clipboard'"
            @click="captureSnapshot"
          >
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="M3 6.5h3l1.2-2h5.6l1.2 2h3v9H3z" />
              <circle cx="10" cy="11" r="3" />
            </svg>
          </button>
          <span v-if="snapshotMessage" class="snapshot-message" role="status">{{ snapshotMessage }}</span>
          <button
            v-if="selectedVideo"
            class="privacy-toggle"
            :class="{ 'is-active': privacyCovered }"
            type="button"
            :aria-pressed="privacyCovered"
            :aria-label="privacyCovered ? 'Show video' : 'Cover video'"
            :title="privacyCovered ? 'Show video' : 'Cover video'"
            @click="privacyCovered = !privacyCovered"
          >
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="M2.5 10s2.7-4.5 7.5-4.5 7.5 4.5 7.5 4.5-2.7 4.5-7.5 4.5S2.5 10 2.5 10Z" />
              <circle cx="10" cy="10" r="1.8" />
              <path v-if="!privacyCovered" d="m3.2 3.2 13.6 13.6" />
            </svg>
          </button>
          <div class="topbar-note"><span></span> LOCAL SESSION</div>
          <ThemeSwitcher v-model="activeTheme" />
        </div>
      </header>

      <section v-if="selectedVideo" class="watch-view">
        <VideoPlayer
          ref="playerRef"
          :key="selectedVideo.path"
          v-model:covered="privacyCovered"
          :video="selectedVideo"
          :initial-time="selectedVideo.initialTime"
          :theme="activeTheme"
          :locked="screenBlocked"
          @progress="savePlaybackProgress"
        />
      </section>

      <section v-else class="welcome-view">
        <div class="welcome-orbit orbit-one"></div>
        <div class="welcome-orbit orbit-two"></div>
        <div class="welcome-content">
          <div class="welcome-icon" aria-hidden="true">
            <svg viewBox="0 0 64 64">
              <rect x="8" y="12" width="48" height="40" rx="8" />
              <path d="m27 23 16 9-16 9V23Z" />
            </svg>
          </div>
          <span class="eyebrow">YOUR PERSONAL VIEWING ROOM</span>
          <h2>Ready when you are.</h2>
          <p>Select a video from the library.<br />It will appear here when you are ready to play.</p>
          <div class="welcome-meta">
            <span><b>01</b> Select a video</span>
            <span class="meta-line"></span>
            <span><b>02</b> Press play</span>
          </div>
        </div>
        <div class="welcome-index">LOCAL / 001</div>
      </section>
    </main>
  </div>
  <LockScreen
    v-if="screenBlocked"
    :theme="activeTheme"
    :ready="configReady"
    :loading="configLoading"
    :config-error="configError"
    :error="unlockError"
    :busy="unlockPending"
    :password-required="passwordRequired"
    @unlock="unlockScreen"
    @retry="loadLockConfig"
  />
</template>
