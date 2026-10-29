export const DEFAULT_THEME = 'forest'
export const THEME_STORAGE_KEY = 'video-local-view.theme'

// Register a theme here and add its variables in styles/themes/<id>.less.
export const themes = Object.freeze([
  Object.freeze({
    id: 'forest', label: 'Forest', description: 'Fresh green landscape', bannerLabel: 'Forest landscape carousel',
    banners: Object.freeze([
      { src: new URL('./assets/banners/forest/01.svg', import.meta.url).href, title: 'A Quiet Mountain Lake' },
      { src: new URL('./assets/banners/forest/02.svg', import.meta.url).href, title: 'Bamboo in the Mist' },
      { src: new URL('./assets/banners/forest/03.svg', import.meta.url).href, title: 'Moonlit Mountains' },
    ]),
  }),
  Object.freeze({
    id: 'ink', label: 'Ink Wash', description: 'Monochrome ink landscape', bannerLabel: 'Ink wash landscape carousel',
    banners: Object.freeze([
      { src: new URL('./assets/banners/ink/01.svg', import.meta.url).href, title: 'Mountains in Ink' },
      { src: new URL('./assets/banners/ink/02.svg', import.meta.url).href, title: 'Whispering Bamboo' },
      { src: new URL('./assets/banners/ink/03.svg', import.meta.url).href, title: 'Moon Among the Pines' },
    ]),
  }),
])

export function getTheme(id) {
  return themes.find((theme) => theme.id === id) ?? themes[0]
}

export function readTheme(storage) {
  try {
    const source = storage === undefined ? window.localStorage : storage
    return getTheme(source?.getItem(THEME_STORAGE_KEY)).id
  } catch {
    return DEFAULT_THEME
  }
}

export function saveTheme(id, storage) {
  try {
    const target = storage === undefined ? window.localStorage : storage
    target?.setItem(THEME_STORAGE_KEY, getTheme(id).id)
  } catch {
    // Switching still works when browser storage is unavailable.
  }
}

export function applyTheme(id, page = document) {
  const theme = getTheme(id)
  page.documentElement.dataset.theme = theme.id
  const background = page.defaultView?.getComputedStyle(page.documentElement).getPropertyValue('--bg').trim()
  if (background) page.querySelector('meta[name="theme-color"]')?.setAttribute('content', background)
  return theme.id
}
