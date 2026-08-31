import { useEffect, useState } from 'react'

export function useWarData() {
  const [state, setState] = useState({ data: null, error: null, loading: true })

  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}data/war-defense.json`, {
          signal: controller.signal,
        })
        if (!response.ok) throw new Error(`Data request failed (${response.status})`)
        const data = await response.json()
        if (!Array.isArray(data.teams) || !data.meta) throw new Error('Data snapshot has an unsupported shape')
        setState({ data, error: null, loading: false })
      } catch (error) {
        if (error.name !== 'AbortError') setState({ data: null, error, loading: false })
      }
    }
    load()
    return () => controller.abort()
  }, [])

  return state
}
