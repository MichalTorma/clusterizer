import { useRef, useState } from 'react'
import { importPolygonFromFile, VECTOR_UPLOAD_ACCEPT, type ImportedPolygon } from '../lib/vectorImport'

interface AreaUploadProps {
  onImported: (polygon: ImportedPolygon) => void
  onError: (message: string) => void
}

export function AreaUpload({ onImported, onError }: AreaUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState<string>()
  const [busy, setBusy] = useState(false)

  const handleFiles = async (files: FileList | null) => {
    const file = files?.[0]
    if (!file) return
    setBusy(true)
    setFileName(file.name)
    try {
      const imported = await importPolygonFromFile(file)
      onImported(imported)
    } catch (cause) {
      console.error('Vector import failed:', cause)
      onError(cause instanceof Error ? cause.message : 'Unable to import that vector file.')
      setFileName(undefined)
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="area-upload">
      <input
        ref={inputRef}
        id="area-upload-input"
        type="file"
        accept={VECTOR_UPLOAD_ACCEPT}
        hidden
        onChange={(event) => void handleFiles(event.target.files)}
      />
      <button
        type="button"
        className="subtle-button area-upload-button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? 'Reading file…' : 'Upload polygon file'}
      </button>
      <p className="hint">
        GeoJSON, KML, GPX, WKT, or a zipped Shapefile.
        {fileName ? ` Last import: ${fileName}` : ''}
      </p>
    </div>
  )
}
