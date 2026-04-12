const WEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;
const BASE = "https://api.openweathermap.org/data/2.5";

export interface WeatherData {
  temp: number;
  desc: string;
  icon: string;
  wind: number;
  humidity: number;
  isAdverse: boolean;
  adverseReason?: string;
}

export async function fetchWeatherForCity(
  city: string,
  unixTimestamp: number
): Promise<WeatherData | null> {
  if (!WEATHER_API_KEY) {
    console.warn("[weather] OPENWEATHER_API_KEY not set");
    return null;
  }

  try {
    const nowSec = Math.floor(Date.now() / 1000);
    const diffHours = (unixTimestamp - nowSec) / 3600;

    let url: string;
    let data: any;

    if (diffHours <= 48 && diffHours >= -3) {
      url = `${BASE}/forecast?q=${encodeURIComponent(city)}&appid=${WEATHER_API_KEY}&units=metric&cnt=16`;
      const res = await fetch(url);
      if (!res.ok) {
        console.warn(`[weather] forecast API error ${res.status} for ${city}`);
        return null;
      }
      const json = await res.json();
      const entries: any[] = json.list ?? [];
      let best = entries[0];
      let minDiff = Infinity;
      for (const entry of entries) {
        const diff = Math.abs(entry.dt - unixTimestamp);
        if (diff < minDiff) {
          minDiff = diff;
          best = entry;
        }
      }
      if (!best) return null;
      data = {
        temp: best.main.temp,
        desc: best.weather?.[0]?.description ?? "",
        icon: best.weather?.[0]?.icon ?? "",
        wind: best.wind?.speed ?? 0,
        humidity: best.main?.humidity ?? 0,
      };
    } else {
      url = `${BASE}/weather?q=${encodeURIComponent(city)}&appid=${WEATHER_API_KEY}&units=metric`;
      const res = await fetch(url);
      if (!res.ok) {
        console.warn(`[weather] current API error ${res.status} for ${city}`);
        return null;
      }
      const json = await res.json();
      data = {
        temp: json.main.temp,
        desc: json.weather?.[0]?.description ?? "",
        icon: json.weather?.[0]?.icon ?? "",
        wind: json.wind?.speed ?? 0,
        humidity: json.main?.humidity ?? 0,
      };
    }

    const { temp, desc, icon, wind, humidity } = data;
    const descLower = desc.toLowerCase();

    let isAdverse = false;
    let adverseReason: string | undefined;

    if (wind > 14) { isAdverse = true; adverseReason = `Storm (${Math.round(wind)} m/s vind)`; }
    else if (wind > 10) { isAdverse = true; adverseReason = `Hård vind (${Math.round(wind)} m/s)`; }
    else if (descLower.includes("snow") || descLower.includes("blizzard")) {
      isAdverse = true; adverseReason = "Sne";
    } else if (descLower.includes("heavy rain") || descLower.includes("thunderstorm")) {
      isAdverse = true; adverseReason = "Kraftig regn/tordenvejr";
    } else if (descLower.includes("hail") || descLower.includes("sleet")) {
      isAdverse = true; adverseReason = "Hagl/slud";
    } else if (temp < -5) {
      isAdverse = true; adverseReason = `Ekstrem kulde (${Math.round(temp)}°C)`;
    } else if (temp > 36) {
      isAdverse = true; adverseReason = `Ekstrem varme (${Math.round(temp)}°C)`;
    }

    return { temp, desc, icon, wind, humidity, isAdverse, adverseReason };
  } catch (err) {
    console.warn("[weather] fetch error:", err);
    return null;
  }
}
