import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        content: resolve(import.meta.dirname, 'src/content.ts'),
        navigation: resolve(import.meta.dirname, 'src/navigation.ts'),
      },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === 'content' || chunk.name === 'navigation'
            ? `${chunk.name}.js`
            : 'assets/[name]-[hash].js',
      },
    },
  },
})
