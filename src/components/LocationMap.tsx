import { useEffect, useRef, type JSX } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import type { LocationFix } from "@/types";
import styles from "@/components/LocationMap.module.css";

/**
 * LocationMap (Phase 5C) — visualization-only Leaflet + OpenStreetMap layer
 * for an existing LocationFix. It never acquires location itself: no
 * navigator.geolocation calls of any kind live here.
 *
 * Lifecycle: the Leaflet map is created once per container (ref guard),
 * marker/circle update in place when a new fix arrives, and everything is
 * removed on unmount. Invalid coordinates are defensively ignored at this
 * boundary — acquisition-time validation belongs to locationService.
 */

export const USER_LOCATION_ZOOM = 15;

/** Defensive coordinate check for the visualization boundary (not a re-validation system). */
function isRenderableCoordinates(location: LocationFix): boolean {
  const { latitude, longitude } = location.coordinates;
  return (
    Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 &&
    Number.isFinite(longitude) && longitude >= -180 && longitude <= 180
  );
}

export function LocationMap({ location }: { location: LocationFix | null }): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.CircleMarker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);

  // Initialize once per container; Leaflet itself is torn down on unmount.
  useEffect(() => {
    if (containerRef.current === null || mapRef.current !== null) return;
    const map = L.map(containerRef.current, { zoomControl: true });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      circleRef.current = null;
    };
  }, []);

  // Keep marker, accuracy circle and view in sync with the supplied fix.
  useEffect(() => {
    const map = mapRef.current;
    if (map === null) return;
    if (location === null || !isRenderableCoordinates(location)) {
      markerRef.current?.remove();
      circleRef.current?.remove();
      markerRef.current = null;
      circleRef.current = null;
      return;
    }

    const latlng: L.LatLngExpression = [location.coordinates.latitude, location.coordinates.longitude];

    if (markerRef.current === null) {
      markerRef.current = L.circleMarker(latlng, {
        radius: 9,
        color: "#ffffff",
        weight: 2,
        fillColor: "#1f9d55",
        fillOpacity: 1,
      })
        .bindTooltip("Your current location")
        .addTo(map);
    } else {
      markerRef.current.setLatLng(latlng);
    }

    if (circleRef.current === null) {
      circleRef.current = L.circle(latlng, {
        radius: location.accuracy,
        color: "#1f9d55",
        weight: 1,
        fillColor: "#1f9d55",
        fillOpacity: 0.15,
      }).addTo(map);
    } else {
      circleRef.current.setLatLng(latlng);
      circleRef.current.setRadius(location.accuracy);
    }

    map.setView(latlng, USER_LOCATION_ZOOM);
  }, [location]);

  // Recompute internal size when the container resizes (drawer/layout shifts).
  useEffect(() => {
    const map = mapRef.current;
    if (map === null || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => map.invalidateSize());
    if (containerRef.current !== null) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  return <div ref={containerRef} className={styles.mapContainer} role="application" aria-label="Map of your current location" />;
}
