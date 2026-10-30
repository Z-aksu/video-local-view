<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

import { getTheme, themes, THEME_STORAGE_KEY } from '../theme.js'
import { useI18n } from '../i18n.js'

const { t } = useI18n()

defineProps({ modelValue: { type: String, required: true } })
const emit = defineEmits(['update:modelValue'])
const trigger = ref(null)
const popover = ref(null)
const isOpen = ref(false)
const popoverPosition = ref({ top: 0, right: 16 })

function updatePopoverPosition() {
  if (!isOpen.value || !trigger.value || !popover.value) return

  const bounds = trigger.value.getBoundingClientRect()
  const menuHeight = popover.value.getBoundingClientRect().height
  const gap = 8
  const fitsBelow = bounds.bottom + gap + menuHeight <= window.innerHeight - gap

  popoverPosition.value = {
    top: fitsBelow ? bounds.bottom + gap : Math.max(gap, bounds.top - menuHeight - gap),
    right: Math.max(gap, window.innerWidth - bounds.right),
  }
}

async function toggleMenu() {
  isOpen.value = !isOpen.value
  if (isOpen.value) {
    await nextTick()
    updatePopoverPosition()
  }
}

function closeMenu(restoreFocus = false) {
  if (!isOpen.value) return
  isOpen.value = false
  if (restoreFocus) trigger.value?.focus({ preventScroll: true })
}

function selectTheme(id) {
  emit('update:modelValue', id)
  closeMenu(true)
}

function handleOutsidePointer(event) {
  if (!trigger.value?.contains(event.target) && !popover.value?.contains(event.target)) closeMenu()
}

function handleKeydown(event) {
  if (event.key === 'Escape' && isOpen.value) {
    event.preventDefault()
    closeMenu(true)
  }
}

function syncTheme(event) {
  if (event.key === THEME_STORAGE_KEY || event.key === null) {
    emit('update:modelValue', getTheme(event.newValue).id)
  }
}

onMounted(() => {
  document.addEventListener('pointerdown', handleOutsidePointer)
  document.addEventListener('keydown', handleKeydown)
  document.addEventListener('scroll', updatePopoverPosition, true)
  window.addEventListener('resize', updatePopoverPosition)
  window.addEventListener('storage', syncTheme)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleOutsidePointer)
  document.removeEventListener('keydown', handleKeydown)
  document.removeEventListener('scroll', updatePopoverPosition, true)
  window.removeEventListener('resize', updatePopoverPosition)
  window.removeEventListener('storage', syncTheme)
})
</script>

<template>
  <div class="theme-switcher">
    <button
      ref="trigger"
      class="theme-trigger"
      :class="{ 'is-open': isOpen }"
      type="button"
      aria-controls="theme-options"
      :aria-expanded="isOpen"
      :aria-label="t('Change theme, current: {theme}', { theme: t(getTheme(modelValue).label) })"
      :title="t('Change theme')"
      @click="toggleMenu"
    >
      <svg class="theme-trigger-icon" viewBox="0 0 20 20" aria-hidden="true">
        <path d="M10 2.5a7.5 7.5 0 1 0 0 15c1.4 0 2.1-.8 1.7-1.8-.5-1.1.2-2.2 1.5-2.2h1.2c2 0 3.1-1.3 3.1-3.3A7.6 7.6 0 0 0 10 2.5Z" />
        <circle cx="6.1" cy="8" r=".8" /><circle cx="9.2" cy="5.9" r=".8" /><circle cx="13" cy="7" r=".8" />
      </svg>
      <span>{{ t(getTheme(modelValue).label) }}</span>
      <svg class="theme-chevron" viewBox="0 0 12 12" aria-hidden="true"><path d="m3 4.5 3 3 3-3" /></svg>
    </button>
    <Teleport to="body">
      <fieldset
        v-if="isOpen"
        id="theme-options"
        ref="popover"
        class="theme-options"
        :style="{ top: `${popoverPosition.top}px`, right: `${popoverPosition.right}px` }"
      >
        <legend class="sr-only">{{ t('Choose a theme') }}</legend>
        <div class="theme-menu-heading">{{ t('APPEARANCE') }}</div>
        <label v-for="theme in themes" :key="theme.id" class="theme-option" :data-theme-option="theme.id" :class="{ 'is-selected': modelValue === theme.id }">
          <input class="sr-only" type="radio" name="interface-theme" :value="theme.id" :checked="modelValue === theme.id" @change="selectTheme(theme.id)" />
          <span class="theme-swatch" aria-hidden="true"><span></span><span></span><span></span></span>
          <span class="theme-option-copy"><strong>{{ t(theme.label) }}</strong><small>{{ t(theme.description) }}</small></span>
          <svg v-if="modelValue === theme.id" class="theme-check" viewBox="0 0 16 16" aria-hidden="true"><path d="m3.5 8 3 3 6-6" /></svg>
        </label>
      </fieldset>
    </Teleport>
  </div>
</template>
