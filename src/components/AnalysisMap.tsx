import { useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, Polygon, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import type { Position } from '../lib/analysis'
import { DEFAULT_BASE_LAYER_ID, getBaseLayer } from '../lib/baseLayers'
import type { MapLayer } from '../lib/earthEngine'
import type { MapView } from '../lib/urlState'
import { BaseLayerControl } from './BaseLayerControl'
import { LocationSearch } from './LocationSearch'

interface AnalysisMapProps {
  coordinates: Position[]
  layers: MapLayer[]
  activeLayerNames: string[]
  view: MapView
  fitPolygon: boolean
  onAddPoint: (position: Position) => void
  onViewChange: (view: MapView) => void
}

function DrawingControl({ onAddPoint }: Pick<AnalysisMapProps, 'onAddPoint'>) {
  useMapEvents({
    click(event) {
      onAddPoint([event.latlng.lng, event.latlng.lat])
    },
  })
  return null
}

function ViewSync({ onViewChange }: Pick<AnalysisMapProps, 'onViewChange'>) {
  useMapEvents({
    moveend(event) {
      const map = event.target
      const center = map.getCenter()
      onViewChange({
        center: [center.lat, center.lng],
        zoom: map.getZoom(),
      })
    },
  })
  return null
}

function FitPolygonOnce({
  coordinates,
  enabled,
}: {
  coordinates: Position[]
  enabled: boolean
}) {
  const map = useMap()
  const fitted = useRef(false)

  useEffect(() => {
    if (!enabled || fitted.current || coordinates.length < 2) return
    fitted.current = true
    const bounds = coordinates.map(
      ([longitude, latitude]) => [latitude, longitude] as [number, number],
    )
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 })
  }, [coordinates, enabled, map])

  return null
}

export function AnalysisMap({
  coordinates,
  layers,
  activeLayerNames,
  view,
  fitPolygon,
  onAddPoint,
  onViewChange,
}: AnalysisMapProps) {
  const initialView = useRef(view)
  const [baseLayerId, setBaseLayerId] = useState(DEFAULT_BASE_LAYER_ID)
  const baseLayer = getBaseLayer(baseLayerId)
  const polygon = useMemo(
    () => coordinates.map(([longitude, latitude]) => [latitude, longitude] as [number, number]),
    [coordinates],
  )

  return (
    <MapContainer
      center={initialView.current.center}
      zoom={initialView.current.zoom}
      className="map"
      scrollWheelZoom
    >
      <TileLayer
        key={baseLayer.id}
        attribution={baseLayer.attribution}
        url={baseLayer.url}
        maxZoom={baseLayer.maxZoom}
        maxNativeZoom={baseLayer.maxNativeZoom}
        {...(baseLayer.subdomains ? { subdomains: baseLayer.subdomains } : {})}
      />
      {polygon.length >= 3 && <Polygon positions={polygon} pathOptions={{ color: '#e9a255', weight: 2 }} />}
      {layers
        .filter((layer) => activeLayerNames.includes(layer.name))
        .map((layer) => (
          <TileLayer key={layer.name} url={layer.url} opacity={layer.opacity ?? 1} />
        ))}
      <DrawingControl onAddPoint={onAddPoint} />
      <ViewSync onViewChange={onViewChange} />
      <FitPolygonOnce coordinates={coordinates} enabled={fitPolygon} />
      <LocationSearch />
      <BaseLayerControl baseLayerId={baseLayerId} onChange={setBaseLayerId} />
    </MapContainer>
  )
}
