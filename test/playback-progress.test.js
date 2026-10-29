import assert from 'node:assert/strict'
import test from 'node:test'

import { normalizePlaybackTime, trackPlaybackProgress } from '../src/playback-progress.js'

class FakeVideo extends EventTarget {
  readyState = 0
  duration = NaN
  error = null
  ended = false
  seeking = false
  time = 0
  seeks = []
  rejectSeek = false

  get currentTime() {
    return this.time
  }

  set currentTime(value) {
    if (this.rejectSeek) throw new Error('Seek unsupported')
    this.seeks.push(value)
    this.time = value
    this.seeking = true
  }

  fire(event) {
    this.dispatchEvent(new Event(event))
  }

  load(duration = 120) {
    this.readyState = 1
    this.duration = duration
    this.fire('loadedmetadata')
  }

  finishSeek() {
    this.seeking = false
    this.fire('seeked')
  }
}

function fixture(initialTime = 0, video = new FakeVideo()) {
  const page = new EventTarget()
  page.document = new EventTarget()
  page.document.visibilityState = 'visible'
  const saves = []
  let clock = 0
  const tracker = trackPlaybackProgress(video, {
    initialTime,
    page,
    now: () => clock,
    onProgress: (time) => saves.push(time),
  })
  return { video, page, saves, tracker, tick: (milliseconds) => { clock += milliseconds } }
}

test('only finite, non-negative numeric playback positions are accepted', () => {
  for (const value of [undefined, null, '15', -1, NaN, Infinity, -Infinity, {}, []]) {
    assert.equal(normalizePlaybackTime(value), 0)
  }
  assert.equal(normalizePlaybackTime(0), 0)
  assert.equal(normalizePlaybackTime(15.125), 15.125)
})

test('initial zero events cannot overwrite the saved position before metadata or seek completion', () => {
  const { video, page, saves, tracker, tick } = fixture(42.5)
  tick(10000)
  for (const event of ['timeupdate', 'pause', 'seeked']) video.fire(event)
  page.dispatchEvent(new Event('pagehide'))
  assert.deepEqual(saves, [])
  assert.deepEqual(video.seeks, [])

  video.load()
  assert.deepEqual(video.seeks, [42.5])
  // Simulate progress/pause events arriving while the initial seek is pending.
  video.time = 0
  video.fire('timeupdate')
  video.fire('pause')
  page.dispatchEvent(new Event('pagehide'))
  assert.deepEqual(saves, [])
  video.time = 42.5
  video.finishSeek()
  assert.deepEqual(saves, [])
  video.time = 43
  video.fire('pause')
  assert.deepEqual(saves, [43])
  tracker.destroy()
})

test('restoration also works when metadata is already loaded and happens only once', () => {
  const video = new FakeVideo()
  video.load()
  const { tracker } = fixture(20, video)
  assert.deepEqual(video.seeks, [20])
  video.finishSeek()
  video.time = 50
  video.fire('loadedmetadata')
  video.fire('durationchange')
  assert.deepEqual(video.seeks, [20])
  assert.equal(video.currentTime, 50)
  tracker.destroy()
})

test('unknown duration delays restoration until a finite duration is available', () => {
  const { video, tracker } = fixture(30)
  video.load(Infinity)
  assert.deepEqual(video.seeks, [])
  video.duration = 90
  video.fire('durationchange')
  assert.deepEqual(video.seeks, [30])
  tracker.destroy()
})

test('out-of-range positions reset to the beginning without seeking beyond the duration', () => {
  for (const initialTime of [120, 200]) {
    const { video, saves, tracker } = fixture(initialTime)
    video.load(120)
    assert.deepEqual(video.seeks, [])
    assert.deepEqual(saves, [0])
    tracker.destroy()
  }
})

test('frequent timeupdate events cause at most one save every five seconds', () => {
  const { video, saves, tracker, tick } = fixture()
  video.load()
  for (let index = 1; index <= 1000; index += 1) {
    tick(10)
    video.time = index / 100
    video.fire('timeupdate')
  }
  assert.deepEqual(saves, [5, 10])
  tracker.destroy()
  assert.deepEqual(saves, [5, 10])
})

test('pause, seek, pagehide and hidden visibility save immediately without duplicate writes', () => {
  const { video, page, saves, tracker } = fixture()
  video.load()
  video.time = 1.25
  video.fire('pause')
  video.fire('pause')
  video.time = 80
  video.finishSeek()
  video.time = 81
  page.dispatchEvent(new Event('pagehide'))
  video.time = 82
  page.document.dispatchEvent(new Event('visibilitychange'))
  assert.deepEqual(saves, [1.25, 80, 81])
  page.document.visibilityState = 'hidden'
  page.document.dispatchEvent(new Event('visibilitychange'))
  assert.deepEqual(saves, [1.25, 80, 81, 82])
  tracker.destroy()
})

test('a completed video resets its saved position for the next refresh', () => {
  const { video, saves, tracker } = fixture(100)
  video.load()
  video.finishSeek()
  video.time = 120
  video.ended = true
  video.fire('ended')
  video.fire('timeupdate')
  assert.deepEqual(saves, [0])
  tracker.destroy()
})

test('invalid positions, errors and emptied media do not replace valid saved progress', () => {
  const { video, saves, tracker } = fixture(40)
  video.load()
  video.finishSeek()
  for (const value of [NaN, Infinity, -1]) {
    video.time = value
    video.fire('pause')
  }
  video.time = 0
  video.error = new Error('Decode failed')
  video.fire('pause')
  video.error = null
  video.readyState = 0
  tracker.destroy()
  assert.deepEqual(saves, [])
})

test('failed restoration leaves normal playback and subsequent progress saves working', () => {
  const { video, saves, tracker } = fixture(30)
  video.rejectSeek = true
  assert.doesNotThrow(() => video.load())
  assert.deepEqual(saves, [0])
  video.time = 2
  video.fire('pause')
  assert.deepEqual(saves, [0, 2])
  tracker.destroy()
})

test('destroy flushes the last position and removes media and page listeners', () => {
  const { video, page, saves, tracker } = fixture()
  video.load()
  video.time = 5.75
  tracker.destroy()
  assert.deepEqual(saves, [5.75])
  video.time = 0
  for (const event of ['loadedmetadata', 'durationchange', 'timeupdate', 'seeked', 'pause', 'ended']) video.fire(event)
  page.dispatchEvent(new Event('pagehide'))
  page.document.visibilityState = 'hidden'
  page.document.dispatchEvent(new Event('visibilitychange'))
  tracker.destroy()
  assert.deepEqual(saves, [5.75])
})

test('unmounting before restoration finishes preserves the previous saved position', () => {
  const { video, saves, tracker } = fixture(35)
  video.load()
  video.time = 0
  tracker.destroy()
  video.finishSeek()
  assert.deepEqual(saves, [])
})
