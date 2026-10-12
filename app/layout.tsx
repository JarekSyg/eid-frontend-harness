// SPDX-FileCopyrightText: 2026 Authologic Sp. z o.o.
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata, Viewport } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "eID Frontend Harness",
  description: "Reference integration of the Authologic OmniID web SDK for eID and digital-wallet verification.",
}

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  )
}
