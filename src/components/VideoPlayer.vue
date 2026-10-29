<script setup>
import Artplayer from 'artplayer'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'

import PrivacyScreen from './PrivacyScreen.vue'
import { trackPlaybackProgress } from '../playback-progress.js'

const props = defineProps({
  video: { type: Object, required: true },
  covered: { type: Boolean, default: false },
  locked: { type: Boolean, default: false },
  initialTime: { type: Number, default: 0 },
  theme: { type: String, default: 'forest' },
})

const emit = defineEmits(['update:covered', 'progress'])
const playerElement = ref(null)
const playerRoot = shallowRef(null)
const errorMessage = ref('')
const source = computed(() => `/api/video?path=${encodeURIComponent(props.video.path)}`)
const screenLocked = ref(props.locked)
const obscured = computed(() => props.covered || screenLocked.value)

let player
let playbackProgress
let focusBeforeCover = null
let wasPlayingBeforeCover = false

function createScreenshotFilename(date = new Date()) {
  const timestamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
    '-',
    String(date.getHours()).padStart(2, '0'),
    String(date.getMinutes()).padStart(2, '0'),
    String(date.getSeconds()).padStart(2, '0'),
    '-',
    String(date.getMilliseconds()).padStart(3, '0'),
  ].join('')

  return `screenshot-${timestamp}.png`
}

async function captureFrame() {
  if (obscured.value) throw new Error('Uncover the video before taking a screenshot.')
  const video = player?.video
  if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) {
    throw new Error('The video frame is not ready yet. Play the video and try again.')
  }

  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Unable to create the screenshot canvas.')
  context.drawImage(video, 0, 0, canvas.width, canvas.height)

  const imageBlob = new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Unable to create the screenshot.'))
    }, 'image/png')
  })

  try {
    if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
      throw new Error('Image clipboard is not supported by this browser.')
    }
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': imageBlob })])
    return 'copied'
  } catch {
    const blob = await imageBlob
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = createScreenshotFilename()
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    return 'downloaded'
  }
}

function setScreenLocked(locked) {
  screenLocked.value = locked
}

defineExpose({ captureFrame, setScreenLocked })
watch(() => props.locked, setScreenLocked, { flush: 'sync' })

function updatePrivacyScreen() {
  if (!player) return

  playerRoot.value.classList.toggle('is-covered', obscured.value)

  if (obscured.value) {
    focusBeforeCover = document.activeElement
    wasPlayingBeforeCover = !player.video.paused && !player.video.ended
    if (wasPlayingBeforeCover) player.pause()
    nextTick(() => {
      if (props.covered && !screenLocked.value) playerRoot.value?.querySelector('.privacy-screen')?.focus({ preventScroll: true })
    })
  } else {
    const shouldResumePlayback = wasPlayingBeforeCover
    wasPlayingBeforeCover = false
    nextTick(() => {
      if (!obscured.value && focusBeforeCover?.isConnected) focusBeforeCover.focus({ preventScroll: true })
    })
    if (shouldResumePlayback) {
      player.play().catch(() => {
        errorMessage.value = 'Playback could not resume automatically. Press play to continue.'
      })
    }
  }
}

watch(obscured, updatePrivacyScreen, { flush: 'sync' })

function createPlayer() {
  // Keep controls visible briefly after pointer activity, then let ArtPlayer hide them.
  Artplayer.CONTROL_HIDE_TIME = 800

  player = new Artplayer({
    container: playerElement.value,
    url: source.value,
    autoplay: false,
    autoPlayback: false,
    volume: 0.8,
    theme: 'var(--player-accent)',
    lang: 'en',
    i18n: {
      en: {
        'Video Info': 'Video Info',
        Close: 'Close',
        'Video Load Failed': 'Video Load Failed',
        Volume: 'Volume',
        Play: 'Play',
        Pause: 'Pause',
        Rate: 'Playback Speed',
        Mute: 'Mute',
        'Play Speed': 'Playback Speed',
        'Aspect Ratio': 'Aspect Ratio',
        Default: 'Default',
        Normal: 'Normal',
        Fullscreen: 'Fullscreen',
        'Exit Fullscreen': 'Exit Fullscreen',
        'Web Fullscreen': 'Web Fullscreen',
        'Exit Web Fullscreen': 'Exit Web Fullscreen',
      },
    },
    playbackRate: true,
    setting: true,
    aspectRatio: true,
    fullscreen: true,
    fullscreenWeb: true,
    hotkey: true,
    mutex: true,
    playsInline: true,
    moreVideoAttr: {
      preload: 'metadata',
      controls: false,
      playsinline: true,
    },
    cssVar: {
      '--art-theme': 'var(--player-accent)',
      '--art-background-color': 'var(--player-bg)',
      '--art-control-height': '44px',
      '--art-bottom-offset': '0px',
      '--art-progress-height': '8px',
      '--art-progress-color': 'var(--player-progress)',
    },
  })

  player.on('video:error', () => {
    errorMessage.value = 'Unable to play this file. Check that it is intact or try a browser-compatible MP4 or WebM video.'
  })
  // Media keys and delayed play promises must not restart audio behind the cover.
  player.on('video:play', () => {
    if (obscured.value) player.pause()
  })

  // Only our tab-scoped session state is persisted, not ArtPlayer settings.
  player.storage.get = () => undefined
  player.storage.set = () => undefined
  player.storage.del = () => undefined
  player.storage.clear = () => undefined
  player.volume = 0.8
  const videoPath = props.video.path
  playbackProgress = trackPlaybackProgress(player.video, {
    initialTime: props.initialTime,
    onProgress: (currentTime) => emit('progress', { path: videoPath, currentTime }),
  })
  playerRoot.value = player.template.$player
  if (obscured.value) updatePrivacyScreen()
}

onMounted(createPlayer)

onBeforeUnmount(() => {
  playbackProgress?.destroy()
  player?.destroy()
  player = null
})
</script>

<template>
  <section class="player-shell" aria-label="Video player">
    <div class="player-stage" :class="{ 'is-covered': obscured }">
      <div ref="playerElement" class="art-player-mount"></div>
      <div v-if="errorMessage && !obscured" class="player-error" role="status">{{ errorMessage }}</div>
      <Teleport v-if="playerRoot" :to="playerRoot">
        <button
          v-show="!obscured"
          class="privacy-fullscreen-toggle privacy-toggle"
          type="button"
          aria-label="Cover video"
          title="Cover video"
          @click.stop="emit('update:covered', true)"
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M2.5 10s2.7-4.5 7.5-4.5 7.5 4.5 7.5 4.5-2.7 4.5-7.5 4.5S2.5 10 2.5 10Z" />
            <circle cx="10" cy="10" r="1.8" />
            <path d="m3.2 3.2 13.6 13.6" />
          </svg>
        </button>
        <PrivacyScreen v-show="covered && !screenLocked" :theme="theme" @restore="emit('update:covered', false)" />
      </Teleport>
    </div>
    <div class="player-caption" lang="en">
      <span class="caption-mark" aria-hidden="true"></span>
      Hover to show controls · Hide after 0.8s
    </div>
  </section>
</template>
