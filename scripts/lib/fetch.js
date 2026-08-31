import { CHARACTER_SOURCE, WAR_SOURCE } from './data.js'

const TOKEN_URL = 'https://hydra-public.prod.m3.scopelypv.com/oauth2/token'
const REQUEST_TIMEOUT_MS = 20_000

function requiredEnv(name) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(url, { ...options, signal: controller.signal })
    if (!response.ok) {
      const body = (await response.text()).slice(0, 300)
      throw new Error(`Request failed (${response.status}) for ${new URL(url).pathname}: ${body}`)
    }
    return await response.json()
  } catch (error) {
    if (error.name === 'AbortError') throw new Error(`Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s: ${url}`)
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

export async function fetchWarMeta() {
  return fetchJson(WAR_SOURCE, {
    headers: { Accept: 'application/json', 'User-Agent': 'MSFWarDefense/1.0 (Server)' },
  })
}

async function fetchAccessToken() {
  const credentials = Buffer.from(`${requiredEnv('MSF_CLIENT_ID')}:${requiredEnv('MSF_CLIENT_SECRET')}`).toString('base64')
  const payload = await fetchJson(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({ grant_type: 'client_credentials' }).toString(),
  })
  if (!payload.access_token) throw new Error('OAuth token response did not include an access token')
  return payload.access_token
}

export async function fetchAllCharacters() {
  const token = await fetchAccessToken()
  const headers = {
    Authorization: `Bearer ${token}`,
    'x-api-key': requiredEnv('MSF_API_KEY'),
    'User-Agent': 'MSFWarDefense/1.0 (Server)',
    Accept: 'application/json',
  }
  const characters = []
  let page = 1
  const perPage = 20

  while (true) {
    const url = new URL(CHARACTER_SOURCE)
    url.search = new URLSearchParams({
      lang: 'en',
      statsFormat: 'none',
      itemFormat: 'none',
      traitFormat: 'object',
      charInfo: 'full',
      abilityKits: 'none',
      page: String(page),
      perPage: String(perPage),
    }).toString()
    const payload = await fetchJson(url, { headers })
    const batch = Array.isArray(payload.data) ? payload.data : payload
    if (!Array.isArray(batch)) throw new Error(`Character page ${page} did not contain an array`)
    if (!batch.length) break
    characters.push(...batch)
    if (payload.meta?.perTotal && characters.length >= payload.meta.perTotal) break
    if (batch.length < perPage) break
    page += 1
  }

  return { data: characters }
}
