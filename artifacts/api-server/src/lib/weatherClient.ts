// All weather data comes from Open-Meteo (free, no API key needed):
//   Forecast:  https://api.open-meteo.com/v1/forecast  (up to 16 days ahead)
//   Archive:   https://archive-api.open-meteo.com/v1/archive  (historical)
//   Geocoding: https://geocoding-api.open-meteo.com/v1/search

const METEO_FORECAST = "https://api.open-meteo.com/v1/forecast";
const METEO_ARCHIVE  = "https://archive-api.open-meteo.com/v1/archive";
const METEO_GEO      = "https://geocoding-api.open-meteo.com/v1/search";

const HOURLY_PARAMS  = "temperature_2m,windspeed_10m,weathercode,relativehumidity_2m";

export interface WeatherData {
  temp: number;
  desc: string;
  icon: string;
  wind: number;
  humidity: number;
  isAdverse: boolean;
  adverseReason?: string;
}

// ── WMO weather codes → description + adverse flags ─────────────────────────

function wmoToDesc(code: number): { desc: string; isAdverse: boolean; adverseReason?: string } {
  if (code === 0)                 return { desc: "clear sky", isAdverse: false };
  if (code === 1)                 return { desc: "mainly clear", isAdverse: false };
  if (code === 2)                 return { desc: "partly cloudy", isAdverse: false };
  if (code === 3)                 return { desc: "overcast", isAdverse: false };
  if (code === 45 || code === 48) return { desc: "fog", isAdverse: false };
  if (code === 51)                return { desc: "light drizzle", isAdverse: false };
  if (code === 53)                return { desc: "moderate drizzle", isAdverse: false };
  if (code === 55)                return { desc: "heavy drizzle", isAdverse: false };
  if (code === 61)                return { desc: "light rain", isAdverse: false };
  if (code === 63)                return { desc: "moderate rain", isAdverse: false };
  if (code === 65)                return { desc: "heavy rain", isAdverse: true, adverseReason: "Kraftig regn" };
  if (code === 71)                return { desc: "light snow", isAdverse: true, adverseReason: "Sne" };
  if (code === 73)                return { desc: "moderate snow", isAdverse: true, adverseReason: "Sne" };
  if (code === 75)                return { desc: "heavy snow", isAdverse: true, adverseReason: "Sne" };
  if (code === 77)                return { desc: "snow grains", isAdverse: true, adverseReason: "Sne" };
  if (code === 80)                return { desc: "light rain showers", isAdverse: false };
  if (code === 81)                return { desc: "moderate rain showers", isAdverse: false };
  if (code === 82)                return { desc: "heavy rain showers", isAdverse: true, adverseReason: "Kraftig regn" };
  if (code === 85)                return { desc: "snow showers", isAdverse: true, adverseReason: "Sne" };
  if (code === 86)                return { desc: "heavy snow showers", isAdverse: true, adverseReason: "Sne" };
  if (code === 95)                return { desc: "thunderstorm", isAdverse: true, adverseReason: "Tordenvejr" };
  if (code === 96 || code === 99) return { desc: "thunderstorm with hail", isAdverse: true, adverseReason: "Tordenvejr med hagl" };
  return { desc: "unknown", isAdverse: false };
}

function applyAdverseChecks(
  data: { temp: number; wind: number; isAdverse: boolean; adverseReason?: string; desc: string }
): { isAdverse: boolean; adverseReason?: string } {
  if (data.wind > 14) return { isAdverse: true, adverseReason: `Storm (${Math.round(data.wind)} m/s vind)` };
  if (data.wind > 10) return { isAdverse: true, adverseReason: `Hård vind (${Math.round(data.wind)} m/s)` };
  if (data.temp < -5) return { isAdverse: true, adverseReason: `Ekstrem kulde (${Math.round(data.temp)}°C)` };
  if (data.temp > 36) return { isAdverse: true, adverseReason: `Ekstrem varme (${Math.round(data.temp)}°C)` };
  return { isAdverse: data.isAdverse, adverseReason: data.adverseReason };
}

// ── Shared helper: pick the hourly entry closest to a unix timestamp ──────────

function pickClosestHour(
  json: { hourly: { time: number[]; temperature_2m: number[]; windspeed_10m: number[]; weathercode: number[]; relativehumidity_2m: number[] } },
  targetUnix: number
): WeatherData | null {
  const times: number[] = json.hourly?.time ?? [];
  if (!times.length) return null;

  let bestIdx = 0;
  let minDiff = Infinity;
  for (let i = 0; i < times.length; i++) {
    const diff = Math.abs(times[i]! - targetUnix);
    if (diff < minDiff) { minDiff = diff; bestIdx = i; }
  }

  const temp     = json.hourly.temperature_2m?.[bestIdx]    ?? 0;
  const windKmh  = json.hourly.windspeed_10m?.[bestIdx]     ?? 0;
  const wind     = windKmh / 3.6; // km/h → m/s
  const code     = json.hourly.weathercode?.[bestIdx]       ?? 0;
  const humidity = json.hourly.relativehumidity_2m?.[bestIdx] ?? 0;

  const { desc, isAdverse: wmoAdverse, adverseReason: wmoReason } = wmoToDesc(code);
  const { isAdverse, adverseReason } = applyAdverseChecks({ temp, wind, isAdverse: wmoAdverse, adverseReason: wmoReason, desc });

  return { temp, desc, icon: "", wind, humidity, isAdverse, adverseReason };
}

// ── Geocoding (Open-Meteo, free, no key) ────────────────────────────────────

const geocodeCache = new Map<string, { lat: number; lon: number } | null>();

export async function geocodeCity(
  name: string
): Promise<{ lat: number; lon: number } | null> {
  const key = name.toLowerCase().trim();
  if (geocodeCache.has(key)) return geocodeCache.get(key)!;
  try {
    const url = `${METEO_GEO}?name=${encodeURIComponent(name)}&count=1&language=en&format=json`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) { geocodeCache.set(key, null); return null; }
    const json = await res.json();
    const r = json.results?.[0];
    if (!r) { geocodeCache.set(key, null); return null; }
    const coord = { lat: r.latitude as number, lon: r.longitude as number };
    geocodeCache.set(key, coord);
    return coord;
  } catch {
    geocodeCache.set(key, null);
    return null;
  }
}

// ── Historical weather (Open-Meteo archive, from 1940 to yesterday) ──────────

export async function fetchHistoricalWeather(
  lat: number,
  lon: number,
  kickoffUnix: number
): Promise<WeatherData | null> {
  try {
    const d       = new Date(kickoffUnix * 1000);
    const dateStr = d.toISOString().slice(0, 10);
    const url     = `${METEO_ARCHIVE}?latitude=${lat}&longitude=${lon}&start_date=${dateStr}&end_date=${dateStr}&hourly=${HOURLY_PARAMS}&timezone=UTC&timeformat=unixtime`;
    const res     = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const json = await res.json();
    return pickClosestHour(json, kickoffUnix);
  } catch {
    return null;
  }
}

// ── Forecast weather (Open-Meteo forecast, up to 16 days ahead) ──────────────
// Replaces OpenWeatherMap — same WeatherData return type, no API key needed.

export async function fetchWeatherForCity(
  city: string,
  unixTimestamp: number
): Promise<WeatherData | null> {
  try {
    const coords = await geocodeCity(city);
    if (!coords) return null;

    const { lat, lon } = coords;

    // Open-Meteo forecast covers up to 16 days; archive covers anything older.
    // We always use forecast here (called only for upcoming fixtures by the poller).
    const url = `${METEO_FORECAST}?latitude=${lat}&longitude=${lon}&hourly=${HOURLY_PARAMS}&timezone=UTC&timeformat=unixtime&forecast_days=16`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      console.warn(`[weather] Open-Meteo forecast error ${res.status} for ${city}`);
      return null;
    }
    const json = await res.json();
    return pickClosestHour(json, unixTimestamp);
  } catch (err) {
    console.warn("[weather] fetchWeatherForCity error:", err);
    return null;
  }
}
