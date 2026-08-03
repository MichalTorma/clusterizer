import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import { formatPhotonLabel, searchPhoton, type PhotonFeature } from '../lib/photon'

const DEBOUNCE_MS = 280

export function LocationSearch() {
  const map = useMap()
  const listId = useId()
  const containerRef = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PhotonFeature[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()
  const [activeIndex, setActiveIndex] = useState(-1)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    L.DomEvent.disableClickPropagation(container)
    L.DomEvent.disableScrollPropagation(container)
  }, [])

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < 2) {
      setResults([])
      setLoading(false)
      setError(undefined)
      return
    }

    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setLoading(true)
      setError(undefined)
      try {
        const center = map.getCenter()
        const features = await searchPhoton(trimmed, {
          limit: 6,
          lat: center.lat,
          lon: center.lng,
          signal: controller.signal,
        })
        setResults(features)
        setActiveIndex(-1)
        setOpen(true)
      } catch (cause) {
        if (controller.signal.aborted) return
        setResults([])
        setError(cause instanceof Error ? cause.message : 'Location search failed.')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, DEBOUNCE_MS)

    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [query, map])

  const zoomToFeature = (feature: PhotonFeature) => {
    const [lon, lat] = feature.geometry.coordinates
    const extent = feature.properties.extent
    if (extent) {
      const [west, north, east, south] = extent
      map.fitBounds(
        [
          [south, west],
          [north, east],
        ],
        { padding: [40, 40], maxZoom: 16 },
      )
    } else {
      map.flyTo([lat, lon], 14, { duration: 0.8 })
    }
    setQuery(formatPhotonLabel(feature))
    setResults([])
    setOpen(false)
    setActiveIndex(-1)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!open || results.length === 0) {
      if (event.key === 'Escape') setOpen(false)
      return
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((current) => (current + 1) % results.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((current) => (current <= 0 ? results.length - 1 : current - 1))
    } else if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault()
      zoomToFeature(results[activeIndex])
    } else if (event.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className="location-search" ref={containerRef}>
      <label className="location-search-label" htmlFor="location-search-input">
        Zoom to location
      </label>
      <input
        id="location-search-input"
        type="search"
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
        placeholder="Search a place…"
        value={query}
        autoComplete="off"
        onChange={(event) => {
          setQuery(event.target.value)
          setOpen(true)
        }}
        onFocus={() => {
          if (results.length) setOpen(true)
        }}
        onKeyDown={onKeyDown}
        onBlur={() => {
          // Delay so a mousedown on a result can fire first.
          window.setTimeout(() => setOpen(false), 120)
        }}
      />
      {loading && <p className="location-search-status">Searching…</p>}
      {error && <p className="location-search-status error">{error}</p>}
      {open && results.length > 0 && (
        <ul id={listId} className="location-search-results" role="listbox">
          {results.map((feature, index) => (
            <li key={`${feature.geometry.coordinates.join(',')}-${index}`} role="option" aria-selected={index === activeIndex}>
              <button
                type="button"
                id={`${listId}-${index}`}
                className={index === activeIndex ? 'active' : undefined}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => zoomToFeature(feature)}
              >
                <span className="location-name">{feature.properties.name ?? 'Unnamed place'}</span>
                <span className="location-meta">{formatPhotonLabel(feature)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
