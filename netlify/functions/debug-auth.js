// netlify/functions/debug-auth.js
// TEMPORARY — delete after debugging is done
// Visit: /.netlify/functions/debug-auth in your browser (logged in)

import { getUserId } from './_db.js'

export const handler = async (event) => {
  const authHeader = event.headers?.authorization || event.headers?.Authorization || 'MISSING'

  // Try to decode the JWT payload without verifying
  let jwtPayload = null
  let jwtError = null
  if (authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.slice(7)
      const parts = token.split('.')
      if (parts.length === 3) {
        const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/')
        const padded = payload + '=='.slice((payload.length % 4 === 0) ? 4 : payload.length % 4)
        jwtPayload = JSON.parse(Buffer.from(padded, 'base64').toString('utf8'))
      } else {
        jwtError = `JWT has ${parts.length} parts, expected 3`
      }
    } catch (e) {
      jwtError = e.message
    }
  }

  const userId = getUserId(event)

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      // What getUserId resolved to
      resolved_user_id: userId,

      // Raw auth header (first 80 chars only, for safety)
      auth_header_present: authHeader !== 'MISSING',
      auth_header_prefix: authHeader.slice(0, 80),

      // clientContext (the old Netlify v1 mechanism)
      client_context_present: !!event.clientContext,
      client_context_user: event.clientContext?.user ?? 'null',

      // Decoded JWT payload (if present)
      jwt_payload: jwtPayload ? {
        sub: jwtPayload.sub,
        email: jwtPayload.email,
        exp: jwtPayload.exp,
        exp_readable: jwtPayload.exp ? new Date(jwtPayload.exp * 1000).toISOString() : null,
        aud: jwtPayload.aud,
        app_metadata: jwtPayload.app_metadata,
      } : null,
      jwt_error: jwtError,

      // All headers (so we can see exactly what arrives)
      all_headers: event.headers,

      // HTTP method and path
      method: event.httpMethod,
      path: event.path,
    }, null, 2),
  }
}
