// SPDX-FileCopyrightText: 2026 Authologic Sp. z o.o.
// SPDX-License-Identifier: MIT

/**
 * Verification methods offered by the harness.
 *
 * The browser only ever sends a method id; the server maps it to an Authologic
 * strategy (see app/api/conversations/route.ts). That keeps clients from
 * starting conversations with arbitrary strategies.
 *
 * Strategy ids depend on what is enabled for your Authologic account — adjust
 * them to match your setup.
 */

/** `wip` countries are hidden by default and flagged as work in progress on /config */
export const COUNTRIES = [
  { code: "ro", name: "Romania", flag: "🇷🇴" },
  { code: "br", name: "Brazil", flag: "🇧🇷", wip: true },
  { code: "pl", name: "Poland", flag: "🇵🇱" },
  { code: "rs", name: "Serbia", flag: "🇷🇸", wip: true },
  { code: "be", name: "Belgium", flag: "🇧🇪", wip: true },
  { code: "gr", name: "Greece", flag: "🇬🇷", wip: true },
  { code: "es", name: "Spain", flag: "🇪🇸" },
  { code: "de", name: "Germany", flag: "🇩🇪" },
] as const satisfies readonly { code: string; name: string; flag: string; wip?: boolean }[]

export const isWipCountry = (code: CountryCode) => COUNTRIES.some(c => c.code === code && "wip" in c && c.wip)

export type CountryCode = (typeof COUNTRIES)[number]["code"]

const EUDI_STRATEGY = "portal:dcapi+eudi"

export const METHODS = {
  global:         { label: "Verify identity with the wallet", strategy: "public:dcapi" },
  roWallet:       { label: "Sign up with RO Wallet",          strategy: EUDI_STRATEGY },
  mObywatel:      { label: "Sign up with mObywatel",          strategy: "OmniId:Mobywatel" },
  edoApp:         { label: "Sign up with eDO App",            strategy: "public:ed" },
  bank:           { label: "Sign up with the bank",           strategy: "public:mi" },
  carteraDigital: { label: "Sign up with Cartera Digital",    strategy: EUDI_STRATEGY },
  clave:          { label: "Sign up with Cl@ve",              strategy: "public:clave" },
  dYouWallet:     { label: "Verify with d-you Wallet",        strategy: EUDI_STRATEGY },
  ausweisApp:     { label: "Sign up with AusweisApp2",        strategy: "public:ausweis" },
  // Optional gate in front of "Show additional signup options" (see /config)
  amlForm:        { label: "AML form",                        strategy: "public:amlmform" },
} as const satisfies Record<string, { label: string; strategy: string }>

export type MethodId = keyof typeof METHODS

export const isMethodId = (value: unknown): value is MethodId =>
  typeof value === "string" && Object.hasOwn(METHODS, value)

/** Methods shown per country, in display order. Countries without an entry get `global`. */
export const COUNTRY_METHODS: Partial<Record<CountryCode, MethodId[]>> = {
  pl: ["mObywatel", "bank", "edoApp"],
  ro: ["roWallet"],
  es: ["carteraDigital", "clave"],
  de: ["dYouWallet", "ausweisApp"],
}

/** Optional helper text shown under a country's methods */
export const COUNTRY_HINTS: Partial<Record<CountryCode, string>> = {
  ro: "RO Wallet is compliant with EUDI and can be downloaded from the App Store or Google Play Store.",
}

/** Methods whose final "completed" screen is skipped so the flow ends immediately */
export const SKIP_COMPLETED_SCREEN = new Set<MethodId>(["amlForm"])
