import { createApp } from 'vue'
import { pinia } from '@/plugin/pinia'
import App from './App.vue'

createApp(App)
  .use(pinia)
  .mount('#app')
