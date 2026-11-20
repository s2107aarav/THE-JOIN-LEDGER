// This host adapter handles public build assets only. Calculations run in the browser.
export default {
  fetch(request) {
    const headers = new Headers(policy)
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      headers.set('Allow', 'GET, HEAD')
      return new Response('Method not allowed', { status: 405, headers })
    }
    const path = new URL(request.url).pathname
    const asset = assets.get(path === '/' ? '/index.html' : path)
    if (!asset) return new Response('Not found', { status: 404, headers })
    headers.set('Content-Type', asset.type)
    headers.set('Cache-Control', path.startsWith('/assets/')
      ? 'public, max-age=31536000, immutable'
      : 'public, max-age=0, must-revalidate')
    const body = request.method === 'HEAD' ? null : Uint8Array.from(atob(asset.body), char => char.charCodeAt(0))
    return new Response(body, { headers })
  },
}
