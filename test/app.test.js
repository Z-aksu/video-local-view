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
  assert.deepEqual(Object.keys(config).sort(), ['blurLockScreen', 'hasLockPassword', 'language', 'workspaceId'])
  assert.equal(config.language, 'en')
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

test('configured language controls public configuration and API error messages', async (t) => {
  for (const language of ['en', 'zh']) {
    const { baseUrl } = await startFixtureServer(t, { language, blurLockScreen: true, lockPassword: '0042' })
    const configResponse = await fetch(`${baseUrl}/api/config`)
    assert.equal((await configResponse.json()).language, language)
    assert.equal(configResponse.headers.get('content-language'), language)
    for (const [route, status, english, chinese] of [
      ['/api/missing', 404, 'API route not found.', '接口不存在。'],
      ['/missing', 404, 'Page not found.', '页面不存在。'],
      ['/api/video', 400, 'Missing video file path.', '缺少视频文件路径。'],
      ['/api/video?path=missing.mp4', 404, 'Video file not found.', '视频文件不存在。'],
      ['/api/video?path=notes.txt', 400, 'Unsupported video file type.', '不支持的视频文件类型。'],
      ['/api/video?path=../outside.mp4', 403, 'Access to files outside the video folder is not allowed.', '禁止访问视频目录以外的文件。'],
    ]) {
      const response = await fetch(`${baseUrl}${route}`)
      assert.equal(response.status, status)
      assert.deepEqual(await response.json(), { error: language === 'zh' ? chinese : english })
    }
    for (const [body, status, english, chinese] of [
      ['{"password":""}', 400, 'Enter your password.', '请输入密码。'],
      ['{"password":"wrong"}', 401, 'Incorrect password. Try again.', '密码错误，请重试。'],
      ['{broken', 400, 'Invalid JSON request body.', '请求内容不是有效的 JSON。'],
      [JSON.stringify({ password: 'a'.repeat(1100) }), 413, 'Request body is too large.', '请求内容过大。'],
    ]) {
      const response = await fetch(`${baseUrl}/api/unlock`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
      })
      assert.equal(response.status, status)
      assert.deepEqual(await response.json(), { error: language === 'zh' ? chinese : english })
    }
  }
})
