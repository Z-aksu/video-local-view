import { computed, inject, ref } from 'vue'

import { DEFAULT_LANGUAGE, isSupportedLanguage, LANGUAGE_HELP, LANGUAGE_LOCALES, translate } from '../shared/localization.js'

export const I18N_KEY = Symbol('video-local-view.i18n')

export function createI18n(initialLanguage = DEFAULT_LANGUAGE) {
  const language = ref(DEFAULT_LANGUAGE)
  function setLanguage(value) {
    if (!isSupportedLanguage(value)) {
      throw new Error(`Unsupported language: ${String(value)}. Supported languages: ${LANGUAGE_HELP}.`)
    }
    language.value = value
  }
  setLanguage(initialLanguage)
  const locale = computed(() => LANGUAGE_LOCALES[language.value])
  const t = (message, parameters) => translate(language.value, message, parameters)
  return { language, locale, t, setLanguage }
}

export function useI18n() {
  return inject(I18N_KEY)
}
