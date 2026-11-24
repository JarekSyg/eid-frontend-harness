// SPDX-FileCopyrightText: 2026 Authologic Sp. z o.o.
// SPDX-License-Identifier: MIT

import { NextResponse } from "next/server"
import { describeCallbackSignature, verifyCallbackSignature } from "@/lib/authologic"
import { isValidResultKey, saveResult } from "@/lib/result-store"

/**
 * Receives conversation updates from Authologic (the `callbackUrl` set when the
 * conversation was created). This — not the widget's onClose hook — is the
 * source of truth for the verification outcome.
 */
export async function POST(request: Request) {
  const signKey = process.env.AUTHOLOGIC_SIGN_KEY
  // Fail closed in production: an unauthenticated webhook lets anyone post fake results
  if (!signKey && process.env.NODE_ENV === "production") {
    console.error("AUTHOLOGIC_SIGN_KEY is not set — rejecting webhook")
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 })
  }

  // The signature covers the exact bytes sent, so verify before parsing
  const rawBody = await request.text()
  const { headers } = request
  const signature = headers.get("x-signature")
  const timestamp = headers.get("x-signature-timestamp")
  const debug = process.env.WEBHOOK_DEBUG === "1"
  if (debug) {
    console.log("[webhook] received", {
      contentType: headers.get("content-type"),
      contentLength: headers.get("content-length"),
      userAgent: headers.get("user-agent"),
      forwardedFor: headers.get("x-forwarded-for"),
      ...(signKey && describeCallbackSignature(rawBody, signature, timestamp, signKey)),
    })
  }
  if (signKey) {
    const check = verifyCallbackSignature(rawBody, signature, timestamp, signKey)
    if (!check.ok) {
      console.warn(`[webhook] rejected: ${check.reason}`)
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
    }
  }

  let payload
  try {
    payload = JSON.parse(rawBody)
  } catch {
    payload = null
  }
  const conversation = payload?.payload?.conversation
  if (debug) {
    console.log("[webhook] payload", {
      eventId: payload?.id,
      target: payload?.target,
      event: payload?.event,
      conversationId: conversation?.id,
      userKey: conversation?.userKey,
      status: conversation?.status,
    })
  }
  if (!isValidResultKey(conversation?.id) || (conversation.userKey != null && !isValidResultKey(conversation.userKey))) {
    console.warn("[webhook] rejected: unexpected payload shape")
    return NextResponse.json({ error: "Unexpected payload" }, { status: 400 })
  }

  const value = { status: conversation.status, result: conversation.result }
  saveResult(conversation.id, value)
  // The return URL carries our userKey, so index by it as well
  if (conversation.userKey) saveResult(conversation.userKey, value)

  return NextResponse.json({ received: true })
}
