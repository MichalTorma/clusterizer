import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub project pages need a subpath base (e.g. /clusterizer/).
// Local dev and custom domains can leave VITE_BASE_PATH unset.
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH || '/',
  build: {
    // Earth Engine reads constructor parameter names (and the `opt_` prefix) at
    // runtime. Identifier mangling turns Polygon(coords, opt_proj, ...) into
    // Polygon(e, t, n, r, i) and then throws "Missing required arguments".
    minify: 'terser',
    terserOptions: {
      mangle: false,
      format: {
        comments: false,
      },
    },
    chunkSizeWarningLimit: 2000,
  },
})
