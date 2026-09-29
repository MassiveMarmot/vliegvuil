// Units setting: altitude/speed units persisted in localStorage (spec §2:
// "units (ft/m, kt/km/h), stored in localStorage only").
export type AltitudeUnit = 'ft' | 'm';
export type SpeedUnit = 'kt' | 'kmh';

export interface UnitSettings {
  altitude: AltitudeUnit;
  speed: SpeedUnit;
}

export const DEFAULT_UNITS: UnitSettings = { altitude: 'ft', speed: 'kt' };

const STORAGE_KEY_UNITS = 'vliegvuil.units';

/** Read persisted units, falling back to ft/kt */
export function loadUnits(): UnitSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_UNITS);
    if (raw === null) return DEFAULT_UNITS;
    const parsed = JSON.parse(raw) as Partial<UnitSettings>;
    return {
      altitude: parsed.altitude === 'm' ? 'm' : 'ft',
      speed: parsed.speed === 'kmh' ? 'kmh' : 'kt',
    };
  } catch {
    return DEFAULT_UNITS;
  }
}

/** Persist units; failures are ignored (setting still applies for this session) */
export function saveUnits(units: UnitSettings): void {
  try {
    window.localStorage.setItem(STORAGE_KEY_UNITS, JSON.stringify(units));
  } catch {
    // Ignore persistence failures
  }
}

const FT_PER_M = 3.28084;
const KM_PER_NM = 1.852;

/** Format an altitude in feet as the chosen unit */
export function formatAltitude(altFt: number | null, unit: AltitudeUnit): string {
  if (altFt === null) return '—';
  if (unit === 'm') return `${Math.round(altFt / FT_PER_M).toLocaleString()} m`;
  return `${Math.round(altFt).toLocaleString()} ft`;
}

/** Format a speed in knots as the chosen unit */
export function formatSpeed(speedKt: number | null, unit: SpeedUnit): string {
  if (speedKt === null) return '—';
  if (unit === 'kmh') return `${Math.round(speedKt * KM_PER_NM)} km/h`;
  return `${Math.round(speedKt)} kt`;
}
