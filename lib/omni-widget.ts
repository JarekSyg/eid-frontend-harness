// SPDX-FileCopyrightText: 2026 Authologic Sp. z o.o.
// SPDX-License-Identifier: AGPL-3.0-only

"use client"

/**
 * Thin wrapper around @authologic/omni-websdk — the part of the harness to copy
 * into your own app.
 *
 * SDK docs: https://www.npmjs.com/package/@authologic/omni-websdk
 */
import type { CloseReason, WidgetConfig } from "@authologic/omni-websdk"
import { SKIP_COMPLETED_SCREEN, type MethodId } from "@/lib/methods"
import type { StoredResult } from "@/lib/result-store"

/** Id of the element the widget mounts into (the SDK's `divId`, default "authologic") */
export const WIDGET_CONTAINER_ID = "authologic"

/** The SDK unmounts itself 500 ms after onClose — keep the container around a bit longer */
export const WIDGET_UNMOUNT_DELAY_MS = 600

// The SDK touches `window` at import time, so load it lazily (and never during SSR)
const loadSdk = () => import("@authologic/omni-websdk")

/** Step 1 — ask our backend to create a conversation. Credentials never reach the browser. */
export async function createConversation(method: MethodId): Promise<string> {
  const res = await fetch("/api/conversations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ method }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.conversationId) throw new Error(data.error || "Failed to start verification")
  return data.conversationId
}

type OpenWidgetOptions = {
  conversationId: string
  method: MethodId
  onClose: (reason: CloseReason) => void
  /**
   * Take over the final "completed" redirect so the page stays put (the result
   * still arrives via webhook). Intermediate redirects — bank login, wallet
   * apps, OAuth — keep working normally.
   */
  stayOnPage?: boolean
}

/** Step 2 — mount the widget for that conversation */
export async function openWidget({ conversationId, method, onClose, stayOnPage = false }: OpenWidgetOptions) {
  const { init, hide } = await loadSdk()

  // init() doesn't tear down a previously mounted widget, so always start clean
  hide()

  const config: WidgetConfig = {
    widgetId: process.env.NEXT_PUBLIC_AUTHOLOGIC_WIDGET_ID || "development_only",
    conversationId,
    environment: process.env.NEXT_PUBLIC_AUTHOLOGIC_ENVIRONMENT || "sandbox",
    divId: WIDGET_CONTAINER_ID,
    layout: "modal",
    language: "en",
    showCompletedScreen: !SKIP_COMPLETED_SCREEN.has(method),
    hooks: {
      onClose,
      onError: error => console.error("[OmniID]", error),
      ...(stayOnPage && {
        onOpenUrl: ({ reason }) => ({ handled: reason === "completed" }),
      }),
    },
  }
  init(config)
}

export async function closeWidget() {
  const { hide } = await loadSdk()
  hide()
}

/**
 * Step 3 — confirm the outcome on the backend. The widget's onClose only tells
 * you the UI flow ended; the webhook result is what you should trust.
 *
 * Polls until `until(result)` is true, the timeout elapses, or `signal` aborts.
 */
export async function waitForResult(
  key: string,
  {
    until,
    intervalMs = 1500,
    timeoutMs = 2 * 60 * 1000,
    signal,
  }: { until: (result: StoredResult) => boolean; intervalMs?: number; timeoutMs?: number; signal?: AbortSignal },
): Promise<StoredResult | null> {
  const deadline = Date.now() + timeoutMs
  while (!signal?.aborted && Date.now() < deadline) {
    try {
      const res = await fetch(`/api/conversations/${encodeURIComponent(key)}`, { signal, cache: "no-store" })
      if (res.ok) {
        const result: StoredResult = await res.json()
        if (until(result)) return result
      }
    } catch {
      if (signal?.aborted) break
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs))
  }
  return null
}

export const isFinished = (result: StoredResult) => result.status === "FINISHED"
