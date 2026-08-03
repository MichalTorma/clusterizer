import { useMemo, useState } from 'react'
import { AnalysisMap } from './components/AnalysisMap'
import {
  approximatePolygonAreaM2,
  polygonIsValid,
  trainingEstimateLabel,
  type AnalysisParameters,
  type Position,
} from './lib/analysis'
import { authenticateEarthEngine, runAnalysis, type AnalysisResult } from './lib/earthEngine'
import { getEarthEngineConfigurationError } from './lib/config'
import './App.css'

function App() {
  const [coordinates, setCoordinates] = useState<Position[]>([])
  const [year, setYear] = useState(2024)
  const [minClusters, setMinClusters] = useState(3)
  const [maxClusters, setMaxClusters] = useState(16)
  const [rareAreaM2, setRareAreaM2] = useState(1_000)
  const [authenticated, setAuthenticated] = useState(false)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string>()
  const [result, setResult] = useState<AnalysisResult>()
  const [activeLayerNames, setActiveLayerNames] = useState<string[]>(['Nature types'])
  const configurationError = getEarthEngineConfigurationError()
  const areaM2 = useMemo(() => approximatePolygonAreaM2(coordinates), [coordinates])

  const addPoint = (position: Position) => {
    setCoordinates((current) => [...current, position])
    setResult(undefined)
  }

  const authenticate = async () => {
    setError(undefined)
    try {
      await authenticateEarthEngine()
      setAuthenticated(true)
    } catch (cause) {
      console.error('Earth Engine sign-in failed:', cause)
      setError(cause instanceof Error ? cause.message : 'Unable to sign in to Earth Engine.')
    }
  }

  const analyze = async () => {
    if (!polygonIsValid(coordinates)) {
      setError('Click at least three points on the map to draw an analysis polygon.')
      return
    }
    if (maxClusters <= minClusters) {
      setError('The maximum cluster count must be greater than the minimum.')
      return
    }

    const parameters: AnalysisParameters = {
      coordinates, year, minClusters, maxClusters, rareAreaM2,
    }
    setRunning(true)
    setError(undefined)
    try {
      const nextResult = await runAnalysis(parameters)
      setResult(nextResult)
      setActiveLayerNames(['Nature types'])
    } catch (cause) {
      console.error('Earth Engine analysis failed:', cause)
      setError(cause instanceof Error ? cause.message : 'The analysis could not be completed.')
    } finally {
      setRunning(false)
    }
  }

  const toggleLayer = (name: string) => {
    setActiveLayerNames((current) =>
      current.includes(name) ? current.filter((item) => item !== name) : [...current, name],
    )
  }

  return (
    <main>
      <header>
        <div>
          <p className="eyebrow">AlphaEarth Foundations · 10 m annual embeddings</p>
          <h1>Clusterizer</h1>
          <p className="subtitle">Find recurring nature types and exceptional pixels in one chosen landscape.</p>
        </div>
        <button className="sign-in" onClick={authenticate} disabled={authenticated || Boolean(configurationError)}>
          {authenticated ? 'Earth Engine connected' : 'Connect Earth Engine'}
        </button>
      </header>

      {configurationError && <p className="notice">{configurationError}</p>}
      {error && <p className="notice error">{error}</p>}

      <section className="workspace">
        <aside className="controls">
          <div className="section-heading"><span>01</span><h2>Analysis area</h2></div>
          <p className="hint">Click the map to place polygon vertices. The analysis retains every valid 10 m pixel.</p>
          <div className="metrics">
            <span>{coordinates.length} vertices</span>
            <span>{(areaM2 / 1e6).toFixed(2)} km²</span>
            <span>{trainingEstimateLabel(coordinates)}</span>
          </div>
          <button className="subtle-button" onClick={() => setCoordinates([])} disabled={!coordinates.length}>Clear polygon</button>

          <div className="section-heading"><span>02</span><h2>Clustering</h2></div>
          <label>
            Embedding year
            <select value={year} onChange={(event) => setYear(Number(event.target.value))}>
              {[2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017].map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <div className="input-pair">
            <label>Min. clusters<input type="number" min="2" max="40" value={minClusters} onChange={(event) => setMinClusters(Number(event.target.value))} /></label>
            <label>Max. clusters<input type="number" min="3" max="40" value={maxClusters} onChange={(event) => setMaxClusters(Number(event.target.value))} /></label>
          </div>
          <label>
            Rare-type threshold (m²)
            <input type="number" min="100" step="100" value={rareAreaM2} onChange={(event) => setRareAreaM2(Number(event.target.value))} />
          </label>
          <p className="hint">X-Means chooses a cluster count inside this range. It is run on all valid pixels for bounded polygons.</p>
          <button className="run-button" onClick={analyze} disabled={!authenticated || running}>
            {running ? 'Running on Earth Engine…' : 'Run all-pixel analysis'}
          </button>
        </aside>

        <section className="map-panel">
          <AnalysisMap coordinates={coordinates} layers={result?.layers ?? []} activeLayerNames={activeLayerNames} onAddPoint={addPoint} />
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
      </section>

      <section className="results">
        <div>
          <p className="eyebrow">Results</p>
          <h2>Nature-type inventory</h2>
          <p className="hint">Global unusualness measures distance from a cluster centroid; local contrast measures difference from immediate neighbours.</p>
        </div>
        {result ? (
          <div className="result-content">
            <div className="result-meta">
              <strong>{result.pixelCount.toLocaleString()}</strong> pixels analysed at 10 m
              <button className="download-button" onClick={() => void result.download()}>Download cluster GeoTIFF</button>
            </div>
            <div className="cluster-grid">
              {result.summaries.map((summary) => (
                <article key={summary.id}>
                  <span className="cluster-dot">{summary.id}</span>
                  <div><strong>{(summary.areaM2 / 10_000).toFixed(2)} ha</strong><p>{summary.pixelCount.toLocaleString()} pixels · spread {summary.spread?.toFixed(3) ?? '—'}</p></div>
                  {summary.isRare && <em>Rare</em>}
                </article>
              ))}
            </div>
          </div>
        ) : <p className="empty-state">Connect Earth Engine, draw a small polygon, and run an analysis to inspect every identified type.</p>}
      </section>
    </main>
  )
}

export default App
