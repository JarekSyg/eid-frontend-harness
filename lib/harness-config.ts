// SPDX-FileCopyrightText: 2026 Authologic Sp. z o.o.
// SPDX-License-Identifier: AGPL-3.0-only

"use client"

/**
 * Per-browser presentation settings for the harness (logo, visible countries,
 * feature flags). Stored in localStorage only — nothing here is sent to the server.
 */
import { useSyncExternalStore } from "react"
import { COUNTRIES, isWipCountry, type CountryCode } from "@/lib/methods"

export const LOGO_PRESETS = [
  { id: "acme", name: "Acme", src: "/acme-logo.png" },
  { id: "authologic", name: "Authologic", src: "/authologic-logo.svg" },
] as const

export const CUSTOM_LOGO_ID = "custom"

export type HarnessConfig = {
  logoId: string
  customLogo?: { src: string; name: string }
  /** Visible countries per logo id; logos without an entry show all non-WIP countries */
  countriesByLogo?: Record<string, CountryCode[]>
  /** Feature flag: "Show additional signup options" first runs the AML form verification */
  amlFormGate?: boolean
}

export type ResolvedLogo = { src: string; alt: string }

export const DEFAULT_CONFIG: HarnessConfig = { logoId: "acme" }

const STORAGE_KEY = "harness-config"
const COUNTRY_STORAGE_KEY = "harness-country"
const CHANGE_EVENT = "harness-config-change"

// Cache by raw string so useSyncExternalStore gets a stable snapshot
let cachedRaw: string | null = null
let cachedConfig = DEFAULT_CONFIG

function readConfig(): HarnessConfig {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (raw !== cachedRaw) {
    cachedRaw = raw
    try {
      cachedConfig = raw ? { ...DEFAULT_CONFIG, ...JSON.parse(raw) } : DEFAULT_CONFIG
    } catch {
      cachedConfig = DEFAULT_CONFIG
    }
  }
  return cachedConfig
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange)
  window.addEventListener(CHANGE_EVENT, onChange)
  return () => {
    window.removeEventListener("storage", onChange)
    window.removeEventListener(CHANGE_EVENT, onChange)
  }
}

export function useHarnessConfig() {
  return useSyncExternalStore(subscribe, readConfig, () => DEFAULT_CONFIG)
}

const noopSubscribe = () => () => {}

/** False during SSR/hydration, true once the saved config can be read */
export function useHydrated() {
  return useSyncExternalStore(noopSubscribe, () => true, () => false)
}

const readCountry = () => {
  const saved = localStorage.getItem(COUNTRY_STORAGE_KEY)
  return COUNTRIES.some(c => c.code === saved) ? (saved as CountryCode) : null
}

/** Country last picked in the switcher, or null (also during SSR/hydration) */
export function useSavedCountry() {
  return useSyncExternalStore(subscribe, readCountry, () => null)
}

export function saveCountry(country: CountryCode) {
  localStorage.setItem(COUNTRY_STORAGE_KEY, country)
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

/** Throws (e.g. QuotaExceededError) if the browser can't store the config */
export function saveHarnessConfig(config: HarnessConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

export function resolveLogo(config: HarnessConfig): ResolvedLogo {
  if (config.logoId === CUSTOM_LOGO_ID && config.customLogo) {
    return { src: config.customLogo.src, alt: config.customLogo.name }
  }
  const preset = LOGO_PRESETS.find(p => p.id === config.logoId) ?? LOGO_PRESETS[0]
  return { src: preset.src, alt: preset.name }
}

/** Countries visible for the currently selected logo, in COUNTRIES order */
export function getVisibleCountries(config: HarnessConfig): CountryCode[] {
  const saved = config.countriesByLogo?.[config.logoId]
  const defaults = COUNTRIES.map(c => c.code).filter(code => !isWipCountry(code))
  const visible = saved ? COUNTRIES.map(c => c.code).filter(code => saved.includes(code)) : defaults
  return visible.length ? visible : defaults
}
