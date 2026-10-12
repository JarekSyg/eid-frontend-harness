// SPDX-FileCopyrightText: 2026 Authologic Sp. z o.o.
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Server-side Authologic API client. Never import this from client components —
 * it reads API credentials from the environment.
 *
 * API reference: https://developer.authologic.com
 */

const CONTENT_TYPE = "application/vnd.authologic.v1.1+json"

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
