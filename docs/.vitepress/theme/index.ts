import type { Theme } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import Demo from './Demo.vue'
import Layout from './Layout.vue'
import './app.css'
import './demo.css'

export default {
  extends: DefaultTheme,
  Layout,
  enhanceApp({ app }) {
    app.component('Demo', Demo)
  },
} satisfies Theme
