<script setup lang="ts">
import { useData } from 'vitepress'
import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { demos } from '../demos'
import type { DemoInstance } from '../demos/types'

const props = defineProps<{ id: string; title?: string }>()

const { lang } = useData()
const host = ref<HTMLElement | null>(null)
const failed = ref('')
const instance = shallowRef<DemoInstance | null>(null)

let observer: IntersectionObserver | null = null

async function mount(): Promise<void> {
  const element = host.value
  const load = demos[props.id]
  if (!element || !load || instance.value) return
  try {
    const demo = await load()
    instance.value = demo({ root: element, lang: lang.value.startsWith('ja') ? 'ja' : 'en' })
  } catch (error) {
    failed.value = String(error)
  }
}

onMounted(() => {
  // Several demos can appear on one page, and each one runs a live editor.
  // Starting them as they scroll into view keeps the page from spinning up
  // editors nobody is looking at.
  if (typeof IntersectionObserver === 'undefined') {
    void mount()
    return
  }
  observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer?.disconnect()
        observer = null
        void mount()
      }
    },
    { rootMargin: '200px' },
  )
  if (host.value) observer.observe(host.value)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  instance.value?.dispose()
  instance.value = null
})
</script>

<template>
  <figure class="hc-demo">
    <figcaption v-if="title" class="hc-demo-title">{{ title }}</figcaption>
    <div ref="host" class="hc-demo-host"></div>
    <p v-if="failed" class="hc-demo-error">{{ failed }}</p>
  </figure>
</template>
