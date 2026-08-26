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

interface Props {
  latitude: number;
  longitude: number;
  /** Fired once, after a completed drag. */
  onDragEnd: (latitude: number, longitude: number) => void;
  draggable?: boolean;
  zoom?: number;
  className?: string;
}

export default function LocationMap({
  latitude,
  longitude,
  onDragEnd,
  draggable = true,
  zoom = 14,
  className = '',
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
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

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

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
    };
    // Intentionally mount-only; position updates are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
