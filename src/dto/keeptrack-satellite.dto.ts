/**
 * Matches the shape returned by KeepTrack's /v2/sats endpoint.
 */
export interface KeepTrackSatellite {
  tle1: string;
  tle2: string;
  name: string;
  type: number;
  // Additional fields if needed, e.g., country, launchDate, etc.
}
