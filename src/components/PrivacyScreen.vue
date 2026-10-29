<script setup>
import { computed, ref, watch } from 'vue'

import { getTheme } from '../theme.js'

const props = defineProps({ theme: { type: String, default: 'forest' } })
defineEmits(['restore'])

const currentTheme = computed(() => getTheme(props.theme))
const slides = computed(() => currentTheme.value.banners)
const slideCount = computed(() => slides.value.length)
const activeSlide = ref(0)
let pointerStartX = null

watch(() => props.theme, () => { activeSlide.value = 0 })

function showSlide(index) {
  activeSlide.value = (index + slideCount.value) % slideCount.value
}

function startSwipe(event) {
  pointerStartX = event.target.closest('button') ? null : event.clientX
  if (pointerStartX !== null) event.currentTarget.setPointerCapture(event.pointerId)
}

function endSwipe(event) {
  if (pointerStartX === null) return
  const distance = event.clientX - pointerStartX
  pointerStartX = null
  if (Math.abs(distance) < 45) return
  showSlide(activeSlide.value + (distance < 0 ? 1 : -1))
}
</script>

<template>
  <div
    class="privacy-screen"
    role="region"
    aria-roledescription="carousel"
    :aria-label="currentTheme.bannerLabel"
    tabindex="0"
    @pointerdown="startSwipe"
    @pointerup="endSwipe"
    @pointercancel="pointerStartX = null"
    @keydown.left.stop.prevent="showSlide(activeSlide - 1)"
    @keydown.right.stop.prevent="showSlide(activeSlide + 1)"
  >
    <div class="privacy-carousel" :style="{ '--slide-count': slideCount, transform: 'translateX(-' + activeSlide * (100 / slideCount) + '%)' }" aria-live="polite" aria-atomic="true">
      <img
        v-for="(slide, index) in slides"
        :key="slide.src"
        class="privacy-landscape"
        :src="slide.src"
        :alt="slide.title"
        :aria-hidden="activeSlide !== index"
        draggable="false"
        @dragstart.prevent
      />
    </div>

    <button class="privacy-slide-arrow privacy-slide-previous" type="button" aria-label="Previous artwork" title="Previous" @click.stop="showSlide(activeSlide - 1)">
      <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m12 4-6 6 6 6" /></svg>
    </button>
    <button class="privacy-slide-arrow privacy-slide-next" type="button" aria-label="Next artwork" title="Next" @click.stop="showSlide(activeSlide + 1)">
      <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m8 4 6 6-6 6" /></svg>
    </button>
    <div class="privacy-slide-dots" aria-label="Carousel position">
      <button
        v-for="(slide, index) in slides"
        :key="slide.src"
        type="button"
        :class="{ 'is-active': activeSlide === index }"
        :aria-label="'Image ' + (index + 1) + ': ' + slide.title"
        :aria-current="activeSlide === index ? 'true' : undefined"
        @click.stop="showSlide(index)"
      ></button>
    </div>
  </div>
</template>
