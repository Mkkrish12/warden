import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Resolves @warden/shared from tsconfig paths (native since Vite 8).
  resolve: { tsconfigPaths: true },
})
