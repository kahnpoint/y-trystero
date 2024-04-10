import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [],
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'y-trystero',
      fileName: (format) => `y-trystero.${format}.js`
    },
  }
})