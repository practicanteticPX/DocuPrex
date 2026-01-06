import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  server: {
    host: true, // Permite que Vite escuche en todas las interfaces de red (importante para Docker)
    port: 5173, // Asegura que el puerto sea el 5173
    strictPort: true,
    allowedHosts: [
      'docuprex.com',
      'www.docuprex.com',
      'localhost',
      '.local' // Permite cualquier dominio .local
    ],
    hmr: {
      // Configuración del HMR para que funcione con dominio y diferentes hosts
      clientPort: 5173,
      // El host se determina dinámicamente en el cliente
      host: undefined
    },
    // Proxy para evitar problemas de mixed content (HTTPS frontend -> HTTP backend)
    // Cuando se accede vía HTTPS, las llamadas al backend pasan por este proxy
    // Usa nombre de contenedor para comunicación interna de Docker (más seguro)
    proxy: {
      '/graphql': {
        target: 'http://firmas_server:5001',
        changeOrigin: true,
        secure: false
      },
      '/api': {
        target: 'http://firmas_server:5001',
        changeOrigin: true,
        secure: false
      },
      '/uploads': {
        target: 'http://firmas_server:5001',
        changeOrigin: true,
        secure: false
      }
    }
  },
  preview: {
    host: true,
    port: 5173,
    strictPort: true,
    allowedHosts: [
      'docuprex.com',
      'www.docuprex.com',
      'localhost',
      '.local' // Permite cualquier dominio .local
    ],
    proxy: {
      '/graphql': {
        target: 'http://firmas_server:5001',
        changeOrigin: true,
        secure: false
      },
      '/api': {
        target: 'http://firmas_server:5001',
        changeOrigin: true,
        secure: false
      },
      '/uploads': {
        target: 'http://firmas_server:5001',
        changeOrigin: true,
        secure: false
      }
    }
  }
})