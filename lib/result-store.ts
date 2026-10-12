// SPDX-FileCopyrightText: 2026 Authologic Sp. z o.o.
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Minimal store for verification results delivered by the Authologic webhook.
 *
 * DEMO ONLY: results are written as JSON files on local disk and expire after
 * an hour. In production use a real database, encrypt personal data at rest,
 * and apply your own retention policy.
 */
import fs from "node:fs"
import path from "node:path"

const STORAGE_DIR = path.join(process.cwd(), ".verification-results")
const TTL_MS = 60 * 60 * 1000
// Keys come from URLs/webhooks — only allow safe filename characters
const SAFE_KEY = /^[A-Za-z0-9_-]{1,128}$/

export const isValidResultKey = (key: unknown): key is string => typeof key === "string" && SAFE_KEY.test(key)

export type StoredResult = {
  /** Conversation status from the webhook, e.g. "FINISHED" */
  status?: string
  /** `conversation.result` from the webhook payload */
  result?: Record<string, unknown>
  updatedAt: number
}

const fileFor = (key: string) => {
  if (!SAFE_KEY.test(key)) throw new Error("Invalid result key")
  return path.join(STORAGE_DIR, `${key}.json`)
}

export function saveResult(key: string, value: Omit<StoredResult, "updatedAt">) {
  fs.mkdirSync(STORAGE_DIR, { recursive: true })
  fs.writeFileSync(fileFor(key), JSON.stringify({ ...value, updatedAt: Date.now() } satisfies StoredResult))
}

export function getResult(key: string): StoredResult | null {
  if (!SAFE_KEY.test(key)) return null
  const file = fileFor(key)
  if (!fs.existsSync(file)) return null
  try {
    const stored: StoredResult = JSON.parse(fs.readFileSync(file, "utf-8"))
    if (Date.now() - stored.updatedAt > TTL_MS) {
      fs.unlinkSync(file)
      return null
    }
    return stored
  } catch {
    return null
  }
}
