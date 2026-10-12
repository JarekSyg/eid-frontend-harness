// SPDX-FileCopyrightText: 2026 Authologic Sp. z o.o.
// SPDX-License-Identifier: AGPL-3.0-only

import { timingSafeEqual } from "node:crypto"
import { NextResponse } from "next/server"
import { isValidResultKey, saveResult } from "@/lib/result-store"

const tokenMatches = (actual: string | null, expected: string) =>
  !!actual && actual.length === expected.length && timingSafeEqual(Buffer.from(actual), Buffer.from(expected))

/**
 * Receives conversation updates from Authologic (the `callbackUrl` set when the
 * conversation was created). This — not the widget's onClose hook — is the
 * source of truth for the verification outcome.
 */
export async function POST(request: Request) {
  const secret = process.env.WEBHOOK_SECRET
  // Fail closed in production: an unauthenticated webhook lets anyone post fake results
  if (!secret && process.env.NODE_ENV === "production") {
    console.error("WEBHOOK_SECRET is not set — rejecting webhook")
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 })
  }
  if (secret && !tokenMatches(new URL(request.url).searchParams.get("token"), secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const payload = await request.json().catch(() => null)
  const conversation = payload?.payload?.conversation
  if (!isValidResultKey(conversation?.id) || (conversation.userKey != null && !isValidResultKey(conversation.userKey))) {
    return NextResponse.json({ error: "Unexpected payload" }, { status: 400 })
  }

  const value = { status: conversation.status, result: conversation.result }
  saveResult(conversation.id, value)
  // The return URL carries our userKey, so index by it as well
  if (conversation.userKey) saveResult(conversation.userKey, value)

  return NextResponse.json({ received: true })
}
