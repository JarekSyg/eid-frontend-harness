// SPDX-FileCopyrightText: 2026 Authologic Sp. z o.o.
// SPDX-License-Identifier: MIT

/**
 * Server-side Authologic API client. Never import this from client components —
 * it reads API credentials from the environment.
 *
 * API reference: https://developer.authologic.com
 */

import { createHash, createHmac, timingSafeEqual } from "node:crypto"

const CONTENT_TYPE = "application/vnd.authologic.v1.1+json"
/** Callbacks whose X-Signature-Timestamp is further than this from now are rejected */
const SIGNATURE_MAX_SKEW_MS = 5 * 60 * 1000

function getCredentials() {
  const { AUTHOLOGIC_API_URL: url, AUTHOLOGIC_API_LOGIN: login, AUTHOLOGIC_API_KEY: key } = process.env
  if (!url || !login || !key) {
    throw new Error("Set AUTHOLOGIC_API_URL, AUTHOLOGIC_API_LOGIN and AUTHOLOGIC_API_KEY (see .env.example)")
  }
  return { url: url.replace(/\/$/, ""), auth: `Basic ${Buffer.from(`${login}:${key}`).toString("base64")}` }
}

export type CreateConversationParams = {
  userKey: string
  strategy: string
  returnUrl: string
  callbackUrl: string
}

export type Conversation = { id: string; url?: string; status?: string }

export async function createConversation(params: CreateConversationParams): Promise<Conversation> {
  const { url, auth } = getCredentials()
  const res = await fetch(`${url}/api/conversations`, {
    method: "POST",
    headers: { Authorization: auth, Accept: CONTENT_TYPE, "Content-Type": CONTENT_TYPE },
    body: JSON.stringify({
      ...params,
      query: {
        identity: {
          // Ask for name plus a document photo (driver licence or ID card)
          requireOneOf: [
            ["PERSON_NAME_FIRSTNAME", "PERSON_NAME_LASTNAME", "PERSON_IDS_DRIVER_LICENCE_PHOTO"],
            ["PERSON_NAME_FIRSTNAME", "PERSON_NAME_LASTNAME", "PERSON_IDS_IDCARD_PHOTO"],
          ],
        },
      },
    }),
  })
  if (!res.ok) {
    throw new Error(`Authologic API responded ${res.status}: ${await res.text()}`)
  }
  return res.json()
}

/** Public origin of this app — used to build return/callback URLs Authologic can reach */
export function getAppBaseUrl(request: Request) {
  return (process.env.APP_BASE_URL || new URL(request.url).origin).replace(/\/$/, "")
}

/**
 * Verifies a callback came from Authologic: X-Signature must be the hex
 * HMAC-SHA256 of `<X-Signature-Timestamp>:<raw body>`, keyed with the Sign Key,
 * and the timestamp must be within 5 minutes of now.
 *
 * Pass the raw body exactly as received — re-serialised JSON won't match.
 * https://developer.authologic.com/docs/integration/callbacks#verification-of-the-message-sender
 */
export function verifyCallbackSignature(
  rawBody: string,
  signature: string | null,
  timestamp: string | null,
  signKey: string,
  now = Date.now(),
): { ok: true } | { ok: false; reason: string } {
  if (!signature) return { ok: false, reason: "missing X-Signature header" }
  if (!timestamp) return { ok: false, reason: "missing X-Signature-Timestamp header" }
  if (!/^\d+$/.test(timestamp)) return { ok: false, reason: "X-Signature-Timestamp is not milliseconds since epoch" }
  const skew = now - Number(timestamp)
  if (Math.abs(skew) > SIGNATURE_MAX_SKEW_MS) {
    return { ok: false, reason: `timestamp is ${skew} ms off the server clock (max ±${SIGNATURE_MAX_SKEW_MS})` }
  }
  const actual = Buffer.from(signature, "hex")
  const expected = signCallback(rawBody, timestamp, signKey)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
    ? { ok: true }
    : { ok: false, reason: "signature mismatch (wrong Sign Key, or body changed in transit)" }
}

const signCallback = (rawBody: string, timestamp: string, signKey: string) =>
  createHmac("sha256", signKey).update(`${timestamp}:${rawBody}`, "utf8").digest()

const fingerprint = (value: string | Buffer) => createHash("sha256").update(value).digest("hex").slice(0, 12)

/**
 * Debug details for a callback signature check. Contains no secrets or personal
 * data: the key and body appear only as length + SHA-256 fingerprint, and
 * signatures are truncated.
 */
export function describeCallbackSignature(
  rawBody: string,
  signature: string | null,
  timestamp: string | null,
  signKey: string,
  now = Date.now(),
) {
  const trimmedKey = signKey.trim().replace(/^["']|["']$/g, "")
  const matchesWithBytes = (key: Buffer) =>
    !!timestamp && createHmac("sha256", key).update(`${timestamp}:${rawBody}`, "utf8").digest("hex") === signature?.toLowerCase()
  const matchesWith = (key: string) => !!timestamp && signCallback(rawBody, timestamp, key).toString("hex") === signature?.toLowerCase()
  return {
    receivedSignature: signature && `${signature.slice(0, 12)}… (${signature.length} chars)`,
    expectedSignature: timestamp && `${signCallback(rawBody, timestamp, signKey).toString("hex").slice(0, 12)}…`,
    timestamp,
    skewMs: timestamp && /^\d+$/.test(timestamp) ? now - Number(timestamp) : null,
    body: { bytes: Buffer.byteLength(rawBody, "utf8"), sha256: fingerprint(rawBody) },
    key: { length: signKey.length, sha256: fingerprint(signKey) },
    // Common setup mistakes: stray whitespace/quotes, or a key meant to be decoded first
    ...(trimmedKey !== signKey && { matchesWithTrimmedKey: matchesWith(trimmedKey) }),
    ...(/^[0-9a-f]+$/i.test(signKey) && signKey.length % 2 === 0 && { matchesWithHexDecodedKey: matchesWithBytes(Buffer.from(signKey, "hex")) }),
    ...(/^[A-Za-z0-9+/]+={0,2}$/.test(signKey) && signKey.length % 4 === 0 && { matchesWithBase64DecodedKey: matchesWithBytes(Buffer.from(signKey, "base64")) }),
  }
}
