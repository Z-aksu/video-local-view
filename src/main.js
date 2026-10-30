import { createApp } from 'vue'

import App from './App.vue'
import './styles/index.less'
import { applyTheme, readTheme } from './theme.js'
import { createI18n, I18N_KEY } from './i18n.js'

applyTheme(readTheme())
createApp(App).provide(I18N_KEY, createI18n()).mount('#app')
