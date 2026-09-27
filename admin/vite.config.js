import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? '/Rozgarmitra/' : '/',
  server: {
    host: true, // listen on 127.0.0.1 / LAN IPs, not just IPv6 ::1
    allowedHosts: true,
  },
}))
