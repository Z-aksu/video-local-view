import assert from 'node:assert/strict'
import test from 'node:test'

import { parseCliOptions } from '../server/options.js'

test('CLI defaults to the current directory and a loopback listener', () => {
  assert.deepEqual(parseCliOptions([]), {
    directory: '.',
    port: 3210,
    portSpecified: false,
    host: '127.0.0.1',
    open: true,
    help: false,
    version: false,
  })
})

test('CLI parses directory, port, host, and LAN options', () => {
  const options = parseCliOptions(['-d', 'D:\\视频资料', '--port=4300', '--lan', '--no-open'])

  assert.equal(options.directory, 'D:\\视频资料')
  assert.equal(options.port, 4300)
  assert.equal(options.portSpecified, true)
  assert.equal(options.host, '0.0.0.0')
  assert.equal(options.open, false)
})

test('CLI rejects missing values, invalid ports, and unknown options', () => {
  assert.throws(() => parseCliOptions(['--dir']), /Missing value for --dir/)
  assert.throws(() => parseCliOptions(['--port=65536']), /Port must be an integer/)
  assert.throws(() => parseCliOptions(['--unknown']), /Unknown option/)
})
