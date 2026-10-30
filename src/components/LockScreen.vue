<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps({
  ready: Boolean,
  loading: Boolean,
  configError: { type: String, default: '' },
  error: { type: String, default: '' },
  busy: Boolean,
  passwordRequired: Boolean,
})
const emit = defineEmits(['unlock', 'retry'])
const dialogElement = ref(null)
const clockElement = ref(null)
const passwordElement = ref(null)
const password = ref('')
const entryOpen = ref(false)
const now = ref(new Date())
let clockTimer

const timeLabel = computed(() => now.value.toLocaleTimeString('en-GB', {
  hour: '2-digit', minute: '2-digit', hour12: false,
}))
const dateLabel = computed(() => now.value.toLocaleDateString('en-US', {
  month: 'long', day: 'numeric', weekday: 'long',
}))
const monthLabel = computed(() => now.value.toLocaleDateString('en-US', {
  month: 'long', year: 'numeric',
}))
const calendarDays = computed(() => {
  const year = now.value.getFullYear()
  const month = now.value.getMonth()
  const offset = (new Date(year, month, 1).getDay() + 6) % 7
  const count = new Date(year, month + 1, 0).getDate()
  return [...Array(offset).fill(null), ...Array.from({ length: count }, (_, index) => index + 1)]
})

function focusEntry() {
  nextTick(() => {
    if (entryOpen.value && props.passwordRequired) passwordElement.value?.focus({ preventScroll: true })
    else dialogElement.value?.focus({ preventScroll: true })
  })
}

function handleClockClick() {
  if (!props.ready || props.busy) return
  if (!props.passwordRequired) {
    emit('unlock', '')
    return
  }
  entryOpen.value = true
  focusEntry()
}

function submitPassword() {
  if (!props.ready || props.busy || !password.value) return
  emit('unlock', password.value)
  password.value = ''
}

function handleKeydown(event) {
  if (event.key !== 'Escape' || event.isComposing) return
  event.preventDefault()
  entryOpen.value = false
  password.value = ''
  nextTick(() => clockElement.value?.focus({ preventScroll: true }))
}

onMounted(() => {
  // The browser's top layer also covers ArtPlayer's native fullscreen element.
  dialogElement.value.showModal()
  focusEntry()
  clockTimer = window.setInterval(() => { now.value = new Date() }, 1000)
})

onBeforeUnmount(() => {
  window.clearInterval(clockTimer)
  dialogElement.value?.close()
})
watch(() => props.busy, (busy) => { if (!busy) focusEntry() })
watch(() => props.passwordRequired, () => {
  entryOpen.value = false
  password.value = ''
})
</script>

<template>
  <Teleport to="body">
    <dialog ref="dialogElement" class="lock-screen" tabindex="-1" aria-label="Date and time" @cancel.prevent @keydown.stop="handleKeydown">
      <header class="desk-header">
        <span class="desk-brand-mark" aria-hidden="true"><i /><i /><i /><i /></span>
        <span>{{ monthLabel }}</span>
      </header>

      <main class="desk-main">
        <div class="desk-paper">
          <section class="desk-clock-card" aria-label="Current time">
            <span class="desk-eyebrow">{{ monthLabel }}</span>
            <button ref="clockElement" class="desk-clock" type="button" aria-label="Current time" :aria-expanded="passwordRequired ? entryOpen : undefined" :disabled="!ready || busy" @click="handleClockClick">
              <time>{{ timeLabel }}</time>
            </button>
            <div class="desk-date"><span aria-hidden="true" />{{ dateLabel }}</div>
            <div class="desk-entry-slot">
              <form v-if="ready && entryOpen && passwordRequired" class="desk-entry-form" :aria-busy="busy" @submit.prevent="submitPassword">
                <input ref="passwordElement" v-model="password" name="entry" type="password" autocomplete="off" aria-label="Entry" placeholder="····" :disabled="busy" required>
                <button type="submit" aria-label="Continue" :disabled="busy || !password">
                  <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h12M11 5l5 5-5 5" /></svg>
                </button>
              </form>
              <p v-if="ready && error" class="desk-entry-error" role="alert">{{ error }}</p>
              <template v-if="!ready">
                <p v-if="configError" class="desk-entry-error" role="alert">{{ configError }}</p>
                <p v-if="loading" class="desk-entry-status" role="status">Preparing…</p>
                <button v-else class="desk-retry" type="button" @click="emit('retry')">Try again</button>
              </template>
            </div>
          </section>

          <section class="desk-calendar-card" aria-label="Monthly calendar">
            <div class="desk-calendar-heading"><strong>{{ monthLabel }}</strong><span aria-hidden="true">·</span></div>
            <div class="desk-calendar-week"><span v-for="(day, index) in ['M', 'T', 'W', 'T', 'F', 'S', 'S']" :key="index">{{ day }}</span></div>
            <div class="desk-calendar-days">
              <span v-for="(day, index) in calendarDays" :key="index" :class="{ 'is-today': day === now.getDate() }" :aria-current="day === now.getDate() ? 'date' : undefined">{{ day }}</span>
            </div>
          </section>
        </div>
        <div class="desk-foot" aria-hidden="true"><span /><i /><span /></div>
      </main>
    </dialog>
  </Teleport>
</template>
