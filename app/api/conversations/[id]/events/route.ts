// SPDX-FileCopyrightText: 2026 Authologic Sp. z o.o.
// SPDX-License-Identifier: MIT

import { NextResponse } from "next/server"
import { getResult, isValidResultKey, subscribeToResult, type StoredResult } from "@/lib/result-store"

export const dynamic = "force-dynamic"

const HEARTBEAT_MS = 15 * 1000
const RECONNECT_MS = 3000
// Some browsers and proxies hold back the first bytes of a stream; pad past their thresholds
const PADDING = `: ${" ".repeat(2048)}\n\n`

/**
 * Server-Sent Events stream for a conversation id or userKey. The browser opens
 * it once and the result is pushed the moment the webhook delivers it, so there
 * is no polling. A result already stored before the stream opened is sent right away.
 *
 * DEMO ONLY: anyone holding the id can read the result. In production, bind
 * results to the authenticated user's session and only push what the UI needs.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isValidResultKey(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 })

  const encoder = new TextEncoder()
  let cleanup = () => {}

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false
      const send = (chunk: string) => {
        if (!closed) controller.enqueue(encoder.encode(chunk))
      }
      const push = (result: StoredResult) => send(`event: result\ndata: ${JSON.stringify(result)}\n\n`)

      // Subscribe before reading the store so a webhook landing in between isn't missed
      const unsubscribe = subscribeToResult(id, push)
      const heartbeat = setInterval(() => send(": keep-alive\n\n"), HEARTBEAT_MS)
      cleanup = () => {
        if (closed) return
        closed = true
        unsubscribe()
        clearInterval(heartbeat)
      }
      request.signal.addEventListener("abort", () => {
        if (closed) return
        cleanup()
        controller.close()
      })

      send(`retry: ${RECONNECT_MS}\n${PADDING}`)
      const stored = getResult(id)
      if (stored) push(stored)
    },
    cancel() {
      cleanup()
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      // no-transform keeps compression from buffering the stream
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}
