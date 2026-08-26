import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

/**
 * Leaflet map with a single draggable marker.
 *
 * The marker uses a self-contained inline SVG data URI, so it never depends on
 * Leaflet's default icon asset resolution (marker-icon.png / marker-shadow.png),
 * which is the usual cause of invisible/broken markers in bundled builds.
 *
 * Reverse geocoding is the parent's job and is driven purely by `onDragEnd`,
 * which Leaflet fires exactly once per completed drag.
 */

const MARKER_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="34" height="46" viewBox="0 0 34 46">
  <g fill="none" fill-rule="evenodd">
    <ellipse cx="17" cy="43" rx="7" ry="2.5" fill="rgba(0,0,0,0.25)"/>
    <path d="M17 1C8.716 1 2 7.716 2 16c0 10.5 13.2 23.2 13.77 23.74a1.75 1.75 0 0 0 2.46 0C18.8 39.2 32 26.5 32 16 32 7.716 25.284 1 17 1Z"
          fill="#ac0053" stroke="#ffffff" stroke-width="2"/>
    <circle cx="17" cy="16" r="5.5" fill="#ffffff"/>
  </g>
</svg>`.trim();

const salonMarkerIcon = L.icon({
  iconUrl: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(MARKER_SVG)}`,
  iconSize: [34, 46],
  iconAnchor: [17, 44],
  popupAnchor: [0, -40],
  className: 'nexora-salon-marker',
});

export interface POIItem {
  id: string;
  name: string;
  category: string;
  lat: number;
  lng: number;
  iconType?: 'transit' | 'shopping' | 'dining' | 'landmark' | 'bank';
}

export function generateNearbyPOIs(lat: number, lng: number): POIItem[] {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
  return [
    { id: 'poi-1', name: 'Central Transit & Metro Station', category: 'Metro Hub', lat: lat + 0.0022, lng: lng + 0.0018, iconType: 'transit' },
    { id: 'poi-2', name: 'City Shopping Galleria', category: 'Shopping Mall', lat: lat - 0.0015, lng: lng + 0.0024, iconType: 'shopping' },
    { id: 'poi-3', name: 'Grand Bus Terminal', category: 'Bus Stop', lat: lat - 0.0021, lng: lng - 0.0014, iconType: 'transit' },
    { id: 'poi-4', name: 'National Commerce Bank & ATM', category: 'Bank / ATM', lat: lat + 0.0014, lng: lng - 0.0026, iconType: 'bank' },
    { id: 'poi-5', name: 'Central Civic Park', category: 'Landmark Park', lat: lat + 0.0028, lng: lng - 0.0009, iconType: 'landmark' },
    { id: 'poi-6', name: 'Aroma Artisan Cafe & Bakery', category: 'Dining', lat: lat - 0.0009, lng: lng - 0.0021, iconType: 'dining' },
  ];
}

function createPoiIcon(iconType: string = 'landmark') {
  let color = '#2563eb';
  let badge = 'P';
  if (iconType === 'transit') { color = '#2563eb'; badge = '🚇'; }
  else if (iconType === 'shopping') { color = '#9333ea'; badge = '🛍️'; }
  else if (iconType === 'dining') { color = '#ea580c'; badge = '☕'; }
  else if (iconType === 'landmark') { color = '#16a34a'; badge = '🏛️'; }
  else if (iconType === 'bank') { color = '#0284c7'; badge = '🏦'; }

  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36">
    <g fill="none" fill-rule="evenodd">
      <ellipse cx="14" cy="34" rx="5" ry="2" fill="rgba(0,0,0,0.2)"/>
      <path d="M14 1C7.37 1 2 6.37 2 13c0 8.5 11 19 11.5 19.5a.7.7 0 0 0 1 0C15 32 26 21.5 26 13 26 6.37 20.63 1 14 1Z"
            fill="${color}" stroke="#ffffff" stroke-width="1.5"/>
      <circle cx="14" cy="13" r="6.5" fill="#ffffff"/>
      <text x="14" y="16.5" font-size="9" text-anchor="middle" fill="${color}" font-weight="bold">${badge}</text>
    </g>
  </svg>`.trim();

  return L.icon({
    iconUrl: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    iconSize: [28, 36],
    iconAnchor: [14, 34],
    popupAnchor: [0, -30],
  });
}

export type MapStyle = 'street' | 'satellite' | 'terrain';

const TILE_LAYERS: Record<MapStyle, { url: string; attribution: string; maxZoom: number }> = {
  street: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19,
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and GIS User Community',
    maxZoom: 19,
  },
  terrain: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ, TomTom, Intermap, iPC, USGS, FAO, NPS, NRCAN',
    maxZoom: 19,
  },
};

interface Props {
  latitude: number;
  longitude: number;
  /** Fired once, after a completed drag. */
  onDragEnd: (latitude: number, longitude: number) => void;
  draggable?: boolean;
  zoom?: number;
  showPois?: boolean;
  pois?: POIItem[];
  mapStyle?: MapStyle;
  className?: string;
}

export default function LocationMap({
  latitude,
  longitude,
  onDragEnd,
  draggable = true,
  zoom = 14,
  showPois = false,
  pois,
  mapStyle = 'street',
  className = '',
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const poiLayerRef = useRef<L.LayerGroup | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  // Keep the latest callback without re-binding the Leaflet listener.
  const onDragEndRef = useRef(onDragEnd);
  onDragEndRef.current = onDragEnd;

  // Create the map exactly once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [latitude, longitude],
      zoom,
      scrollWheelZoom: true,
      attributionControl: true,
    });

    const config = TILE_LAYERS[mapStyle] || TILE_LAYERS.street;
    const tileLayer = L.tileLayer(config.url, {
      maxZoom: config.maxZoom,
      attribution: config.attribution,
    }).addTo(map);
    tileLayerRef.current = tileLayer;

    const poiGroup = L.layerGroup().addTo(map);
    poiLayerRef.current = poiGroup;

    const marker = L.marker([latitude, longitude], {
      draggable,
      icon: salonMarkerIcon,
      autoPan: true,
      keyboard: true,
      title: 'Drag to set your exact salon location',
    }).addTo(map);

    // Exactly one reverse-geocode trigger per completed drag.
    marker.on('dragend', () => {
      const { lat, lng } = marker.getLatLng();
      onDragEndRef.current(lat, lng);
    });

    mapRef.current = map;
    markerRef.current = marker;

    // Leaflet needs a size recalculation when it mounts inside a panel that
    // was hidden or is still animating.
    const invalidate = () => map.invalidateSize();
    const raf = requestAnimationFrame(invalidate);
    const timer = setTimeout(invalidate, 250);
    window.addEventListener('resize', invalidate);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      window.removeEventListener('resize', invalidate);
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      poiLayerRef.current = null;
      tileLayerRef.current = null;
    };
    // Intentionally mount-only; position updates are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update tile layer whenever mapStyle changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
      tileLayerRef.current = null;
    }

    const config = TILE_LAYERS[mapStyle] || TILE_LAYERS.street;
    const newTileLayer = L.tileLayer(config.url, {
      maxZoom: config.maxZoom,
      attribution: config.attribution,
    }).addTo(map);

    tileLayerRef.current = newTileLayer;
  }, [mapStyle]);

  // Update POI layer whenever showPois, coordinates, or pois list changes
  useEffect(() => {
    const poiGroup = poiLayerRef.current;
    if (!poiGroup) return;

    poiGroup.clearLayers();

    if (!showPois) return;

    const poiList = pois || generateNearbyPOIs(latitude, longitude);
    poiList.forEach(poi => {
      const icon = createPoiIcon(poi.iconType);
      const m = L.marker([poi.lat, poi.lng], {
        icon,
        title: `${poi.name} (${poi.category})`,
      });
      m.bindPopup(
        `<div style="font-family: sans-serif; padding: 2px;">
          <div style="font-weight: 700; font-size: 12px; color: #1a1c1c;">${poi.name}</div>
          <div style="font-size: 11px; color: #666; margin-top: 2px;">📍 ${poi.category}</div>
        </div>`
      );
      poiGroup.addLayer(m);
    });
  }, [showPois, latitude, longitude, pois]);

  // Move and zoom the existing map/marker when the parent supplies new coordinates
  // (e.g. after address change, geocoding or "Find Location").
  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker) return;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

    const current = marker.getLatLng();
    const isCoordsChanged = Math.abs(current.lat - latitude) > 1e-9 || Math.abs(current.lng - longitude) > 1e-9;
    const targetZoom = typeof zoom === 'number' ? zoom : 14;

    if (isCoordsChanged) {
      marker.setLatLng([latitude, longitude]);
      map.flyTo([latitude, longitude], targetZoom, { animate: true, duration: 0.75 });
    } else if (map.getZoom() !== targetZoom) {
      map.setZoom(targetZoom, { animate: true });
    }
  }, [latitude, longitude, zoom]);

  useEffect(() => {
    const marker = markerRef.current;
    if (!marker) return;
    if (draggable) marker.dragging?.enable();
    else marker.dragging?.disable();
  }, [draggable]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ width: '100%', height: '100%', zIndex: 0 }}
      role="application"
      aria-label="Salon location map"
    />
  );
}
