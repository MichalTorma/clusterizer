export interface PhotonFeature {
  type: 'Feature'
  geometry: {
    type: 'Point'
    coordinates: [number, number]
  }
  properties: {
    name?: string
    city?: string
    county?: string
    state?: string
    country?: string
    osm_key?: string
    osm_value?: string
    type?: string
    /** [west, north, east, south] */
    extent?: [number, number, number, number]
  }
}

interface PhotonResponse {
  features: PhotonFeature[]
}

export function formatPhotonLabel(feature: PhotonFeature): string {
  const { name, city, county, state, country } = feature.properties
  const parts = [name, city !== name ? city : undefined, county, state, country].filter(Boolean)
  return parts.join(', ')
}

export async function searchPhoton(
  query: string,
  options: { limit?: number; lat?: number; lon?: number; signal?: AbortSignal } = {},
): Promise<PhotonFeature[]> {
  const trimmed = query.trim()
  if (!trimmed) return []

  const params = new URLSearchParams({
    q: trimmed,
    limit: String(options.limit ?? 5),
  })
  if (options.lat != null && options.lon != null) {
    params.set('lat', String(options.lat))
    params.set('lon', String(options.lon))
  }

  const response = await fetch(`https://photon.komoot.io/api/?${params}`, {
    signal: options.signal,
  })
  if (!response.ok) {
    throw new Error(`Location search failed (${response.status}).`)
  }

  const data = (await response.json()) as PhotonResponse
  return data.features ?? []
}
