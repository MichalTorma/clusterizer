import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub project pages need a subpath base (e.g. /clusterizer/).
// Local dev and custom domains can leave VITE_BASE_PATH unset.
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH || '/',
})
