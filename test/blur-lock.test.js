import assert from 'node:assert/strict'
import test from 'node:test'

import { createBlurLock } from '../src/blur-lock.js'

function fixture({ focused = true, hidden = false, storage = new Map() } = {}) {
  const windowObject = new EventTarget()
  const documentObject = new EventTarget()
  const changes = []
  documentObject.visibilityState = hidden ? 'hidden' : 'visible'
  documentObject.hasFocus = () => focused
  windowObject.sessionStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  }
  const controller = createBlurLock({ windowObject, documentObject, onChange: (locked) => changes.push(locked) })
  return {
    controller, changes, storage, windowObject, documentObject,
    configure: (enabled = true, workspaceId = 'workspace-a') => controller.configure({ enabled, workspaceId }),
    blur() {
      focused = false
      windowObject.dispatchEvent(new Event('blur'))
    },
    focus() {
      focused = true
      documentObject.visibilityState = 'visible'
      windowObject.dispatchEvent(new Event('focus'))
      documentObject.dispatchEvent(new Event('visibilitychange'))
    },
    hide() {
      documentObject.visibilityState = 'hidden'
      documentObject.dispatchEvent(new Event('visibilitychange'))
    },
  }
}

test('locks on window blur and requires verified password even after focus returns', async () => {
  const page = fixture()
  page.configure()
  assert.equal(page.controller.locked, false)
  page.blur()
  page.focus()
  assert.equal(page.controller.locked, true)
  assert.equal(await page.controller.unlock(async () => false), false)
  assert.equal(page.controller.locked, true)
  assert.equal(await page.controller.unlock(async () => true), true)
  assert.equal(page.controller.locked, false)
  page.controller.dispose()
})

test('locks on hidden visibility and pagehide, but not on visible visibilitychange', async () => {
  const page = fixture()
  page.configure()
  page.focus()
  assert.equal(page.controller.locked, false)
  page.hide()
  page.focus()
  assert.equal(page.controller.locked, true)
  await page.controller.unlock(async () => true)
  page.windowObject.dispatchEvent(new Event('pagehide'))
  assert.equal(page.controller.locked, true)
  page.controller.dispose()
})

test('remembers blur before configuration loads and handles opening in the background', () => {
  const page = fixture()
  page.blur()
  page.focus()
  page.configure()
  assert.equal(page.controller.locked, true)
  const background = fixture({ focused: false })
  background.configure()
  assert.equal(background.controller.locked, true)
  page.controller.dispose()
  background.controller.dispose()
})

test('disabled locking ignores focus changes and clears persisted lock state', () => {
  const page = fixture()
  page.configure()
  page.blur()
  page.configure(false)
  page.hide()
  assert.equal(page.controller.locked, false)
  assert.equal(page.storage.size, 0)
  page.controller.dispose()
})

test('keeps locked on reload in the same workspace and separates different workspaces', async () => {
  const first = fixture()
  first.configure()
  first.blur()
  first.controller.dispose()
  const reloaded = fixture({ storage: first.storage })
  reloaded.configure()
  assert.equal(reloaded.controller.locked, true)
  const otherWorkspace = fixture({ storage: first.storage })
  otherWorkspace.configure(true, 'workspace-b')
  assert.equal(otherWorkspace.controller.locked, false)
  await reloaded.controller.unlock(async () => true)
  assert.equal(first.storage.size, 0)
  reloaded.controller.dispose()
  otherWorkspace.controller.dispose()
})

test('refuses a successful password response when the page lost focus during verification', async () => {
  const page = fixture()
  page.configure()
  page.blur()
  page.focus()
  let finishVerification
  const attempt = page.controller.unlock(() => new Promise((resolve) => { finishVerification = resolve }))
  page.blur()
  page.focus()
  finishVerification(true)
  assert.equal(await attempt, false)
  assert.equal(page.controller.locked, true)
  assert.equal(await page.controller.unlock(async () => true), true)
  page.controller.dispose()
})

test('continues locking when browser storage is unavailable and removes listeners on disposal', () => {
  const page = fixture()
  Object.defineProperty(page.windowObject, 'sessionStorage', { get() { throw new Error('Storage blocked') } })
  page.configure()
  page.blur()
  assert.equal(page.controller.locked, true)
  const count = page.changes.length
  page.controller.dispose()
  page.blur()
  page.hide()
  assert.equal(page.changes.length, count)
})
