// netlify/functions/_db.js
// Shared Neon/Postgres client + Netlify Identity JWT auth

import pg from 'pg'
const { Pool } = pg

// ── Database ───────────────────────────────────────────────
let pool

export function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 5,
    })
  }
  return pool
}

export async function query(sql, params = []) {
  const client = await getPool().connect()
  try {
    const result = await client.query(sql, params)
    return result
  } finally {
    client.release()
  }
}

// ── Auth ───────────────────────────────────────────────────
// Three sources tried in order:
// 1. x-nf-identity-info header — Netlify injects this on every request when
//    Identity is enabled; it contains the full decoded user object as base64 JSON.
//    This is the most reliable source and requires no JWT parsing at all.
// 2. clientContext.user — works in netlify dev locally.
// 3. Authorization: Bearer <jwt> — manually decoded as a fallback.

function decodeJWTPayload(token) {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    // Base64url → Base64: replace url-safe chars, then pad to multiple of 4
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = b64 + '==='.slice((b64.length + 3) % 4 + 1)
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'))
  } catch {
    return null
  }
}

export function getUserId(event) {
  // 1. x-nf-identity-info — Netlify sets this automatically, base64-encoded JSON
  const identityInfo = event.headers?.['x-nf-identity-info']
  if (identityInfo) {
    try {
      const info = JSON.parse(Buffer.from(identityInfo, 'base64').toString('utf8'))
      if (info?.user?.sub) return info.user.sub
    } catch {
      // fall through
    }
  }

  // 2. clientContext (netlify dev)
  const ctxUser = event.clientContext?.user
  if (ctxUser?.sub) return ctxUser.sub

  // 3. Authorization header — manually decode JWT payload
  const auth = event.headers?.authorization || event.headers?.Authorization
  if (!auth?.startsWith('Bearer ')) return null

  const payload = decodeJWTPayload(auth.slice(7))
  if (!payload?.sub) return null
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null
  return payload.sub
}

export function requireUser(event) {
  const userId = getUserId(event)
  if (!userId) throw new Error('Unauthorized')
  return userId
}

// ── Response helpers ───────────────────────────────────────
export function json(data, status = 200) {
  return {
    statusCode: status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify(data),
  }
}

export function error(message, status = 400) {
  return json({ error: message }, status)
}

// Handle CORS preflight for all functions
export function handleCors(event) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      },
      body: '',
    }
  }
  return null
}
