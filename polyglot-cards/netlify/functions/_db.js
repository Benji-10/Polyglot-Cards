import pg from 'pg'
const { Pool } = pg

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
    return await client.query(sql, params)
  } finally {
    client.release()
  }
}

function decodeJWTPayload(token) {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = b64 + '==='.slice((b64.length + 3) % 4 + 1)
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'))
  } catch { return null }
}

export function getUserId(event) {
  const identityInfo = event.headers?.['x-nf-identity-info']
  if (identityInfo) {
    try {
      const info = JSON.parse(Buffer.from(identityInfo, 'base64').toString('utf8'))
      if (info?.user?.sub) return info.user.sub
    } catch {}
  }
  const ctxUser = event.clientContext?.user
  if (ctxUser?.sub) return ctxUser.sub
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

export function json(data, status = 200) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(data),
  }
}

export function error(message, status = 400) {
  return json({ error: message }, status)
}

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
