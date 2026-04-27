/**
 * Shared league list with flag emojis — used across News, PreMatch, Live, etc.
 * Sorted alphabetically by name.
 */

export interface LeagueMeta {
  id: number;
  name: string;
  flag: string;
}

export const LEAGUES: LeagueMeta[] = [
  { id: 253, name: "MLS",                 flag: "🇺🇸" },
  { id: 179, name: "Scottish Prem.",      flag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿" },
  { id: 235, name: "Eliteserien",         flag: "🇳🇴" },
  { id: 88,  name: "Eredivisie",          flag: "🇳🇱" },
  { id: 271, name: "Ekstraklasa",         flag: "🇵🇱" },
  { id: 3,   name: "Europa League",       flag: "🟠" },
  { id: 244, name: "Veikkausliiga",       flag: "🇫🇮" },
  { id: 2,   name: "Champions League",    flag: "⭐" },
  { id: 848, name: "Conference League",   flag: "🟢" },
  { id: 40,  name: "Championship",        flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿" },
  { id: 78,  name: "Bundesliga",          flag: "🇩🇪" },
  { id: 79,  name: "2. Bundesliga",       flag: "🇩🇪" },
  { id: 218, name: "Bundesliga (AUT)",    flag: "🇦🇹" },
  { id: 119, name: "Superliga",           flag: "🇩🇰" },
  { id: 203, name: "Süper Lig",           flag: "🇹🇷" },
  { id: 113, name: "Allsvenskan",         flag: "🇸🇪" },
  { id: 188, name: "A-League Men",        flag: "🇦🇺" },
  { id: 107, name: "Belgian Pro League",  flag: "🇧🇪" },
  { id: 98,  name: "J1 League",           flag: "🇯🇵" },
  { id: 292, name: "K League 1",          flag: "🇰🇷" },
  { id: 140, name: "La Liga",             flag: "🇪🇸" },
  { id: 262, name: "Liga MX",             flag: "🇲🇽" },
  { id: 61,  name: "Ligue 1",             flag: "🇫🇷" },
  { id: 39,  name: "Premier League",      flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿" },
  { id: 94,  name: "Primeira Liga",       flag: "🇵🇹" },
  { id: 135, name: "Serie A",             flag: "🇮🇹" },
  { id: 120, name: "1. Division",         flag: "🇩🇰" },
].sort((a, b) => a.name.localeCompare(b.name));

/** Quick flag lookup by league ID — returns "" if unknown */
const FLAG_MAP = new Map<number, string>(LEAGUES.map((l) => [l.id, l.flag]));
export function getLeagueFlag(leagueId: number | null | undefined): string {
  if (leagueId == null) return "";
  return FLAG_MAP.get(leagueId) ?? "";
}

/** Liga-logo URL fra API-Football — vises overalt og fungerer på alle platforme */
export function getLeagueLogo(leagueId: number | null | undefined): string {
  if (leagueId == null) return "";
  return `https://media.api-sports.io/football/leagues/${leagueId}.png`;
}
