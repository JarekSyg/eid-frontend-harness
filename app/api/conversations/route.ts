// SPDX-FileCopyrightText: 2026 Authologic Sp. z o.o.
// SPDX-License-Identifier: MIT

import { NextResponse } from "next/server"
import { createConversation, getAppBaseUrl } from "@/lib/authologic"
import { isMethodId, METHODS } from "@/lib/methods"

/**
 * Starts a verification. The browser sends a method id; we map it to a strategy,
 * create the conversation with Authologic, and return its id for the web SDK.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const method: unknown = body?.method
  if (!isMethodId(method)) {
    return NextResponse.json({ error: "Unknown verification method" }, { status: 400 })
  }

  const baseUrl = getAppBaseUrl(request)
  // Our own reference for this attempt; Authologic echoes it back in the webhook
  const userKey = crypto.randomUUID()
  const secret = process.env.WEBHOOK_SECRET
  const callbackUrl = `${baseUrl}/api/webhook${secret ? `?token=${encodeURIComponent(secret)}` : ""}`

  try {
    const conversation = await createConversation({
      userKey,
      strategy: METHODS[method].strategy,
      // After external steps (bank login, wallet apps…) the user lands back here and the success view picks up the result
      returnUrl: `${baseUrl}/?verification=${userKey}`,
      callbackUrl,
    })
    return NextResponse.json({ conversationId: conversation.id })
  } catch (error) {
    console.error("Failed to create conversation:", error)
    // Surface the upstream reason during development only; it may contain details not meant for end users
    const detail = process.env.NODE_ENV === "development" && error instanceof Error ? `: ${error.message}` : ""
    return NextResponse.json({ error: `Failed to start verification${detail}` }, { status: 502 })
  }
}
