import {foldSearch} from "../record-search-store";
import type {LocalText} from "./catalog";

export const sourceMethods = {
  direct: {tr:"Doğrudan API", en:"Direct API"},
  collector: {tr:"Collector gerekli", en:"Collector required"},
  custom: {tr:"Özel HTTPS JSON", en:"Custom HTTPS JSON"},
  reference: {tr:"Yalnızca rehber", en:"Guide only"},
} satisfies Record<string, LocalText>;

export type SourceMethod = keyof typeof sourceMethods;

export function sourceMethod(driver: string): SourceMethod {
  if (driver === "reference") return "reference";
  if (driver === "guide" || driver === "https-bridge") return "collector";
  if (driver === "rest-json") return "custom";
  return "direct";
}

export function matchesSource(name: string, query: string) {
  return foldSearch(name).includes(foldSearch(query.trim()));
}
