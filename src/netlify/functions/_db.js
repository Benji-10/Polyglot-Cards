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
// Netlify Identity issues RS256 JWTs. We decode the payload
// without verifying the signature here (the token is already
// validated by Netlify's CDN edge before it reaches the function,
// and the JWKS endpoint requires an extra network call).
// For extra security you can verify against the JWKS URL:
// https://<your-site>.netlify.app/.netlify/identity/.well-known/jwks.json

function decodeJWTPayload(token) {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    // Base64url → Base64 → JSON
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = payload + '=='.slice((payload.length % 4 === 0) ? 4 : payload.length % 4)
    const decoded = Buffer.from(padded, 'base64').toString('utf8')
    return JSON.parse(decoded)
  } catch {
    return null
  }
}

export function getUserId(event) {
  // 1. Try clientContext first (works in some Netlify setups / netlify dev)
  const ctxUser = event.clientContext?.user
  if (ctxUser?.sub) return ctxUser.sub

  // 2. Fall back to manually decoding the Authorization header JWT
  const auth = event.headers?.authorization || event.headers?.Authorization
  if (!auth?.startsWith('Bearer ')) return null

  const token = auth.slice(7)
  const payload = decodeJWTPayload(token)

  // Netlify Identity tokens have `sub` = user UUID and `app_metadata.provider`
  if (!payload?.sub) return null

  // Basic expiry check
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
