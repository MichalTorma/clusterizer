export interface MapFocusRequest {
  id: number
  center?: [number, number]
  zoom?: number
  /** Leaflet [[south, west], [north, east]] */
  bounds?: [[number, number], [number, number]]
}
