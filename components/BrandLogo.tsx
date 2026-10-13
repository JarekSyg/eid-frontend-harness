// SPDX-FileCopyrightText: 2026 Authologic Sp. z o.o.
// SPDX-License-Identifier: MIT

"use client"

import { resolveLogo, useHarnessConfig, useHydrated, type ResolvedLogo } from "@/lib/harness-config"

/** Renders a resolved logo, or the logo saved in the client-side harness config */
export default function BrandLogo({ logo, className = "" }: { logo?: ResolvedLogo; className?: string }) {
  const config = useHarnessConfig()
  const hydrated = useHydrated()
  const { src, alt } = logo ?? resolveLogo(config)

  // Skip the server render so users with a custom logo never see a flash of the default one
  if (!hydrated) return null

  // eslint-disable-next-line @next/next/no-img-element -- logos can be user-uploaded data URLs
  return <img src={src} alt={alt} className={`w-auto object-contain ${className}`} />
}
