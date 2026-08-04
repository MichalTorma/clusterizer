import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import {
  CircleMarker,
  MapContainer,
  Polygon,
  Polyline,
  Rectangle,
  TileLayer,
  ZoomControl,
  useMap,
  useMapEvents,
} from 'react-leaflet'
import type { LatLngBoundsExpression } from 'leaflet'
import type { Position } from '../lib/analysis'
import { DEFAULT_BASE_LAYER_ID, getBaseLayer } from '../lib/baseLayers'
import {
  rectangleFromCorners,
  rectangleIsValid,
  toLatLngs,
  type DrawTool,
} from '../lib/drawing'
import type { MapLayer } from '../lib/earthEngine'
import type { MapFocusRequest } from '../lib/mapFocus'
import type { MapView } from '../lib/urlState'
import { BaseLayerControl } from './BaseLayerControl'

export interface AnalysisMapHandle {
  finishPolygonDraft: () => boolean
  undoPolygonVertex: () => void
  cancelPolygonDraft: () => void
}

interface AnalysisMapProps {
  coordinates: Position[]
  layers: MapLayer[]
  activeLayerNames: string[]
  view: MapView
  fitPolygon: boolean
  tool: DrawTool
  focusRequest?: MapFocusRequest
  highlightUrl?: string
  selectedPoint?: Position
  onToolChange: (tool: DrawTool) => void
  onShapeComplete: (coordinates: Position[]) => void
  onInspectPoint: (position: Position) => void
  onViewChange: (view: MapView) => void
  onPolygonDraftChange?: (vertexCount: number) => void
}

const CLOSE_TOLERANCE_PX = 14
const DRAFT_STYLE = { color: '#e9a255', weight: 2, fillColor: '#e9a255', fillOpacity: 0.15 }
const COMMITTED_STYLE = { color: '#e9a255', weight: 2, fillOpacity: 0.08 }

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
    map.fitBounds(toLatLngs(coordinates), { padding: [40, 40], maxZoom: 16 })
  }, [coordinates, enabled, map])

  return null
}

function FocusController({ request }: { request?: MapFocusRequest }) {
  const map = useMap()
  const appliedId = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (!request || request.id === appliedId.current) return
    appliedId.current = request.id
    if (request.bounds) {
      map.fitBounds(request.bounds, { padding: [40, 40], maxZoom: 16 })
      return
    }
    if (request.center) {
      map.flyTo(request.center, request.zoom ?? 14, { duration: 0.8 })
    }
  }, [map, request])

  return null
}

function InspectClicks({
  enabled,
  onInspectPoint,
}: {
  enabled: boolean
  onInspectPoint: (position: Position) => void
}) {
  useMapEvents({
    click(event) {
      if (!enabled) return
      onInspectPoint([event.latlng.lng, event.latlng.lat])
    },
  })
  return null
}

function PolygonDrawControl({
  active,
  draft,
  setDraft,
  setCursor,
  onComplete,
}: {
  active: boolean
  draft: Position[]
  setDraft: (value: Position[] | ((current: Position[]) => Position[])) => void
  cursor: Position | undefined
  setCursor: (value: Position | undefined) => void
  onComplete: (coordinates: Position[]) => void
}) {
  const map = useMap()
  const draftRef = useRef(draft)
  draftRef.current = draft

  useEffect(() => {
    if (active) map.doubleClickZoom.disable()
    else map.doubleClickZoom.enable()
    return () => {
      map.doubleClickZoom.enable()
    }
  }, [active, map])

  useEffect(() => {
    if (!active) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDraft([])
        setCursor(undefined)
      }
      if (event.key === 'Enter' && draftRef.current.length >= 3) {
        onComplete(draftRef.current)
        setDraft([])
        setCursor(undefined)
      }
      if ((event.key === 'Backspace' || event.key === 'Delete') && draftRef.current.length > 0) {
        event.preventDefault()
        setDraft(draftRef.current.slice(0, -1))
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [active, onComplete, setCursor, setDraft])

  useMapEvents({
    click(event) {
      if (!active) return
      const next: Position = [event.latlng.lng, event.latlng.lat]
      const current = draftRef.current

      if (current.length >= 3) {
        const first = current[0]
        const start = map.latLngToContainerPoint([first[1], first[0]])
        const clicked = map.latLngToContainerPoint(event.latlng)
        if (start.distanceTo(clicked) <= CLOSE_TOLERANCE_PX) {
          onComplete(current)
          setDraft([])
          setCursor(undefined)
          return
        }
      }

      setDraft([...current, next])
    },
    dblclick(event) {
      if (!active) return
      event.originalEvent.preventDefault()
      const current = draftRef.current
      const finished = current.length >= 2 ? current.slice(0, -1) : current
      if (finished.length >= 3) {
        onComplete(finished)
        setDraft([])
        setCursor(undefined)
      }
    },
    mousemove(event) {
      if (!active || draftRef.current.length === 0) {
        setCursor(undefined)
        return
      }
      setCursor([event.latlng.lng, event.latlng.lat])
    },
  })

  return null
}

function RectangleDrawControl({
  active,
  onComplete,
  setPreview,
}: {
  active: boolean
  onComplete: (coordinates: Position[]) => void
  preview: [Position, Position] | undefined
  setPreview: (value: [Position, Position] | undefined) => void
}) {
  const map = useMap()
  const startRef = useRef<Position | undefined>(undefined)
  const draggingRef = useRef(false)

  useEffect(() => {
    if (!active) {
      draggingRef.current = false
      startRef.current = undefined
      setPreview(undefined)
      map.dragging.enable()
    }
  }, [active, map, setPreview])

  useEffect(() => {
    if (!active) return

    const finish = (event: MouseEvent) => {
      if (!draggingRef.current || !startRef.current) return
      draggingRef.current = false
      map.dragging.enable()
      const latlng = map.mouseEventToLatLng(event)
      const end: Position = [latlng.lng, latlng.lat]
      const start = startRef.current
      startRef.current = undefined
      setPreview(undefined)
      if (!rectangleIsValid(start, end)) return
      onComplete(rectangleFromCorners(start, end))
    }

    const onWindowMouseUp = (event: MouseEvent) => finish(event)
    window.addEventListener('mouseup', onWindowMouseUp)
    return () => window.removeEventListener('mouseup', onWindowMouseUp)
  }, [active, map, onComplete, setPreview])

  useMapEvents({
    mousedown(event) {
      if (!active || event.originalEvent.button !== 0) return
      event.originalEvent.preventDefault()
      draggingRef.current = true
      map.dragging.disable()
      const start: Position = [event.latlng.lng, event.latlng.lat]
      startRef.current = start
      setPreview([start, start])
    },
    mousemove(event) {
      if (!active || !draggingRef.current || !startRef.current) return
      setPreview([startRef.current, [event.latlng.lng, event.latlng.lat]])
    },
  })

  return null
}

export const AnalysisMap = forwardRef<AnalysisMapHandle, AnalysisMapProps>(function AnalysisMap(
  {
    coordinates,
    layers,
    activeLayerNames,
    view,
    fitPolygon,
    tool,
    focusRequest,
    highlightUrl,
    selectedPoint,
    onToolChange,
    onShapeComplete,
    onInspectPoint,
    onViewChange,
    onPolygonDraftChange,
  },
  ref,
) {
  const initialView = useRef(view)
  const [baseLayerId, setBaseLayerId] = useState(DEFAULT_BASE_LAYER_ID)
  const [polygonDraft, setPolygonDraft] = useState<Position[]>([])
  const [cursor, setCursor] = useState<Position>()
  const [rectanglePreview, setRectanglePreview] = useState<[Position, Position]>()
  const baseLayer = getBaseLayer(baseLayerId)

  useEffect(() => {
    setPolygonDraft([])
    setCursor(undefined)
    setRectanglePreview(undefined)
  }, [tool])

  useEffect(() => {
    onPolygonDraftChange?.(polygonDraft.length)
  }, [polygonDraft.length, onPolygonDraftChange])

  const completeShape = (next: Position[]) => {
    onShapeComplete(next)
    setPolygonDraft([])
    setCursor(undefined)
    setRectanglePreview(undefined)
    onToolChange('inspect')
  }

  useImperativeHandle(ref, () => ({
    finishPolygonDraft: () => {
      if (polygonDraft.length < 3) return false
      completeShape(polygonDraft)
      return true
    },
    undoPolygonVertex: () => setPolygonDraft((current) => current.slice(0, -1)),
    cancelPolygonDraft: () => {
      setPolygonDraft([])
      setCursor(undefined)
    },
  }))

  const committed = useMemo(() => toLatLngs(coordinates), [coordinates])
  const draftLatLngs = useMemo(() => toLatLngs(polygonDraft), [polygonDraft])
  const previewLine = useMemo(() => {
    if (!cursor || polygonDraft.length === 0) return undefined
    const last = polygonDraft[polygonDraft.length - 1]
    return toLatLngs([last, cursor])
  }, [cursor, polygonDraft])
  const closeLine = useMemo(() => {
    if (!cursor || polygonDraft.length < 2) return undefined
    return toLatLngs([cursor, polygonDraft[0]])
  }, [cursor, polygonDraft])
  const rectangleBounds = useMemo<LatLngBoundsExpression | undefined>(() => {
    if (!rectanglePreview) return undefined
    const [a, b] = rectanglePreview
    return [
      [a[1], a[0]],
      [b[1], b[0]],
    ]
  }, [rectanglePreview])

  const selectedLatLng = selectedPoint
    ? ([selectedPoint[1], selectedPoint[0]] as [number, number])
    : undefined

  return (
    <MapContainer
      center={initialView.current.center}
      zoom={initialView.current.zoom}
      className={`map map-tool-${tool}`}
      scrollWheelZoom
      zoomControl={false}
    >
      <TileLayer
        key={baseLayer.id}
        attribution={baseLayer.attribution}
        url={baseLayer.url}
        maxZoom={baseLayer.maxZoom}
        maxNativeZoom={baseLayer.maxNativeZoom}
        {...(baseLayer.subdomains ? { subdomains: baseLayer.subdomains } : {})}
      />

      {committed.length >= 3 && tool !== 'rectangle' && !(tool === 'polygon' && polygonDraft.length > 0) && (
        <Polygon positions={committed} pathOptions={COMMITTED_STYLE} />
      )}
      {committed.length >= 3 && (tool === 'rectangle' || (tool === 'polygon' && polygonDraft.length > 0)) && (
        <Polygon positions={committed} pathOptions={{ ...COMMITTED_STYLE, dashArray: '4 6', opacity: 0.45 }} />
      )}

      {draftLatLngs.length >= 2 && <Polyline positions={draftLatLngs} pathOptions={DRAFT_STYLE} />}
      {draftLatLngs.length >= 3 && <Polygon positions={draftLatLngs} pathOptions={DRAFT_STYLE} />}
      {previewLine && <Polyline positions={previewLine} pathOptions={{ ...DRAFT_STYLE, dashArray: '5 6' }} />}
      {closeLine && <Polyline positions={closeLine} pathOptions={{ color: '#1f6a52', weight: 1.5, dashArray: '3 5', opacity: 0.7 }} />}
      {polygonDraft.map((point, index) => (
        <CircleMarker
          key={`${point[0]}-${point[1]}-${index}`}
          center={[point[1], point[0]]}
          radius={index === 0 ? 6 : 4}
          pathOptions={{
            color: '#193b33',
            weight: 2,
            fillColor: index === 0 ? '#1f6a52' : '#e9a255',
            fillOpacity: 1,
          }}
        />
      ))}

      {rectangleBounds && <Rectangle bounds={rectangleBounds} pathOptions={DRAFT_STYLE} />}

      {layers
        .filter((layer) => activeLayerNames.includes(layer.name))
        .map((layer) => (
          <TileLayer key={layer.name} url={layer.url} opacity={layer.opacity ?? 1} />
        ))}
      {highlightUrl && <TileLayer key={highlightUrl} url={highlightUrl} opacity={0.9} />}
      {selectedLatLng && (
        <CircleMarker
          center={selectedLatLng}
          radius={7}
          pathOptions={{ color: '#193b33', weight: 2, fillColor: '#ff4d2e', fillOpacity: 1 }}
        />
      )}

      <InspectClicks enabled={tool === 'inspect' && layers.length > 0} onInspectPoint={onInspectPoint} />
      <PolygonDrawControl
        active={tool === 'polygon'}
        draft={polygonDraft}
        setDraft={setPolygonDraft}
        cursor={cursor}
        setCursor={setCursor}
        onComplete={completeShape}
      />
      <RectangleDrawControl
        active={tool === 'rectangle'}
        onComplete={completeShape}
        preview={rectanglePreview}
        setPreview={setRectanglePreview}
      />
      <ViewSync onViewChange={onViewChange} />
      <FitPolygonOnce coordinates={coordinates} enabled={fitPolygon} />
      <FocusController request={focusRequest} />
      <ZoomControl position="bottomright" />
      <BaseLayerControl baseLayerId={baseLayerId} onChange={setBaseLayerId} />
    </MapContainer>
  )
})
