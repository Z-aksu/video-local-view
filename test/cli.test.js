import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const entrypoint = fileURLToPath(new URL('../bin/video-view.js', import.meta.url))
const children = new WeakMap()

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'video-view-cli-'))
  children.set(t, [])
  t.after(async () => {
    // Windows cannot remove a directory while a child process uses it as cwd.
    for (const child of children.get(t)) {
      if (child.exitCode === null && child.signalCode === null) {
        const stopped = once(child, 'exit')
        child.kill()
        await stopped
      }
    }
    await rm(root, { recursive: true, force: true })
  })
  return root
}

async function start(t, cwd, args = []) {
  const child = spawn(process.execPath, [entrypoint, '--no-open', '--port', '0', ...args], { cwd, windowsHide: true })
  children.get(t).push(child)
  return new Promise((resolve, reject) => {
    let output = ''
    const timeout = setTimeout(() => { child.kill(); reject(new Error(`CLI startup timed out: ${output}`)) }, 15000)
    child.on('error', (error) => { clearTimeout(timeout); reject(error) })
    child.stderr.on('data', data => { output += data })
    child.stdout.on('data', data => {
      output += data
      if (output.includes('Press Ctrl+C')) {
        clearTimeout(timeout)
        resolve(output)
      }
    })
    child.on('exit', code => {
      clearTimeout(timeout)
      reject(new Error(`CLI exited (${code}): ${output}`))
    })
  })
}

test('CLI startup initializes the current video directory configuration', async (t) => {
  const root = await fixture(t)
  const output = await start(t, root)
  const configPath = path.join(root, '.video', 'config.json')
  assert.deepEqual(JSON.parse(await readFile(configPath, 'utf8')), { blurLockScreen: true, lockPassword: '' })
  assert.ok(output.includes(`Config: ${configPath}`))
})

test('CLI --dir initializes only the selected video directory and preserves its password', async (t) => {
  const root = await fixture(t)
  const videos = path.join(root, 'videos')
  await mkdir(path.join(videos, '.video'), { recursive: true })
  const configPath = path.join(videos, '.video', 'config.json')
  const original = '{ "blurLockScreen": true, "lockPassword": "0012", "keep": 42 }\n'
  await writeFile(configPath, original)
  await start(t, root, ['--dir', videos])
  assert.equal(await readFile(configPath, 'utf8'), original)
  await assert.rejects(readFile(path.join(root, '.video', 'config.json')), { code: 'ENOENT' })
})

test('CLI fails clearly on malformed configuration without overwriting it', async (t) => {
  const root = await fixture(t)
  await mkdir(path.join(root, '.video'))
  const configPath = path.join(root, '.video', 'config.json')
  await writeFile(configPath, '{broken')
  await assert.rejects(start(t, root), /Startup failed: Unable to initialize configuration/)
  assert.equal(await readFile(configPath, 'utf8'), '{broken')
})
