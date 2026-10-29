import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { createVideoApp } from '../server/app.js'

async function startFixtureServer(t, config) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'video-view-api-'))
  const nested = path.join(root, '资料')
  await mkdir(nested)
  await writeFile(path.join(nested, 'sample.mp4'), '0123456789abcdef')
  await writeFile(path.join(root, 'notes.txt'), 'not public')
  if (config) {
    await mkdir(path.join(root, '.video'))
    await writeFile(path.join(root, '.video', 'config.json'), JSON.stringify(config))
  }

  const app = createVideoApp({ rootDir: root, staticDir: null })
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance))
  })
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve))
    await rm(root, { recursive: true, force: true })
  })

  return { root, baseUrl: `http://127.0.0.1:${server.address().port}` }
}

test('GET /api/tree returns the root name and nested video list', async (t) => {
  const { root, baseUrl } = await startFixtureServer(t)

  const response = await fetch(`${baseUrl}/api/tree`)
  const result = await response.json()

  assert.equal(response.status, 200)
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.equal(result.rootName, path.basename(root))
  assert.match(result.sessionId, /^[0-9a-f-]{36}$/i)
  assert.equal(result.count, 1)
  assert.equal(result.tree[0].children[0].path, '资料/sample.mp4')
})

test('GET /api/video serves a video and supports HTTP Range requests', async (t) => {
  const { baseUrl } = await startFixtureServer(t)
  const videoUrl = `${baseUrl}/api/video?path=${encodeURIComponent('资料/sample.mp4')}`

  const response = await fetch(videoUrl)
  assert.equal(response.status, 200)
  assert.match(response.headers.get('content-type'), /^video\/mp4/)
  assert.match(response.headers.get('content-disposition'), /^inline;/)
  assert.equal(await response.text(), '0123456789abcdef')

  const rangeResponse = await fetch(videoUrl, { headers: { Range: 'bytes=4-7' } })
  assert.equal(rangeResponse.status, 206)
  assert.equal(rangeResponse.headers.get('content-range'), 'bytes 4-7/16')
  assert.equal(await rangeResponse.text(), '4567')

  const traversalResponse = await fetch(`${baseUrl}/api/video?path=${encodeURIComponent('../outside.mp4')}`)
  assert.equal(traversalResponse.status, 403)
})

test('unknown API routes return JSON', async (t) => {
  const { baseUrl } = await startFixtureServer(t)

  const response = await fetch(`${baseUrl}/api/missing`)

  assert.equal(response.status, 404)
  assert.deepEqual(await response.json(), { error: 'API route not found.' })
})

test('GET /api/config exposes lock settings without the password or root path', async (t) => {
  const { root, baseUrl } = await startFixtureServer(t, { blurLockScreen: true, lockPassword: '0042', privateField: 'secret' })
  const response = await fetch(`${baseUrl}/api/config`)
  const config = await response.json()
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.deepEqual(Object.keys(config).sort(), ['blurLockScreen', 'hasLockPassword', 'workspaceId'])
  assert.equal(config.blurLockScreen, true)
  assert.equal(config.hasLockPassword, true)
  assert.match(config.workspaceId, /^[a-f0-9]{64}$/)
  assert.ok(!JSON.stringify(config).includes(root))
  assert.deepEqual(await (await fetch(`${baseUrl}/api/config`)).json(), config)
  assert.equal((await fetch(`${baseUrl}/.video/config.json`)).status, 404)
})

test('POST /api/unlock verifies the exact password, including leading zeroes', async (t) => {
  const { baseUrl } = await startFixtureServer(t, { blurLockScreen: true, lockPassword: '0042' })
  for (const [password, status] of [['0042', 200], ['42', 401], ['wrong', 401], ['', 400], [42, 400], [null, 400]]) {
    const response = await fetch(`${baseUrl}/api/unlock`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }),
    })
    assert.equal(response.status, status)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    const result = await response.json()
    if (status === 200) assert.deepEqual(result, { unlocked: true })
    else assert.equal(typeof result.error, 'string')
    assert.ok(!JSON.stringify(result).includes('0042'))
  }
})

test('empty passwords and disabled locks can continue without a password', async (t) => {
  for (const config of [
    { blurLockScreen: true, lockPassword: '' },
    { blurLockScreen: true, lockPassword: '  ' },
    { blurLockScreen: false, lockPassword: '1234' },
  ]) {
    const { baseUrl } = await startFixtureServer(t, config)
    const response = await fetch(`${baseUrl}/api/unlock`, { method: 'POST' })
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { unlocked: true })
  }
})

test('numeric zero passwords work and oversized or malformed bodies are rejected', async (t) => {
  const { baseUrl } = await startFixtureServer(t, { blurLockScreen: true, lockPassword: 0 })
  for (const [body, status] of [['{"password":"0"}', 200], ['{broken', 400], [JSON.stringify({ password: 'a'.repeat(1100) }), 413]]) {
    const response = await fetch(`${baseUrl}/api/unlock`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
    })
    assert.equal(response.status, status)
    await response.json()
  }
})
