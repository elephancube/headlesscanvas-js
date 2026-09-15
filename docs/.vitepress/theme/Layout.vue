<script setup lang="ts">
import DefaultTheme from 'vitepress/theme'
import Demo from './Demo.vue'

/**
 * The default layout, with a live editor in the hero's image slot.
 *
 * VitePress's `hero.image` takes a picture. What belongs there for this project
 * is not a picture of an editor.
 */
const { Layout } = DefaultTheme
</script>

<template>
  <Layout>
    <template #home-hero-image>
      <Demo id="hero" bare />
    </template>
  </Layout>
</template>
