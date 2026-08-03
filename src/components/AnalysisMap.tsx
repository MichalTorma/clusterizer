import { useMemo } from 'react'
import { MapContainer, Polygon, TileLayer, useMapEvents } from 'react-leaflet'
import type { Position } from '../lib/analysis'
import type { MapLayer } from '../lib/earthEngine'

interface AnalysisMapProps {
  coordinates: Position[]
  layers: MapLayer[]
  activeLayerNames: string[]
  onAddPoint: (position: Position) => void
}

function DrawingControl({ onAddPoint }: Pick<AnalysisMapProps, 'onAddPoint'>) {
  useMapEvents({
    click(event) {
      onAddPoint([event.latlng.lng, event.latlng.lat])
    },
  })
  return null
}

export function AnalysisMap({
  coordinates,
  layers,
  activeLayerNames,
  onAddPoint,
}: AnalysisMapProps) {
  const polygon = useMemo(
    () => coordinates.map(([longitude, latitude]) => [latitude, longitude] as [number, number]),
    [coordinates],
  )

  return (
    <MapContainer center={[20, 0]} zoom={2} className="map" scrollWheelZoom>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {polygon.length >= 3 && <Polygon positions={polygon} pathOptions={{ color: '#e9a255', weight: 2 }} />}
      {layers
        .filter((layer) => activeLayerNames.includes(layer.name))
        .map((layer) => (
          <TileLayer key={layer.name} url={layer.url} opacity={layer.opacity ?? 1} />
        ))}
      <DrawingControl onAddPoint={onAddPoint} />
    </MapContainer>
  )
}
