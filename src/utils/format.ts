import type { GeoCoordinates, LocationFix } from "@/types";

/**
 * Shared, dependency-free formatting and geometry helpers.
 * Ported from legacy/js/utils.js (qs/qsa dropped — React replaces DOM queries).
 */

/** Format a distance in metres/kilometres for display. */
export function formatDistance(meters: number | null | undefined): string {
  if (meters == null || Number.isNaN(meters)) return "—";
  if (meters < 1000) return `${Math.round(meters)} m away`;
  return `${(meters / 1000).toFixed(1)} km away`;
}

/** Format a timestamp as a short, human-readable date/time. */
export function formatTimestamp(value: number | string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-NG", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Haversine distance in metres between two coordinates. */
export function distanceMeters(a: GeoCoordinates, b: GeoCoordinates): number {
  const R = 6371000;
  const toRad = (deg: number): number => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Build a Google Maps link for a coordinate (used for SMS location sharing). */
export function mapsLink(coordinates: GeoCoordinates): string {
  const { latitude, longitude } = coordinates;
  return `https://maps.google.com/?q=${latitude.toFixed(6)},${longitude.toFixed(6)}`;
}

/**
 * Plain coordinate text, shared so no two screens disagree. The default 4
 * decimals (~11 m) is already finer than typical device accuracy, so it does
 * not overstate precision — the accuracy figure sits beside it.
 */
export function formatCoordinates(coordinates: GeoCoordinates, precision = 4): string {
  const { latitude, longitude } = coordinates;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return "—";
  return `${latitude.toFixed(precision)}, ${longitude.toFixed(precision)}`;
}

/**
 * The approved SECONDARY location line: coordinates plus accuracy, exactly as
 * the readable location is the primary text.
 * e.g. "9.2398, 12.4987 · ±18 m accuracy"
 */
export function formatCoordinateMeta(fix: Pick<LocationFix, "coordinates" | "accuracy">): string {
  const coordinates = formatCoordinates(fix.coordinates);
  const accuracy = Math.round(fix.accuracy);
  return Number.isFinite(fix.accuracy)
    ? `${coordinates} · ±${accuracy} m accuracy`
    : `${coordinates} · accuracy unknown`;
}

/** Human-readable accuracy band, for honest UI copy. */
export function describeAccuracy(accuracyMeters: number): string {
  if (!Number.isFinite(accuracyMeters)) return "unknown accuracy";
  if (accuracyMeters <= 20) return "high accuracy";
  if (accuracyMeters <= 100) return "moderate accuracy";
  return "low accuracy";
}
