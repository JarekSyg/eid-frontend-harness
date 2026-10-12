// SPDX-FileCopyrightText: 2026 Authologic Sp. z o.o.
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { getResult } from "@/lib/result-store"

/**
 * Returns the webhook-delivered status/result for a conversation id or userKey.
 *
 * DEMO ONLY: anyone holding the id can read the result. In production, bind
 * results to the authenticated user's session and only return what the UI needs.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const stored = getResult(id)
  if (!stored) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(stored, { headers: { "Cache-Control": "no-store" } })
}
