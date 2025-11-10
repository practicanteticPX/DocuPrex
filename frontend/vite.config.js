import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // Permite que Vite escuche en todas las interfaces de red (importante para Docker)
    port: 5173, // Asegura que el puerto sea el 5173
    allowedHosts: [
      'firmapro.com',
      'www.firmapro.com',
      '192.168.0.19',
      'localhost'
    ]
  }
})