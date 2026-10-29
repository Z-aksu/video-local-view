import { createApp } from 'vue'

import App from './App.vue'
import './styles/index.less'
import { applyTheme, readTheme } from './theme.js'

applyTheme(readTheme())
createApp(App).mount('#app')
