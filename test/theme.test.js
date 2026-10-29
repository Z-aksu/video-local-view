import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import less from 'less'

import { applyTheme, DEFAULT_THEME, getTheme, readTheme, saveTheme, themes, THEME_STORAGE_KEY } from '../src/theme.js'

function memoryStorage(initial) {
  const values = new Map(initial ? [[THEME_STORAGE_KEY, initial]] : [])
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  }
}

test('theme preferences persist and unknown preferences fall back safely', () => {
  const storage = memoryStorage()
  assert.equal(readTheme(storage), DEFAULT_THEME)
  for (const theme of themes) {
    saveTheme(theme.id, storage)
    assert.equal(readTheme(storage), theme.id)
  }
  for (const id of ['removed-theme', '__proto__', 'toString', null, undefined, {}]) {
    assert.equal(getTheme(id).id, DEFAULT_THEME)
  }
  assert.equal(readTheme(memoryStorage('removed-theme')), DEFAULT_THEME)
  saveTheme('removed-theme', storage)
  assert.equal(readTheme(storage), DEFAULT_THEME)
})

test('blocked or missing browser storage does not break theme switching', () => {
  const blocked = {
    getItem() { throw new Error('Storage unavailable') },
    setItem() { throw new Error('Storage unavailable') },
  }
  assert.equal(readTheme(blocked), DEFAULT_THEME)
  assert.equal(readTheme(null), DEFAULT_THEME)
  assert.doesNotThrow(() => saveTheme('ink', blocked))
  assert.doesNotThrow(() => saveTheme('ink', null))
  // The default access also remains safe in environments without window.
  assert.equal(readTheme(), DEFAULT_THEME)
  assert.doesNotThrow(() => saveTheme('ink'))
})

test('applying a theme updates the document and browser chrome color', () => {
  let metaColor
  const page = {
    documentElement: { dataset: {} },
    defaultView: { getComputedStyle: () => ({ getPropertyValue: () => ' #f4f3ef ' }) },
    querySelector: () => ({ setAttribute: (_key, value) => { metaColor = value } }),
  }
  assert.equal(applyTheme('ink', page), 'ink')
  assert.equal(page.documentElement.dataset.theme, 'ink')
  assert.equal(metaColor, '#f4f3ef')
  assert.equal(applyTheme('unknown', page), DEFAULT_THEME)
  assert.equal(page.documentElement.dataset.theme, DEFAULT_THEME)
  assert.doesNotThrow(() => applyTheme('forest', { documentElement: { dataset: {} } }))
})

test('every theme supplies valid local SVG banners and all consumed CSS tokens', async () => {
  const stylesUrl = new URL('../src/styles/index.less', import.meta.url)
  const source = await readFile(stylesUrl, 'utf8')
  const switcherSource = await readFile(new URL('../src/styles/components/theme-switcher.less', import.meta.url), 'utf8')
  const playerSource = await readFile(new URL('../src/components/VideoPlayer.vue', import.meta.url), 'utf8')
  const usedTokens = new Set([...`${source}\n${switcherSource}\n${playerSource}`.matchAll(/var\((--[a-z-]+)\)/g)].map((match) => match[1]))
  usedTokens.delete('--slide-count') // The carousel provides its dynamic count inline.
  for (const token of ['--preview-paper', '--preview-surface', '--preview-accent']) usedTokens.delete(token)

  assert.equal(new Set(themes.map((theme) => theme.id)).size, themes.length)
  for (const theme of themes) {
    const themeUrl = new URL(`../src/styles/themes/${theme.id}.less`, import.meta.url)
    const themeSource = await readFile(themeUrl, 'utf8')
    const compiled = await less.render(themeSource, { filename: themeUrl.pathname.replace(/^\/(\w:)/, '$1') })
    const definedTokens = new Set([...compiled.css.matchAll(/(--[a-z-]+)\s*:/g)].map((match) => match[1]))
    for (const token of usedTokens) assert.ok(definedTokens.has(token), `${theme.id} is missing ${token}`)
    assert.ok(theme.banners.length > 0, `${theme.id} needs at least one banner`)
    for (const banner of theme.banners) {
      const svg = await readFile(new URL(banner.src), 'utf8')
      assert.match(svg, /<svg[^>]+xmlns="http:\/\/www.w3.org\/2000\/svg"/)
      assert.match(svg, /viewBox="0 0 \d+ \d+"/)
      assert.ok(banner.title)
      assert.doesNotMatch(svg, /\p{Script=Han}/u, 'Keep artwork labels in English')
      assert.doesNotMatch(svg, /<script|<image|https?:\/\/(?!www\.w3\.org)/i)
    }
  }
  assert.doesNotMatch(source + switcherSource, /#[\da-f]{3,8}\b|rgba?\(/i, 'Keep palette colors in theme files')
})

test('all visible interface prompts are English and the theme menu renders above the player', async () => {
  const component = await readFile(new URL('../src/components/ThemeSwitcher.vue', import.meta.url), 'utf8')
  const style = await readFile(new URL('../src/styles/components/theme-switcher.less', import.meta.url), 'utf8')
  const app = await readFile(new URL('../src/App.vue', import.meta.url), 'utf8')
  const player = await readFile(new URL('../src/components/VideoPlayer.vue', import.meta.url), 'utf8')
  const carousel = await readFile(new URL('../src/components/PrivacyScreen.vue', import.meta.url), 'utf8')
  const tree = await readFile(new URL('../src/components/VideoTreeNode.vue', import.meta.url), 'utf8')
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8')
  const cli = await readFile(new URL('../bin/video-view.js', import.meta.url), 'utf8')
  const serverApp = await readFile(new URL('../server/app.js', import.meta.url), 'utf8')
  const serverFiles = await readFile(new URL('../server/files.js', import.meta.url), 'utf8')
  const serverOptions = await readFile(new URL('../server/options.js', import.meta.url), 'utf8')
  const serverListener = await readFile(new URL('../server/listen.js', import.meta.url), 'utf8')

  for (const theme of themes) assert.match(theme.label, /^[A-Za-z ]+$/)
  for (const source of [component, app, player, carousel, tree, html, cli, serverApp, serverFiles, serverOptions, serverListener]) {
    assert.doesNotMatch(source, /\p{Script=Han}/u, 'Keep interface copy and accessibility labels in English')
  }
  assert.match(component, /<Teleport to="body">/)
  assert.match(component, /Choose a theme/)
  assert.match(component, /APPEARANCE/)
  assert.match(component, /aria-label="`Change theme, current:/)
  assert.match(component, /:style="\{ top: `\$\{popoverPosition\.top\}px`, right:/)
  assert.match(style, /\.theme-options\s*\{\s*position:\s*fixed;/)
  assert.match(style, /z-index:\s*1000;/)
})
