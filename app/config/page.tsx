// SPDX-FileCopyrightText: 2026 Authologic Sp. z o.o.
// SPDX-License-Identifier: AGPL-3.0-only

"use client"

import { AnimatePresence, motion } from "framer-motion"
import { ArrowLeft, Check, Upload } from "lucide-react"
import Link from "next/link"
import { useRef, useState, type ChangeEvent } from "react"
import { toast } from "sonner"
import BrandLogo from "@/components/BrandLogo"
import { Toaster } from "@/components/ui/sonner"
import {
  CUSTOM_LOGO_ID,
  DEFAULT_CONFIG,
  getVisibleCountries,
  LOGO_PRESETS,
  resolveLogo,
  saveHarnessConfig,
  useHydrated,
  useHarnessConfig,
  type ResolvedLogo,
  type HarnessConfig,
} from "@/lib/harness-config"
import { COUNTRIES, isWipCountry, METHODS, type CountryCode } from "@/lib/methods"

const MAX_SVG_BYTES = 300 * 1024
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
// Raster logos are downscaled before saving so they fit in localStorage
const RASTER_MAX = { width: 640, height: 200 }

const CHECK_BADGE = {
  spring: { type: "spring" as const, stiffness: 500, damping: 25 },
}

/* Country visibility toggle */
const SWITCH = {
  knobTravel: 16,   // px the knob slides when switched on
  spring: { type: "spring" as const, stiffness: 500, damping: 30 },
}

const readAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error("Could not read the file."))
    reader.readAsDataURL(file)
  })

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error("Could not load the image."))
    img.src = src
  })

async function fileToLogoDataUrl(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("Please choose an image file.")
  if (file.type === "image/svg+xml") {
    if (file.size > MAX_SVG_BYTES) throw new Error("SVG logos must be smaller than 300 KB.")
    return readAsDataUrl(file)
  }
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("Images must be smaller than 10 MB.")

  const url = URL.createObjectURL(file)
  try {
    const img = await loadImage(url)
    const scale = Math.min(1, RASTER_MAX.width / img.naturalWidth, RASTER_MAX.height / img.naturalHeight)
    const canvas = document.createElement("canvas")
    canvas.width = Math.round(img.naturalWidth * scale)
    canvas.height = Math.round(img.naturalHeight * scale)
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL("image/png")
  } finally {
    URL.revokeObjectURL(url)
  }
}

function SwitchTrack({ checked, dimmed = false }: { checked: boolean; dimmed?: boolean }) {
  return (
    <span className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${checked ? "bg-gray-900" : "bg-gray-200"} ${dimmed ? "opacity-50" : ""}`}>
      <motion.span
        initial={false}
        animate={{ x: checked ? SWITCH.knobTravel : 0 }}
        transition={SWITCH.spring}
        className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm"
      />
    </span>
  )
}

function LogoOption({ name, logo, selected, onSelect }: { name: string; logo: ResolvedLogo; selected: boolean; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      aria-pressed={selected}
      className={`relative flex h-24 flex-col items-center justify-center gap-2 rounded-2xl border bg-white px-3 transition-colors ${
        selected ? "border-gray-900 ring-1 ring-gray-900" : "border-gray-200 hover:border-gray-300"
      }`}
    >
      <div className="flex h-7 items-center">
        <BrandLogo logo={logo} className="h-6 max-w-[120px]" />
      </div>
      <span className="max-w-full truncate text-xs text-gray-500">{name}</span>
      <AnimatePresence>
        {selected && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            transition={CHECK_BADGE.spring}
            className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-gray-900 text-white"
          >
            <Check className="h-3 w-3" strokeWidth={3} />
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  )
}

export default function ConfigPage() {
  const config = useHarnessConfig()
  const hydrated = useHydrated()
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const save = (next: HarnessConfig) => {
    try {
      saveHarnessConfig(next)
      return true
    } catch {
      toast.error("Your browser couldn't save the configuration. Try a smaller logo file.")
      return false
    }
  }

  const handleFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    setUploading(true)
    try {
      const src = await fileToLogoDataUrl(file)
      if (save({ ...config, logoId: CUSTOM_LOGO_ID, customLogo: { src, name: file.name } })) toast.success("Logo uploaded")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not use that file.")
    } finally {
      setUploading(false)
    }
  }

  const visibleCountries = getVisibleCountries(config)

  const toggleCountry = (code: CountryCode) => {
    const next = visibleCountries.includes(code)
      ? visibleCountries.filter(c => c !== code)
      : COUNTRIES.map(c => c.code).filter(c => c === code || visibleCountries.includes(c))
    if (!next.length) return
    save({ ...config, countriesByLogo: { ...config.countriesByLogo, [config.logoId]: next } })
  }

  const options = [
    ...LOGO_PRESETS.map(p => ({ id: p.id, name: p.name, logo: { src: p.src, alt: p.name } })),
    ...(config.customLogo
      ? [{ id: CUSTOM_LOGO_ID, name: config.customLogo.name, logo: { src: config.customLogo.src, alt: config.customLogo.name } }]
      : []),
  ]

  return (
    <div className="min-h-dvh bg-white">
      <Toaster position="top-center" richColors />
      <header className="relative flex h-16 items-center justify-center border-b border-gray-100 px-4">
        <Link
          href="/"
          aria-label="Back"
          className="absolute left-4 flex h-10 w-10 items-center justify-center rounded-full text-gray-700 transition-colors hover:bg-gray-100"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-base font-semibold text-gray-900">Configuration</h1>
      </header>

      {hydrated && (
        <main className="mx-auto flex max-w-md flex-col gap-6 px-6 py-8">
          <section className="flex flex-col gap-1">
            <h2 className="text-sm font-semibold text-gray-900">Logo</h2>
            <p className="text-sm leading-relaxed text-gray-500">
              Shown at the top of the sign-up page. Saved only in this browser, so other people using the page keep their own logo.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <span className="text-xs font-medium uppercase tracking-wider text-gray-400">Preview</span>
            <div className="flex h-28 items-center justify-center rounded-2xl border border-gray-100 bg-gray-50">
              <BrandLogo className="h-7 max-w-[180px]" />
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              {options.map(o => (
                <LogoOption
                  key={o.id}
                  name={o.name}
                  logo={o.logo}
                  selected={config.logoId === o.id}
                  onSelect={() => save({ ...config, logoId: o.id })}
                />
              ))}
              <button
                onClick={() => inputRef.current?.click()}
                disabled={uploading}
                className="flex h-24 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-gray-300 text-gray-600 transition-colors hover:border-gray-400 hover:bg-gray-50 disabled:opacity-60"
              >
                <Upload className="h-5 w-5" />
                <span className="text-xs font-medium">
                  {uploading ? "Uploading…" : config.customLogo ? "Replace custom logo" : "Upload logo"}
                </span>
              </button>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              onChange={handleFile}
              className="hidden"
            />
            <p className="text-xs text-gray-400">PNG, JPG, WebP or SVG. Logos with a transparent background look best.</p>
          </section>

          <section className="flex flex-col gap-3 border-t border-gray-100 pt-6">
            <div className="flex flex-col gap-1">
              <h2 className="text-sm font-semibold text-gray-900">Countries</h2>
              <p className="text-sm leading-relaxed text-gray-500">
                Shown in the country switcher when the <span className="font-medium text-gray-700">{resolveLogo(config).alt}</span> logo is selected.
              </p>
            </div>
            <div className="divide-y divide-gray-100 rounded-2xl border border-gray-200">
              {COUNTRIES.map(c => {
                const checked = visibleCountries.includes(c.code)
                const locked = checked && visibleCountries.length === 1
                return (
                  <button
                    key={c.code}
                    role="switch"
                    aria-checked={checked}
                    disabled={locked}
                    onClick={() => toggleCountry(c.code)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left disabled:cursor-not-allowed"
                  >
                    <span className="text-xl leading-none">{c.flag}</span>
                    <span className="flex flex-1 items-center gap-2 text-sm text-gray-900">
                      {c.name}
                      {isWipCountry(c.code) && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium leading-none text-amber-800">
                          Work in progress
                        </span>
                      )}
                    </span>
                    <SwitchTrack checked={checked} dimmed={locked} />
                  </button>
                )
              })}
            </div>
            <p className="text-xs text-gray-400">Each logo keeps its own list. At least one country must stay visible.</p>
          </section>

          <section className="flex flex-col gap-3 border-t border-gray-100 pt-6">
            <h2 className="text-sm font-semibold text-gray-900">Features</h2>
            <button
              role="switch"
              aria-checked={!!config.amlFormGate}
              onClick={() => save({ ...config, amlFormGate: !config.amlFormGate })}
              className="flex w-full items-center gap-4 rounded-2xl border border-gray-200 px-4 py-3 text-left"
            >
              <span className="flex flex-1 flex-col gap-0.5">
                <span className="text-sm text-gray-900">AML form before additional options</span>
                <span className="text-xs leading-relaxed text-gray-500">
                  &quot;Show additional signup options&quot; first runs the {METHODS.amlForm.strategy} verification and reveals the options once it&apos;s finished.
                </span>
              </span>
              <SwitchTrack checked={!!config.amlFormGate} />
            </button>
          </section>

          <section className="flex items-center justify-between border-t border-gray-100 pt-4">
            {config.customLogo ? (
              <button
                onClick={() => {
                  const countriesByLogo = { ...config.countriesByLogo }
                  delete countriesByLogo[CUSTOM_LOGO_ID]
                  save({
                    ...config,
                    customLogo: undefined,
                    logoId: config.logoId === CUSTOM_LOGO_ID ? DEFAULT_CONFIG.logoId : config.logoId,
                    countriesByLogo,
                  })
                }}
                className="text-sm text-red-600 hover:text-red-700"
              >
                Remove custom logo
              </button>
            ) : (
              <span />
            )}
            <button onClick={() => save(DEFAULT_CONFIG)} className="text-sm text-gray-500 hover:text-gray-700">
              Reset to default
            </button>
          </section>
        </main>
      )}
    </div>
  )
}
