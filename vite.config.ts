import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const siteUrl = (env.VITE_SITE_URL || '').replace(/\/$/, '')
  const ogImage = siteUrl ? `${siteUrl}/og-share.png` : '/og-share.png'

  return {
    plugins: [
      react(),
      {
        name: 'illuminate-social-meta',
        transformIndexHtml(html) {
          return html
            .replaceAll('%SITE_URL%', siteUrl || '')
            .replaceAll('%OG_IMAGE%', ogImage)
        },
      },
    ],
  }
})
