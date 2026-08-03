import { useEffect, useId, useRef, useState } from 'react'
import L from 'leaflet'
import { BASE_LAYERS, getBaseLayer } from '../lib/baseLayers'

interface BaseLayerControlProps {
  baseLayerId: string
  onChange: (id: string) => void
}

export function BaseLayerControl({ baseLayerId, onChange }: BaseLayerControlProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const listId = useId()
  const current = getBaseLayer(baseLayerId)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    L.DomEvent.disableClickPropagation(container)
    L.DomEvent.disableScrollPropagation(container)
  }, [])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    return () => window.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  return (
    <div className="base-layer-control" ref={containerRef}>
      <button
        type="button"
        className="base-layer-toggle"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="base-layer-label">Base map</span>
        <span className="base-layer-current">{current.name}</span>
      </button>
      {open && (
        <ul id={listId} className="base-layer-menu" role="listbox" aria-label="Base map">
          {BASE_LAYERS.map((layer) => (
            <li key={layer.id} role="option" aria-selected={layer.id === baseLayerId}>
              <button
                type="button"
                className={layer.id === baseLayerId ? 'active' : undefined}
                onClick={() => {
                  onChange(layer.id)
                  setOpen(false)
                }}
              >
                {layer.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
