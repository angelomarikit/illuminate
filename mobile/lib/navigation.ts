type BackRouter = {
  canGoBack: () => boolean
  back: () => void
  replace: (href: '/(tabs)') => void
}

/** Prefer history back; fall back when opened as a root/deep link (common on web). */
export function safeBack(router: BackRouter, fallback: '/(tabs)' = '/(tabs)') {
  if (router.canGoBack()) {
    router.back()
    return
  }
  router.replace(fallback)
}
