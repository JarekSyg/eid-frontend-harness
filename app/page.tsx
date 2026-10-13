// SPDX-FileCopyrightText: 2026 Authologic Sp. z o.o.
// SPDX-License-Identifier: MIT

"use client"

import confetti from "canvas-confetti"
import { AnimatePresence, motion } from "framer-motion"
import { Check, ChevronDown, Globe, KeyRound, Landmark, Settings, SquarePen } from "lucide-react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Suspense, useEffect, useRef, useState, type ReactNode } from "react"
import { flushSync } from "react-dom"
import { toast } from "sonner"
import BrandLogo from "@/components/BrandLogo"
import { Toaster } from "@/components/ui/sonner"
import { getVisibleCountries, saveCountry, useHarnessConfig, useSavedCountry } from "@/lib/harness-config"
import { COUNTRIES, COUNTRY_HINTS, COUNTRY_METHODS, METHODS, type CountryCode, type MethodId } from "@/lib/methods"
import {
  closeWidget, createConversation, isFinished, openWidget, waitForResult, WIDGET_CONTAINER_ID, WIDGET_UNMOUNT_DELAY_MS,
} from "@/lib/omni-widget"
import type { StoredResult } from "@/lib/result-store"

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — "Show additional signup options"
 *
 * With the AML form feature flag on (see /config), the first tap launches
 * the AML form verification. The widget is closed and the sequence below
 * runs once the backend reports the conversation as FINISHED (and on later
 * taps).
 *
 * Read top-to-bottom. Each `at` value is ms after the toggle is tapped.
 *
 *    0ms   chevron flips 0° → 180°, label crossfades Show → Hide
 *    0ms   panel height springs 0 → auto (buttons above glide up)
 *  120ms   "Fill out the form" rises in: y 16 → 0, scale 0.94 → 1, blur 6px → 0
 *
 * Collapse: everything returns to stage 0 at once.
 *
 * Country switch: action area fades out ↑, new country's actions rise in ↑
 * ───────────────────────────────────────────────────────── */

const TIMING = {
  panelOpen:  0,     // panel starts expanding
  formButton: 120,   // form button rises in
}

/* Toggle row (label + chevron) */
const TOGGLE = {
  chevronOpen:  180,   // degrees when expanded
  labelShift:   6,     // px the label slides during crossfade
  spring: { type: "spring" as const, stiffness: 400, damping: 28 },
  labelFade: { duration: 0.15 },
}

/* Collapsible panel wrapper */
const PANEL = {
  spring: { type: "spring" as const, stiffness: 300, damping: 30 },
}

/* "Fill out the form" button */
const FORM_BUTTON = {
  offsetY:      16,    // px it rises from
  initialScale: 0.94,  // scale before appearing
  initialBlur:  6,     // px blur before appearing
  spring: { type: "spring" as const, stiffness: 350, damping: 22 },
}

/* Country action area swap */
const COUNTRY_SWAP = {
  enterY: 16,   // px new actions rise from
  exitY:  -8,   // px old actions drift to
  spring: { type: "spring" as const, stiffness: 350, damping: 28 },
  exit:   { duration: 0.15 },
}

/* Country dropdown */
const DROPDOWN = {
  offsetY:      -6,    // px it drops from
  initialScale: 0.96,  // scale before opening
  transition:   { duration: 0.18, ease: "easeOut" as const },
}

const t = {
  prompt: "Tap to initiate ID verification",
  form: "Fill out the form",
  formNotConfigured: "Set NEXT_PUBLIC_FORM_URL to point this button at your own form.",
  showMore: "Show additional signup options",
  showLess: "Hide additional signup options",
  verifying: "Verifying…",
  successTitle: "Identity Verified",
  successSubtitle: "Your identity has been successfully confirmed.",
  pendingTitle: "Still processing",
  pendingSubtitle: "We haven't received the verification result yet. It can take a moment for the webhook to arrive.",
  retry: "Check again",
  name: "Name",
  verifyAgain: "Verify again",
  fetching: "Loading your data…",
  gateTimeout: "Timed out waiting for the verification result.",
  powered: "Powered by Authologic OmniID webSDK",
  source: "Source code",
}

// Footer link to the source code; point it at your fork if you have one
const SOURCE_URL = process.env.NEXT_PUBLIC_SOURCE_URL || "https://github.com/JarekSyg/eid-frontend-harness"

const DEFAULT_COUNTRY: CountryCode = "ro"

const FORM_URL = process.env.NEXT_PUBLIC_FORM_URL

/* How long to wait for the webhook result */
const RESULT_WAIT = {
  successView: 30 * 1000,     // after returning from the final redirect
  amlGate:     10 * 60 * 1000, // while the user fills out the AML form
}

const LANG = "en"

// Official d-you Wallet button artwork (pill chrome stripped — drawn by PillButton so the width matches other buttons)
const D_YOU_BUTTON: Record<string, string> = {
  en: "/wallets/d-you-wallet/button_verify_en.svg",
  de: "/wallets/d-you-wallet/button_verify_de.svg",
}

const Spinner = ({ className }: { className: string }) => (
  <motion.span
    className={`block border-2 rounded-full ${className}`}
    animate={{ rotate: 360 }}
    transition={{ repeat: Infinity, duration: 0.75, ease: "linear" }}
  />
)

const PILL_VARIANTS = {
  primary: "text-white shadow-md bg-[#1a6ef5]",
  elevated: "bg-white text-gray-900 border border-gray-200 shadow-[0_4px_16px_rgba(0,0,0,0.06)]",
  outline: "bg-white text-gray-900 border-2 border-gray-900",
  // Matches the chrome of the official d-you Wallet button SVG
  brand: "bg-black text-white border border-[#A6A6A6]",
  mObywatel: "bg-[#dc143c] text-[#EFEDF0] border border-[#F00035] shadow-[0_4px_16px_rgba(0,0,0,0.06)]",
}

const DARK_VARIANTS = new Set<keyof typeof PILL_VARIANTS>(["primary", "brand", "mObywatel"])

/* eslint-disable @next/next/no-img-element -- static brand artwork, sized by CSS */
/** Per-method button design. `imageOnly` buttons use the artwork as the label (alt text = method label). */
const METHOD_DESIGN: Record<MethodId, { variant: keyof typeof PILL_VARIANTS; icon?: ReactNode; imageOnly?: boolean }> = {
  global:         { variant: "primary" },
  mObywatel:      { variant: "mObywatel", icon: <img src="/wallets/mobywatel.png" alt="" className="w-14 h-14" /> },
  bank:           { variant: "outline",   icon: <Landmark className="w-6 h-6" strokeWidth={1.75} /> },
  roWallet:       { variant: "elevated",  icon: <img src="/wallets/eu_wallet.svg" alt="" width={84} height={28} className="h-7 w-auto" /> },
  carteraDigital: { variant: "elevated",  icon: <img src="/wallets/cartera_digital_mark.png" alt="" className="h-7 w-auto" /> },
  clave:          { variant: "outline",   icon: <KeyRound className="w-6 h-6" strokeWidth={1.75} /> },
  dYouWallet:     {
    variant: "brand",
    imageOnly: true,
    icon: <img src={D_YOU_BUTTON[LANG] ?? D_YOU_BUTTON.en} alt={METHODS.dYouWallet.label} className="h-full w-auto" />,
  },
  ausweisApp:     { variant: "elevated",  icon: <img src="/wallets/ausweisapp_logo.svg" alt="" className="w-7 h-7" /> },
  amlForm:        { variant: "outline" },
}
/* eslint-enable @next/next/no-img-element */

function PillButton({
  icon,
  label,
  onClick,
  loading = false,
  disabled = false,
  variant,
}: {
  icon?: ReactNode
  /** Omit for image-only buttons — give the image an `alt` so the button still has an accessible name */
  label?: string
  onClick: () => void
  loading?: boolean
  disabled?: boolean
  variant: keyof typeof PILL_VARIANTS
}) {
  return (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      whileTap={{ scale: 0.97 }}
      className={`relative flex h-16 w-full items-center justify-center gap-3 rounded-full text-[17px] font-semibold whitespace-nowrap transition-opacity disabled:opacity-60 ${PILL_VARIANTS[variant]}`}
    >
      {loading ? (
        <>
          <Spinner className={`w-4 h-4 ${DARK_VARIANTS.has(variant) ? "border-white/30 border-t-white" : "border-gray-300 border-t-gray-900"}`} />
          {t.verifying}
        </>
      ) : (
        <>
          {icon}
          {label}
        </>
      )}
    </motion.button>
  )
}

function CountrySwitcher({ country, countries, onChange }: { country: CountryCode; countries: CountryCode[]; onChange: (c: CountryCode) => void }) {
  const [open, setOpen] = useState(false)
  const current = COUNTRIES.find(c => c.code === country)!
  const options = COUNTRIES.filter(c => countries.includes(c.code))

  return (
    <div className="absolute right-4 top-1/2 -translate-y-1/2 z-30">
      {open && <div className="fixed inset-0" onClick={() => setOpen(false)} />}
      <button
        onClick={() => setOpen(!open)}
        aria-label={`Select country (current: ${current.name})`}
        aria-expanded={open}
        className={`relative w-10 h-10 rounded-full flex items-center justify-center transition-colors hover:bg-gray-100 hover:text-gray-700 ${open ? "bg-gray-100 text-gray-700" : "text-gray-500"}`}
      >
        <Globe className="w-5 h-5" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: DROPDOWN.offsetY, scale: DROPDOWN.initialScale }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: DROPDOWN.offsetY, scale: DROPDOWN.initialScale }}
            transition={DROPDOWN.transition}
            className="absolute right-0 mt-2 w-48 bg-white rounded-2xl shadow-xl border border-gray-100 py-1.5 origin-top-right"
          >
            {options.map(c => (
              <button
                key={c.code}
                onClick={() => {
                  onChange(c.code)
                  setOpen(false)
                }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-800 hover:bg-gray-50 transition-colors"
              >
                <span className="text-lg leading-none">{c.flag}</span>
                <span className={`flex-1 text-left ${c.code === country ? "font-semibold" : ""}`}>{c.name}</span>
                {c.code === country && <Check className="w-4 h-4 text-gray-900" />}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function Header({ children }: { children?: ReactNode }) {
  return (
    <header className="relative z-20 flex h-24 shrink-0 items-center justify-center px-4">
      <div className="flex h-9 items-center justify-center">
        <BrandLogo className="h-7 max-w-[180px]" />
      </div>
      {children}
    </header>
  )
}

function AdditionalSignupOptions({
  disabled,
  unlocked,
  loading,
  onUnlock,
}: {
  disabled: boolean
  unlocked: boolean
  loading: boolean
  /** When set, the first tap runs this verification instead of expanding (AML form feature flag) */
  onUnlock?: () => void
}) {
  const [expanded, setExpandedState] = useState(unlocked)
  const [revealStage, setRevealStage] = useState(0)
  const [wasUnlocked, setWasUnlocked] = useState(unlocked)
  const stage = expanded ? revealStage : 0

  // Every expand replays the storyboard from stage 0
  const setExpanded = (next: boolean) => {
    setExpandedState(next)
    setRevealStage(0)
  }

  // Auto-expand the moment the verification completes (adjusting state during render, not in an effect)
  if (unlocked !== wasUnlocked) {
    setWasUnlocked(unlocked)
    if (unlocked) setExpanded(true)
  }

  useEffect(() => {
    if (!expanded) return
    const timers = [
      setTimeout(() => setRevealStage(1), TIMING.panelOpen),
      setTimeout(() => setRevealStage(2), TIMING.formButton),
    ]
    return () => timers.forEach(clearTimeout)
  }, [expanded])

  return (
    <>
      <button
        onClick={() => (onUnlock && !unlocked ? onUnlock() : setExpanded(!expanded))}
        disabled={disabled}
        aria-expanded={expanded}
        className="flex items-center gap-2 py-2 text-[15px] text-gray-500 transition-opacity disabled:opacity-60"
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={loading ? "loading" : expanded ? "hide" : "show"}
            initial={{ opacity: 0, y: TOGGLE.labelShift }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -TOGGLE.labelShift }}
            transition={TOGGLE.labelFade}
          >
            {loading ? t.verifying : expanded ? t.showLess : t.showMore}
          </motion.span>
        </AnimatePresence>
        {loading ? (
          <Spinner className="w-4 h-4 border-gray-300 border-t-gray-500" />
        ) : (
          <motion.span animate={{ rotate: expanded ? TOGGLE.chevronOpen : 0 }} transition={TOGGLE.spring}>
            <ChevronDown className="w-4 h-4" />
          </motion.span>
        )}
      </button>

      <motion.div
        initial={false}
        animate={{ height: stage >= 1 ? "auto" : 0 }}
        transition={PANEL.spring}
        className="w-full overflow-hidden"
      >
        <motion.div
          initial={false}
          animate={{
            opacity: stage >= 2 ? 1 : 0,
            y:       stage >= 2 ? 0 : FORM_BUTTON.offsetY,
            scale:   stage >= 2 ? 1 : FORM_BUTTON.initialScale,
            filter:  stage >= 2 ? "blur(0px)" : `blur(${FORM_BUTTON.initialBlur}px)`,
          }}
          transition={FORM_BUTTON.spring}
          className="pt-1 pb-1"
        >
          <PillButton
            variant="outline"
            icon={<SquarePen className="w-6 h-6" strokeWidth={1.75} />}
            label={t.form}
            disabled={disabled || stage < 2}
            onClick={() => (FORM_URL ? window.location.assign(FORM_URL) : toast.info(t.formNotConfigured))}
          />
        </motion.div>
      </motion.div>
    </>
  )
}

/** Flattens a nested result into key → value pairs for display */
function flatten(obj: Record<string, unknown>, out: Record<string, unknown> = {}) {
  for (const [k, v] of Object.entries(obj)) {
    if (v !== null && typeof v === "object" && !Array.isArray(v)) flatten(v as Record<string, unknown>, out)
    else out[k] = v
  }
  return out
}

const isPhotoValue = (v: unknown): v is string =>
  typeof v === "string" && (v.startsWith("data:image/") || (v.length > 300 && /^[A-Za-z0-9+/=\s]+$/.test(v)))

function ResultView({ resultKey }: { resultKey: string }) {
  const [state, setState] = useState<{ status: "fetching" } | { status: "pending" } | { status: "done"; result: StoredResult }>({ status: "fetching" })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    waitForResult(resultKey, { until: isFinished, timeoutMs: RESULT_WAIT.successView, signal: controller.signal })
      .then(result => {
        if (controller.signal.aborted) return
        setState(result ? { status: "done", result } : { status: "pending" })
      })
    return () => controller.abort()
  }, [resultKey, attempt])

  useEffect(() => {
    if (state.status !== "done") return
    confetti({
      particleCount: 120,
      spread: 80,
      origin: { y: 0.55 },
      colors: ["#1a6ef5", "#a8edcc", "#fcd9b0", "#f472b6", "#a78bfa"],
    })
  }, [state.status])

  const verifyAgain = (
    <Link href="/" className="text-sm text-gray-400 hover:text-gray-600 transition-colors mt-2">
      {t.verifyAgain}
    </Link>
  )

  let body: ReactNode
  if (state.status === "fetching") {
    body = (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-3 text-gray-400 text-sm">
        <Spinner className="w-6 h-6 border-gray-200 border-t-blue-500" />
        {t.fetching}
      </motion.div>
    )
  } else if (state.status === "pending") {
    body = (
      <div className="flex flex-col items-center gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">{t.pendingTitle}</h1>
          <p className="text-sm text-gray-400 mt-1">{t.pendingSubtitle}</p>
        </div>
        <button
          onClick={() => {
            setState({ status: "fetching" })
            setAttempt(a => a + 1)
          }}
          className="text-sm font-medium text-[#1a6ef5]"
        >
          {t.retry}
        </button>
        {verifyAgain}
      </div>
    )
  } else {
    const flat = flatten(state.result.result ?? {})
    const firstName = flat["PERSON_NAME_FIRSTNAME"] ?? flat["firstName"]
    const lastName = flat["PERSON_NAME_LASTNAME"] ?? flat["lastName"]
    const fullName = firstName && lastName ? `${firstName} ${lastName}` : null

    // Detect photo key — key name contains photo/portrait keyword, value is a data URI or long base64
    const photoKey = Object.keys(flat).find(k => /photo|portrait/i.test(k) && isPhotoValue(flat[k]))
      ?? Object.keys(flat).find(k => isPhotoValue(flat[k]))
    const rawPhoto = photoKey ? (flat[photoKey] as string) : null
    const photoSrc = rawPhoto && (rawPhoto.startsWith("data:") ? rawPhoto : `data:image/jpeg;base64,${rawPhoto}`)

    const skipKeys = new Set(["PERSON_NAME_FIRSTNAME", "PERSON_NAME_LASTNAME", "firstName", "lastName", "status", ...(photoKey ? [photoKey] : [])])
    const extraFields = Object.entries(flat).filter(([k]) => !skipKeys.has(k))

    body = (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 22 }}
        className="flex flex-col items-center gap-5 w-full"
      >
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center text-green-700">
          <Check className="w-8 h-8" strokeWidth={2.5} />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">{t.successTitle}</h1>
          <p className="text-sm text-gray-400 mt-1">{t.successSubtitle}</p>
        </div>

        {photoSrc && (
          <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-white shadow-lg">
            {/* eslint-disable-next-line @next/next/no-img-element -- base64 data URL from the verification result */}
            <img src={photoSrc} alt="ID photo" className="w-full h-full object-cover" />
          </div>
        )}

        {fullName && (
          <div className="w-full rounded-2xl border border-gray-100 bg-gray-50 px-6 py-4 text-left">
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">{t.name}</p>
            <p className="text-lg font-semibold text-gray-900">{fullName}</p>
          </div>
        )}

        {extraFields.map(([key, value]) => (
          <div key={key} className="w-full rounded-2xl border border-gray-100 bg-gray-50 px-6 py-4 text-left">
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">{key.replace(/PERSON_|_/g, " ").trim()}</p>
            <p className="text-sm font-medium text-gray-900 break-words">
              {typeof value === "object" ? JSON.stringify(value) : String(value)}
            </p>
          </div>
        ))}

        {verifyAgain}
      </motion.div>
    )
  }

  return (
    <div className="min-h-dvh bg-white flex flex-col">
      <Header />
      <div className="flex flex-1 items-center justify-center pb-12">
        <div className="flex flex-col items-center gap-6 px-8 max-w-sm w-full text-center">{body}</div>
      </div>
    </div>
  )
}

function HarnessPage() {
  const searchParams = useSearchParams()
  const [loadingMethod, setLoadingMethod] = useState<MethodId | null>(null)
  const [widgetOpen, setWidgetOpen] = useState(false)
  const savedCountry = useSavedCountry() ?? DEFAULT_COUNTRY
  const [amlFormUnlocked, setAmlFormUnlocked] = useState(false)
  const pendingWait = useRef<AbortController | null>(null)
  const config = useHarnessConfig()
  const visibleCountries = getVisibleCountries(config)
  // Fall back to the first visible country if the saved one is hidden for this logo
  const country = visibleCountries.includes(savedCountry) ? savedCountry : visibleCountries[0]

  // Set by the conversation's returnUrl after the final redirect
  const resultKey = searchParams.get("verification")

  // Stop any result polling if the page goes away
  useEffect(() => () => pendingWait.current?.abort(), [])

  const resetWidget = () => {
    setWidgetOpen(false)
    setLoadingMethod(null)
  }

  /**
   * Full verification flow:
   *  1. backend creates the conversation
   *  2. widget opens for it
   *  3a. normally the widget redirects to returnUrl and the result view takes over, or
   *  3b. with `onFinished`, we stay on the page and wait for the webhook to report FINISHED
   */
  const verify = async (method: MethodId, onFinished?: () => void) => {
    setLoadingMethod(method)
    pendingWait.current?.abort()
    const wait = new AbortController()
    pendingWait.current = wait

    try {
      const conversationId = await createConversation(method)
      // The widget mounts into the container, so make sure it is visible first
      flushSync(() => setWidgetOpen(true))

      await openWidget({
        conversationId,
        method,
        stayOnPage: !!onFinished,
        onClose: reason => {
          if (reason === "completed" && onFinished) return // keep the spinner until the webhook confirms
          wait.abort()
          setLoadingMethod(null)
          setTimeout(() => setWidgetOpen(false), WIDGET_UNMOUNT_DELAY_MS)
        },
      })

      if (!onFinished) return
      const result = await waitForResult(conversationId, { until: isFinished, timeoutMs: RESULT_WAIT.amlGate, signal: wait.signal })
      if (wait.signal.aborted) return // user closed the widget
      await closeWidget()
      resetWidget()
      if (result) onFinished()
      else toast.error(t.gateTimeout)
    } catch (err) {
      console.error(err)
      toast.error(err instanceof Error ? err.message : "Failed to start verification")
      resetWidget()
    }
  }

  if (resultKey) return <ResultView resultKey={resultKey} />

  const methods = COUNTRY_METHODS[country] ?? ["global" as const]
  const hint = COUNTRY_HINTS[country]

  return (
    <div className="min-h-dvh bg-white flex flex-col">
      <Header>
        <Link
          href="/config"
          aria-label="Configuration"
          className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
        >
          <Settings className="w-5 h-5" />
        </Link>
        {visibleCountries.length > 1 && (
          <CountrySwitcher country={country} countries={visibleCountries} onChange={saveCountry} />
        )}
      </Header>

      <div id={WIDGET_CONTAINER_ID} className={widgetOpen ? "fixed inset-0 z-50" : "hidden"} />

      <main className="flex flex-1 flex-col justify-end px-6 pb-10">
        <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-3">
          <p className="mb-1 text-base text-gray-600">{t.prompt}</p>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={country}
              initial={{ opacity: 0, y: COUNTRY_SWAP.enterY }}
              animate={{ opacity: 1, y: 0, transition: COUNTRY_SWAP.spring }}
              exit={{ opacity: 0, y: COUNTRY_SWAP.exitY, transition: COUNTRY_SWAP.exit }}
              className="flex w-full flex-col items-center gap-3"
            >
              {methods.map(method => {
                const { variant, icon, imageOnly } = METHOD_DESIGN[method]
                return (
                  <PillButton
                    key={method}
                    variant={variant}
                    icon={icon}
                    label={imageOnly ? undefined : METHODS[method].label}
                    loading={loadingMethod === method}
                    disabled={!!loadingMethod}
                    onClick={() => verify(method)}
                  />
                )
              })}
              {hint && <p className="max-w-xs text-center text-xs leading-relaxed text-gray-400">{hint}</p>}
              <AdditionalSignupOptions
                disabled={!!loadingMethod}
                unlocked={!!config.amlFormGate && amlFormUnlocked}
                loading={loadingMethod === "amlForm"}
                onUnlock={config.amlFormGate ? () => verify("amlForm", () => setAmlFormUnlocked(true)) : undefined}
              />
            </motion.div>
          </AnimatePresence>
          <p className="mt-2 text-xs text-gray-400 tracking-wide">
            {t.powered} ·{" "}
            <a href={SOURCE_URL} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:text-gray-600 hover:underline">
              {t.source}
            </a>
          </p>
        </div>
      </main>
    </div>
  )
}

export default function Page() {
  return (
    <Suspense>
      <Toaster position="top-center" richColors expand />
      <HarnessPage />
    </Suspense>
  )
}
