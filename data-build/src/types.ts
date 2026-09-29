// Data build types — snapshot formats shared between data-build and web

export type AirportStatus = 'commercial' | 'military-shared' | 'planned';

/** Airport snapshot entry (trimmed OurAirports row + status overlay) */
export interface AirportSnapshot {
  icao: string;
  iata: string | null;
  name: string;
  latitude: number;
  longitude: number;
  elevation: number | null;
  type: string;
  status: AirportStatus;
  source: string;
  license: string;
  date: string;
}

/** Aircraft database snapshot entry (tar1090-db / aircraft.csv.gz row) */
export interface AircraftSnapshot {
  icao24: string;
  registration: string | null;
  type: string | null;
  manufacturer: string | null;
  icaoType: string | null;
  model: string | null;
  operator: string | null;
  operatorCallsign: string | null;
  source: string;
  license: string;
  date: string;
}

/** Metadata for a produced snapshot file */
export interface SnapshotMeta {
  file: string;
  count: number;
  source: string;
  license: string;
  date: string;
}

export interface BuildResult {
  snapshot: SnapshotMeta;
  warnings: string[];
}
