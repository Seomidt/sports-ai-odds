export * from "./generated/api";
export * from "./generated/api.schemas";
export { setBaseUrl, setAuthTokenGetter } from "./custom-fetch";
export type { AuthTokenGetter } from "./custom-fetch";

/**
 * Legacy aliases used by parts of the frontend.
 * Keep only aliases here, no extra hook layer.
 */
export {
  useGetTodayFixtures as useGetFixturesToday,
  getGetTodayFixturesQueryKey as getGetFixturesTodayQueryKey,
} from "./generated/api";