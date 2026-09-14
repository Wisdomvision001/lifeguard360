import { useEffect, useRef, type JSX } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import { facilityDirectionsUrl } from "@/services/facilities/facilityService";
import type { FacilityWithDistance, GeoCoordinates, LocationFix } from "@/types";
import { formatDistance } from "@/utils/format";
import styles from "@/components/LocationMap.module.css";

/**
 * LocationMap (Phase 5C, extended in 5D-1) — visualization-only Leaflet +
 * OpenStreetMap layer. It never acquires location itself: no
 * navigator.geolocation calls of any kind live here.
 *
 * Two additive layers:
 * - user layer: one circleMarker + accuracy circle for the LocationFix
 * - facilities layer (5D-1): one popup-equipped marker per
 *   FacilityWithDistance, plotted around the same one-shot fix
 *
 * Lifecycle: the map is created once per container (ref guard); layers update
 * in place when props change and everything is removed on unmount. Invalid
 * coordinates are defensively ignored at this boundary — acquisition-time
 * validation belongs to locationService.
 */

export const USER_LOCATION_ZOOM = 15;

/** Defensive coordinate check for the visualization boundary (not a re-validation system). */
function isRenderableCoordinates(coordinates: GeoCoordinates): boolean {
  return (
    Number.isFinite(coordinates.latitude) && coordinates.latitude >= -90 && coordinates.latitude <= 90 &&
    Number.isFinite(coordinates.longitude) && coordinates.longitude >= -180 && coordinates.longitude <= 180
  );
}

/** Popup content built via DOM APIs (no HTML string interpolation of data). */
function buildFacilityPopup(facility: FacilityWithDistance): HTMLElement {
  const root = document.createElement("div");

  const name = document.createElement("strong");
  name.textContent = facility.name;
  name.className = styles.popupName;
  root.appendChild(name);

  const meta = document.createElement("p");
  meta.className = styles.popupMeta;
  meta.textContent = `${facility.category} · ${formatDistance(facility.distanceMeters)}`;
  root.appendChild(meta);

  const verified = document.createElement("p");
  verified.className = styles.popupMeta;
  verified.textContent = facility.verified ? "Verified facility" : "Unverified record";
  root.appendChild(verified);

  // Provenance (5D-3): shown when present so source data is never dead data.
  if (facility.source !== "" && facility.source !== "unknown") {
    const source = document.createElement("p");
    source.className = styles.popupSource;
    source.textContent = facility.source;
    root.appendChild(source);
  }

  if (facility.openingHours !== undefined) {
    const hours = document.createElement("p");
    hours.className = styles.popupMeta;
    hours.textContent = facility.openingHours;
    root.appendChild(hours);
  }

  if (facility.phone !== undefined) {
    const phone = document.createElement("a");
    phone.className = styles.popupLink;
    phone.href = `tel:${facility.phone}`;
    phone.textContent = facility.phone;
    root.appendChild(phone);
  }

  const directions = document.createElement("a");
  directions.className = styles.popupLink;
  directions.href = facilityDirectionsUrl(facility);
  directions.target = "_blank";
  directions.rel = "noopener noreferrer";
  directions.textContent = "Directions";
  root.appendChild(directions);

  return root;
}

export interface LocationMapProps {
  location: LocationFix | null;
  /** Nearby verified facilities to plot (Phase 5D-1). Optional — omitted = no facility layer content. */
  facilities?: FacilityWithDistance[];
}

export function LocationMap({ location, facilities }: LocationMapProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.CircleMarker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);
  const facilitiesLayerRef = useRef<L.LayerGroup | null>(null);

  const hasFacilities = (facilities ?? []).length > 0;

  // Initialize once per container; Leaflet itself is torn down on unmount.
  useEffect(() => {
    if (containerRef.current === null || mapRef.current !== null) return;
    const map = L.map(containerRef.current, { zoomControl: true });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);
    facilitiesLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      circleRef.current = null;
      facilitiesLayerRef.current = null;
    };
  }, []);

  // Keep the user marker, accuracy circle and view in sync with the supplied
  // fix. When facility markers own the viewport, the facilities effect fits
  // the bounds instead (user marker stays inside them).
  useEffect(() => {
    const map = mapRef.current;
    if (map === null) return;
    if (location === null || !isRenderableCoordinates(location.coordinates)) {
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

    if (!hasFacilities) {
      map.setView(latlng, USER_LOCATION_ZOOM);
    }
  }, [location, hasFacilities]);

  // Sync the facility layer with the supplied results (5D-1): clear and
  // refill on change, then fit the viewport over user + facilities so every
  // plotted marker and the user marker stay visible together.
  useEffect(() => {
    const layer = facilitiesLayerRef.current;
    const map = mapRef.current;
    if (layer === null || map === null) return;

    layer.clearLayers();
    const renderable = (facilities ?? []).filter((facility) =>
      isRenderableCoordinates(facility.coordinates),
    );
    if (renderable.length === 0) return;

    for (const facility of renderable) {
      L.circleMarker([facility.coordinates.latitude, facility.coordinates.longitude], {
        radius: 7,
        color: "#ffffff",
        weight: 2,
        fillColor: "#2563eb",
        fillOpacity: 1,
      })
        .bindTooltip(facility.name)
        .bindPopup(buildFacilityPopup(facility))
        .addTo(layer);
    }

    const latitudes = renderable.map((facility) => facility.coordinates.latitude);
    const longitudes = renderable.map((facility) => facility.coordinates.longitude);
    if (location !== null && isRenderableCoordinates(location.coordinates)) {
      latitudes.push(location.coordinates.latitude);
      longitudes.push(location.coordinates.longitude);
    }
    map.fitBounds(
      [
        [Math.min(...latitudes), Math.min(...longitudes)],
        [Math.max(...latitudes), Math.max(...longitudes)],
      ],
      { padding: [28, 28], maxZoom: USER_LOCATION_ZOOM },
    );
  }, [facilities, location]);

  // Recompute internal size when the container resizes (drawer/layout shifts).
  useEffect(() => {
    const map = mapRef.current;
    if (map === null || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => map.invalidateSize());
    if (containerRef.current !== null) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  return <div ref={containerRef} className={styles.mapContainer} role="application" aria-label="Map of your current location and nearby facilities" />;
}
