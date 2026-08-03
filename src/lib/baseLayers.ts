export interface BaseLayer {
  id: string
  name: string
  url: string
  attribution: string
  maxZoom?: number
  maxNativeZoom?: number
  subdomains?: string
}

/** Openly usable basemaps for Leaflet (Web Mercator). */
export const BASE_LAYERS: BaseLayer[] = [
  {
    id: 'osm',
    name: 'OpenStreetMap',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  },
  {
    id: 'opentopo',
    name: 'OpenTopoMap',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution:
      'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)',
    maxZoom: 17,
  },
  {
    id: 'cyclosm',
    name: 'CyclOSM',
    url: 'https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png',
    attribution:
      '<a href="https://github.com/cyclosm/cyclosm-cartocss-style/releases">CyclOSM</a> | Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 20,
  },
  {
    id: 'carto-voyager',
    name: 'Carto Voyager',
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    maxZoom: 20,
    subdomains: 'abcd',
  },
  {
    id: 'carto-light',
    name: 'Carto Light',
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    maxZoom: 20,
    subdomains: 'abcd',
  },
  {
    id: 'esri-imagery',
    name: 'Esri Imagery',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution:
      'Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
    maxZoom: 19,
  },
  {
    id: 'esri-topo',
    name: 'Esri Topo',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
    attribution:
      'Tiles &copy; Esri — Esri, HERE, Garmin, FAO, NOAA, USGS, © OpenStreetMap contributors',
    maxZoom: 19,
  },
  {
    id: 'norgeskart',
    name: 'Norgeskart',
    // Kartverket WMTS uses {z}/{y}/{x}, not Leaflet's default {z}/{x}/{y}.
    url: 'https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png',
    attribution: '&copy; <a href="https://www.kartverket.no/">Kartverket</a>',
    maxZoom: 18,
  },
  {
    id: 'norgeskart-gray',
    name: 'Norgeskart gray',
    url: 'https://cache.kartverket.no/v1/wmts/1.0.0/topograatone/default/webmercator/{z}/{y}/{x}.png',
    attribution: '&copy; <a href="https://www.kartverket.no/">Kartverket</a>',
    maxZoom: 18,
  },
  {
    id: 'norgeskart-topo',
    name: 'Norgeskart turkart',
    url: 'https://cache.kartverket.no/v1/wmts/1.0.0/toporaster/default/webmercator/{z}/{y}/{x}.png',
    attribution: '&copy; <a href="https://www.kartverket.no/">Kartverket</a>',
    maxZoom: 18,
  },
  {
    id: 'norgeskart-sea',
    name: 'Norgeskart sjøkart',
    url: 'https://cache.kartverket.no/v1/wmts/1.0.0/sjokartraster/default/webmercator/{z}/{y}/{x}.png',
    attribution: '&copy; <a href="https://www.kartverket.no/">Kartverket</a>',
    maxZoom: 18,
  },
]

export const DEFAULT_BASE_LAYER_ID = 'osm'

export function getBaseLayer(id: string): BaseLayer {
  return BASE_LAYERS.find((layer) => layer.id === id) ?? BASE_LAYERS[0]
}
