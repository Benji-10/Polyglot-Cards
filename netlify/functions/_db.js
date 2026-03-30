// netlify/functions/_db.js
// Shared Neon/Postgres client

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
    const result = await client.query(sql, params)
    return result
  } finally {
    client.release()
  }
}

// Extract user ID from Netlify Identity JWT
export function getUserId(event) {
  const context = event.clientContext
  if (!context?.user) return null
  return context.user.sub
}

export function requireUser(event) {
  const userId = getUserId(event)
  if (!userId) throw new Error('Unauthorized')
  return userId
}

export function json(data, status = 200) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }
}

export function error(message, status = 400) {
  return json({ error: message }, status)
}
