import assert from 'node:assert/strict'
import test from 'node:test'

import { CHINESE_MESSAGES, DEFAULT_LANGUAGE, isSupportedLanguage, SUPPORTED_LANGUAGES, translate } from '../shared/localization.js'
import { createI18n } from '../src/i18n.js'

test('supports exactly English and Chinese with English as the default', () => {
  assert.equal(DEFAULT_LANGUAGE, 'en')
  assert.deepEqual(SUPPORTED_LANGUAGES, ['en', 'zh'])
  for (const value of ['en', 'zh']) assert.equal(isSupportedLanguage(value), true)
  for (const value of ['fr', 'zh-CN', 'EN', null, undefined, {}, 0]) assert.equal(isSupportedLanguage(value), false)
})

test('preserves English keys, translates Chinese and interpolates values literally', () => {
  for (const [message, chinese] of Object.entries(CHINESE_MESSAGES)) {
    assert.equal(translate('en', message), message)
    assert.equal(translate('zh', message), chinese)
    assert.deepEqual([...message.matchAll(/\{\w+\}/g)].map(match => match[0]).sort(),
      [...chinese.matchAll(/\{\w+\}/g)].map(match => match[0]).sort())
  }
  assert.equal(translate('zh', '{count} videos', { count: 3 }), '3 个视频')
  assert.equal(translate('zh', 'Change theme, current: {theme}', { theme: '$&{count}' }), '切换主题，当前：$&{count}')
  assert.equal(translate('zh', 'unknown message'), 'unknown message')
  assert.equal(translate('zh', 'toString'), 'toString')
})

test('Vue locale and translations follow validated configuration and stay isolated', () => {
  const english = createI18n()
  const chinese = createI18n('zh')
  assert.equal(english.locale.value, 'en-US')
  assert.equal(chinese.locale.value, 'zh-CN')
  assert.equal(chinese.t('Forest'), '青山')
  english.setLanguage('zh')
  assert.equal(english.t('Monthly calendar'), '本月日历')
  english.setLanguage('en')
  assert.equal(chinese.t('Forest'), '青山')
  assert.throws(() => english.setLanguage('fr'), /Supported languages/)
  assert.equal(english.language.value, 'en')
  assert.throws(() => createI18n('zh-CN'), /Supported languages/)
})
