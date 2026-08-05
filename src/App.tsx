import { useEffect, useMemo, useRef, useState } from 'react'
import { AnalysisMap, type AnalysisMapHandle } from './components/AnalysisMap'
import { AreaUpload } from './components/AreaUpload'
import { LocationSearch } from './components/LocationSearch'
import { SetupGate } from './components/SetupGate'
import {
  approximatePolygonAreaM2,
  contrastTextForHex,
  polygonIsValid,
  trainingEstimateLabel,
  type AnalysisParameters,
  type Position,
} from './lib/analysis'
import { runAnalysis, SessionExpiredError, type AnalysisResult } from './lib/earthEngine'
import {
  getEarthEngineConfigurationError,
  readStoredProjectId,
  writeStoredProjectId,
} from './lib/config'
import type { DrawTool } from './lib/drawing'
import type { MapFocusRequest } from './lib/mapFocus'
import { readUrlState, writeUrlState, type MapView } from './lib/urlState'
import './App.css'

const AREA_TOOLS: Array<{ id: DrawTool; label: string; detail: string }> = [
  { id: 'polygon', label: 'Polygon', detail: 'Click vertices on the map' },
  { id: 'rectangle', label: 'Rectangle', detail: 'Click and drag on the map' },
  { id: 'inspect', label: 'Inspect', detail: 'Pan or sample analysed types' },
]

function App() {
  const initialUrl = useMemo(() => readUrlState(), [])
  const mapRef = useRef<AnalysisMapHandle>(null)
  const focusId = useRef(0)
  const [panelOpen, setPanelOpen] = useState(true)
  const [coordinates, setCoordinates] = useState<Position[]>(initialUrl.coordinates)
  const [mapView, setMapView] = useState<MapView>(initialUrl.view)
  const [fitPolygon] = useState(initialUrl.fitPolygon)
  const [tool, setTool] = useState<DrawTool>(initialUrl.coordinates.length >= 3 ? 'inspect' : 'polygon')
  const [focusRequest, setFocusRequest] = useState<MapFocusRequest>()
  const [draftVertexCount, setDraftVertexCount] = useState(0)
  const [year, setYear] = useState(2024)
  const [minClusters, setMinClusters] = useState(3)
  const [maxClusters, setMaxClusters] = useState(16)
  const [rareAreaM2, setRareAreaM2] = useState(1_000)
  const [projectId, setProjectId] = useState(() => readStoredProjectId())
  const [setupComplete, setSetupComplete] = useState(false)
  const [autoResumeSetup, setAutoResumeSetup] = useState(true)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string>()
  const [result, setResult] = useState<AnalysisResult>()
  const [activeLayerNames, setActiveLayerNames] = useState<string[]>(['Nature types'])
  const [selectedClusterId, setSelectedClusterId] = useState<number>()
  const [selectedPoint, setSelectedPoint] = useState<Position>()
  const [highlightUrl, setHighlightUrl] = useState<string>()
  const [inspecting, setInspecting] = useState(false)
  const configurationError = getEarthEngineConfigurationError()
  const areaM2 = useMemo(() => approximatePolygonAreaM2(coordinates), [coordinates])
  const selectedSummary = result?.summaries.find((summary) => summary.id === selectedClusterId)

  useEffect(() => {
    if (!setupComplete) return
    writeUrlState({ view: mapView, coordinates })
  }, [mapView, coordinates, setupComplete])

  const clearSelection = () => {
    setSelectedClusterId(undefined)
    setSelectedPoint(undefined)
    setHighlightUrl(undefined)
  }

  const handleSessionExpired = () => {
    setAutoResumeSetup(true)
    setSetupComplete(false)
    setResult(undefined)
    clearSelection()
    setError(undefined)
    setPanelOpen(true)
  }

  const selectCluster = async (clusterId: number, point?: Position) => {
    if (!result) return
    setTool('inspect')
    setInspecting(true)
    setError(undefined)
    try {
      const url = await result.getClusterHighlightUrl(clusterId)
      setSelectedClusterId(clusterId)
      setSelectedPoint(point)
      setHighlightUrl(url)
      if (!activeLayerNames.includes('Nature types')) {
        setActiveLayerNames((current) => [...current, 'Nature types'])
      }
    } catch (cause) {
      console.error('Cluster highlight failed:', cause)
      if (cause instanceof SessionExpiredError) {
        handleSessionExpired()
        return
      }
      setError(cause instanceof Error ? cause.message : 'Unable to highlight that nature type.')
    } finally {
      setInspecting(false)
    }
  }

  const commitShape = (next: Position[]) => {
    setCoordinates(next)
    setResult(undefined)
    clearSelection()
    setError(undefined)
  }

  const inspectPoint = async (position: Position) => {
    if (!result || tool !== 'inspect') return
    setInspecting(true)
    setError(undefined)
    try {
      const clusterId = await result.sampleClusterAt(position[0], position[1])
      if (clusterId == null) {
        clearSelection()
        setError('No analysed pixel at that location. Click inside the analysis polygon.')
        return
      }
      const url = await result.getClusterHighlightUrl(clusterId)
      setSelectedClusterId(clusterId)
      setSelectedPoint(position)
      setHighlightUrl(url)
      if (!activeLayerNames.includes('Nature types')) {
        setActiveLayerNames((current) => [...current, 'Nature types'])
      }
    } catch (cause) {
      console.error('Cluster sample failed:', cause)
      if (cause instanceof SessionExpiredError) {
        handleSessionExpired()
        return
      }
      setError(cause instanceof Error ? cause.message : 'Unable to sample that map location.')
    } finally {
      setInspecting(false)
    }
  }

  const completeSetup = (nextProjectId: string) => {
    const trimmed = nextProjectId.trim()
    writeStoredProjectId(trimmed)
    setProjectId(trimmed)
    setSetupComplete(true)
    setAutoResumeSetup(true)
    setError(undefined)
    setPanelOpen(true)
  }

  const changeProject = () => {
    setAutoResumeSetup(false)
    setSetupComplete(false)
    setResult(undefined)
    clearSelection()
    setError(undefined)
  }

  const analyze = async () => {
    if (!setupComplete) {
      setError('Finish Earth Engine setup before running an analysis.')
      return
    }
    if (!polygonIsValid(coordinates)) {
      setError('Draw a polygon or rectangle with at least three vertices before running the analysis.')
      setPanelOpen(true)
      return
    }
    if (maxClusters <= minClusters) {
      setError('The maximum cluster count must be greater than the minimum.')
      setPanelOpen(true)
      return
    }

    const parameters: AnalysisParameters = {
      coordinates, year, minClusters, maxClusters, rareAreaM2,
    }
    setRunning(true)
    setError(undefined)
    clearSelection()
    try {
      const nextResult = await runAnalysis(parameters)
      setResult(nextResult)
      setActiveLayerNames(['Nature types'])
      setTool('inspect')
      setPanelOpen(true)
    } catch (cause) {
      console.error('Earth Engine analysis failed:', cause)
      if (cause instanceof SessionExpiredError) {
        handleSessionExpired()
        return
      }
      setError(cause instanceof Error ? cause.message : 'The analysis could not be completed.')
      setPanelOpen(true)
    } finally {
      setRunning(false)
    }
  }

  const toggleLayer = (name: string) => {
    setActiveLayerNames((current) =>
      current.includes(name) ? current.filter((item) => item !== name) : [...current, name],
    )
  }

  const toolHint =
    tool === 'polygon'
      ? draftVertexCount === 0
        ? 'Click the map to place vertices. Finish by double-click, clicking the first point, or Finish below.'
        : `${draftVertexCount} points placed — double-click or press Finish to close the polygon.`
      : tool === 'rectangle'
        ? 'Click and drag on the map to draw the analysis rectangle.'
        : result
          ? inspecting
            ? 'Sampling the selected pixel…'
            : 'Click an analysed pixel to highlight every pixel of the same nature type.'
          : 'Pan the map freely. Choose Polygon or Rectangle when you are ready to draw.'

  if (!setupComplete) {
    return (
      <main className="app-shell setup-pending">
        <SetupGate
          configurationError={configurationError}
          initialProjectId={projectId}
          autoResume={autoResumeSetup}
          onComplete={completeSetup}
        />
      </main>
    )
  }

  return (
    <main className={`app-shell${panelOpen ? ' panel-open' : ''}`}>
      <div className="map-stage">
        <section className="map-panel">
          <AnalysisMap
            ref={mapRef}
            coordinates={coordinates}
            layers={result?.layers ?? []}
            activeLayerNames={activeLayerNames}
            view={mapView}
            fitPolygon={fitPolygon}
            tool={tool}
            focusRequest={focusRequest}
            highlightUrl={highlightUrl}
            selectedPoint={selectedPoint}
            onToolChange={setTool}
            onShapeComplete={commitShape}
            onInspectPoint={(position) => void inspectPoint(position)}
            onViewChange={setMapView}
            onPolygonDraftChange={setDraftVertexCount}
          />
          {result && (
            <div className="layer-switcher">
              {result.layers.map((layer) => (
                <label key={layer.name}>
                  <input type="checkbox" checked={activeLayerNames.includes(layer.name)} onChange={() => toggleLayer(layer.name)} />
                  {layer.name}
                </label>
              ))}
            </div>
          )}
        </section>
      </div>

      <aside className={`control-bubble${panelOpen ? '' : ' collapsed'}`} aria-label="Clusterizer controls">
        {panelOpen ? (
          <>
            <div className="bubble-header">
              <div className="bubble-brand">
                <p className="eyebrow">AlphaEarth · 10 m embeddings</p>
                <h1>Clusterizer</h1>
                <p className="subtitle">Recurring nature types and exceptional pixels in one landscape.</p>
              </div>
              <div className="bubble-header-actions">
                <button type="button" className="bubble-collapse" onClick={() => setPanelOpen(false)}>
                  Collapse
                </button>
              </div>
            </div>

            <div className="bubble-body controls">
              <div className="ee-status">
                <p className="hint">
                  Connected · <code>{projectId.trim()}</code>
                </p>
                <button type="button" className="subtle-button" onClick={changeProject}>
                  Change project
                </button>
              </div>

              {error && (
                <div className="bubble-notices">
                  <p className="notice error">{error}</p>
                </div>
              )}

              <div className="section-heading"><span>00</span><h2>Zoom to location</h2></div>
              <p className="hint">Search for a place, then draw the analysis area around it.</p>
              <LocationSearch
                bias={{ lat: mapView.center[0], lon: mapView.center[1] }}
                onSelect={(focus) => {
                  focusId.current += 1
                  setFocusRequest({ ...focus, id: focusId.current })
                }}
              />

              <div className="section-heading"><span>01</span><h2>Analysis area</h2></div>
              <p className="hint">Draw on the map, or upload a polygon file.</p>
              <div className="tool-switcher" role="radiogroup" aria-label="Analysis area tool">
                {AREA_TOOLS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="radio"
                    aria-checked={tool === item.id}
                    className={tool === item.id ? 'active' : undefined}
                    onClick={() => setTool(item.id)}
                  >
                    <strong>{item.label}</strong>
                    <span>{item.detail}</span>
                  </button>
                ))}
              </div>
              <AreaUpload
                onImported={(polygon) => {
                  commitShape(polygon.coordinates)
                  setTool('inspect')
                  focusId.current += 1
                  setFocusRequest({ id: focusId.current, bounds: polygon.bounds })
                  setError(undefined)
                }}
                onError={setError}
              />
              <p className="hint tool-hint">{toolHint}</p>
              <div className="metrics">
                <span>{coordinates.length} vertices</span>
                <span>{(areaM2 / 1e6).toFixed(2)} km²</span>
                <span>{trainingEstimateLabel(coordinates)}</span>
              </div>
              <div className="button-row">
                {tool === 'polygon' && (
                  <>
                    <button
                      className="subtle-button"
                      onClick={() => mapRef.current?.undoPolygonVertex()}
                      disabled={draftVertexCount === 0}
                    >
                      Undo point
                    </button>
                    <button
                      className="subtle-button"
                      onClick={() => mapRef.current?.finishPolygonDraft()}
                      disabled={draftVertexCount < 3}
                    >
                      Finish polygon
                    </button>
                    <button
                      className="subtle-button"
                      onClick={() => mapRef.current?.cancelPolygonDraft()}
                      disabled={draftVertexCount === 0}
                    >
                      Cancel draft
                    </button>
                  </>
                )}
                <button
                  className="subtle-button"
                  onClick={() => {
                    setCoordinates([])
                    setResult(undefined)
                    clearSelection()
                    mapRef.current?.cancelPolygonDraft()
                    setTool('polygon')
                  }}
                  disabled={!coordinates.length && draftVertexCount === 0}
                >
                  Clear area
                </button>
              </div>
              {selectedSummary && (
                <p className="selection-chip">
                  <span
                    className="cluster-dot selection-chip-swatch"
                    style={{
                      background: selectedSummary.color,
                      color: contrastTextForHex(selectedSummary.color),
                    }}
                    aria-hidden
                  />
                  Selected type {selectedSummary.id} · {(selectedSummary.areaM2 / 10_000).toFixed(2)} ha
                  <button type="button" onClick={clearSelection}>Clear</button>
                </p>
              )}

              <div className="section-heading"><span>02</span><h2>Clustering</h2></div>
              <label>
                Embedding year
                <select value={year} onChange={(event) => setYear(Number(event.target.value))}>
                  {[2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017].map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>
              <div className="input-pair">
                <label>
                  Min. clusters
                  <input type="number" min="2" max="40" value={minClusters} onChange={(event) => setMinClusters(Number(event.target.value))} />
                </label>
                <label>
                  Max. clusters
                  <input type="number" min="3" max="40" value={maxClusters} onChange={(event) => setMaxClusters(Number(event.target.value))} />
                </label>
              </div>
              <label>
                Rare-type threshold (m²)
                <input type="number" min="100" step="100" value={rareAreaM2} onChange={(event) => setRareAreaM2(Number(event.target.value))} />
              </label>
              <p className="hint">X-Means chooses a cluster count inside this range. It is run on all valid pixels for bounded polygons.</p>
              <button className="run-button" onClick={() => void analyze()} disabled={running}>
                {running ? 'Running on Earth Engine…' : 'Run all-pixel analysis'}
              </button>

              <section className="results">
                <div>
                  <p className="eyebrow">Results</p>
                  <h2>Nature-type inventory</h2>
                  <p className="hint">
                    Global unusualness measures distance from a cluster centroid; local contrast measures difference from immediate neighbours.
                    {tool === 'inspect' && result ? ' Click a type below or a map pixel to highlight matching areas.' : ''}
                  </p>
                </div>
                {result ? (
                  <div className="result-content">
                    <div className="result-meta">
                      <strong>{result.pixelCount.toLocaleString()}</strong> pixels · 10 m
                      <button
                        className="download-button"
                        onClick={() => {
                          void result.download().catch((cause) => {
                            if (cause instanceof SessionExpiredError) {
                              handleSessionExpired()
                              return
                            }
                            setError(cause instanceof Error ? cause.message : 'Unable to download GeoTIFF.')
                          })
                        }}
                      >
                        GeoTIFF
                      </button>
                    </div>
                    <div className="cluster-grid">
                      {result.summaries.map((summary) => (
                        <article
                          key={summary.id}
                          className={summary.id === selectedClusterId ? 'selected' : undefined}
                          style={
                            summary.id === selectedClusterId
                              ? { boxShadow: `inset 3px 0 0 ${summary.color}` }
                              : undefined
                          }
                          onClick={() => void selectCluster(summary.id)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault()
                              void selectCluster(summary.id)
                            }
                          }}
                          role="button"
                          tabIndex={0}
                          aria-pressed={summary.id === selectedClusterId}
                        >
                          <span
                            className="cluster-dot"
                            style={{
                              background: summary.color,
                              color: contrastTextForHex(summary.color),
                            }}
                            title={`Nature type ${summary.id}`}
                          >
                            {summary.id}
                          </span>
                          <div>
                            <strong>{(summary.areaM2 / 10_000).toFixed(2)} ha</strong>
                            <p>{summary.pixelCount.toLocaleString()} pixels · spread {summary.spread?.toFixed(3) ?? '—'}</p>
                          </div>
                          {summary.isRare && <em>Rare</em>}
                        </article>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="empty-state">Draw or upload an area, then run an analysis.</p>
                )}
              </section>
            </div>
          </>
        ) : (
          <button type="button" className="bubble-launch" onClick={() => setPanelOpen(true)} aria-expanded={false}>
            <span className="bubble-launch-mark">C</span>
            <strong>Clusterizer</strong>
          </button>
        )}
      </aside>
    </main>
  )
}

export default App
