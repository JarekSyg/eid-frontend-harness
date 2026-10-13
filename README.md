# eID Frontend Harness

[![CI](https://github.com/JarekSyg/eid-frontend-harness/actions/workflows/ci.yml/badge.svg)](https://github.com/JarekSyg/eid-frontend-harness/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A reference frontend showing how to integrate the [Authologic OmniID web SDK](https://www.npmjs.com/package/@authologic/omni-websdk)
for eID and digital-wallet identity verification: national eIDs, EUDI wallets, bank identity and more, all behind one
widget.

It's a small Next.js app with a mobile-first sign-up screen. Pick a country, tap a verification method, and the OmniID
widget takes over. When the flow finishes, your backend receives the result by webhook and the page shows it.

> **Status:** reference/demo code. It shows the integration pattern. It is not a production service — see
> [Before going to production](#before-going-to-production).

## Contents

- [How it works](#how-it-works)
- [Where to look](#where-to-look)
- [Getting started](#getting-started)
- [Configuration](#configuration)
- [Troubleshooting](#troubleshooting)
- [Before going to production](#before-going-to-production)
- [Branding](#branding)
- [Contributing](#contributing)
- [License](#license)

## How it works

```
Browser                         Your backend (Next.js API)           Authologic
───────                         ──────────────────────────           ──────────
tap "Sign up with …"
  │  POST /api/conversations {method}
  │ ──────────────────────────────▶  map method → strategy
  │                                  POST /api/conversations  ───────▶ create conversation
  │  ◀──────────── {conversationId} ◀─────────────────────────────────
  │
init({ widgetId, conversationId })  ← @authologic/omni-websdk
  │  user verifies in the widget (may hop out to a wallet/bank and come back)
  │                                                      webhook ◀─── conversation FINISHED
  │                                  POST /api/webhook  ◀─────────────
  │                                  store result
  │  redirect to returnUrl (/?verification=<userKey>)
  │  GET /api/conversations/<key>  ─▶ return stored result
  ▼
show verified identity
```

Key points:

- **API credentials stay on the server.** The browser only sends a method id. The server maps it to a strategy from an
  allowlist ([`lib/methods.ts`](lib/methods.ts)), so clients can't start conversations with arbitrary strategies.
- **The webhook is the source of truth.** The widget's `onClose("completed")` only means the UI flow ended. The harness
  confirms the outcome by waiting for the backend to report the conversation as `FINISHED`.
- **One widget at a time.** `init()` doesn't tear down a previously mounted widget, so the harness calls `hide()` before
  every `init()`.

## Where to look

| File | What it shows |
| --- | --- |
| [`lib/omni-widget.ts`](lib/omni-widget.ts) | **The integration itself:** create a conversation, open the widget, wait for the backend result. Start here. |
| [`lib/authologic.ts`](lib/authologic.ts) | Server-side Authologic API client (credentials, request format) |
| [`app/api/conversations/route.ts`](app/api/conversations/route.ts) | Creating a conversation server-side (strategy allowlist, return and callback URLs) |
| [`app/api/webhook/route.ts`](app/api/webhook/route.ts) | Receiving and storing results from Authologic |
| [`lib/methods.ts`](lib/methods.ts) | Countries, verification methods and their strategy ids |
| [`app/page.tsx`](app/page.tsx) | The sign-up UI, including staying on the page while waiting for a result (AML form gate) |
| [`app/config/page.tsx`](app/config/page.tsx) | Per-browser demo settings: logo, visible countries, feature flags |

## Getting started

Requirements: Node.js 22+, pnpm (the version is pinned in `package.json`; run `corepack enable` to use it), and
Authologic API credentials ([developer.authologic.com](https://developer.authologic.com)).

```bash
pnpm install
cp .env.example .env.local   # fill in your credentials
pnpm dev
```

Open http://localhost:3000.

### Receiving webhooks locally

Authologic has to reach `/api/webhook`, and it rejects `localhost` callback URLs. Expose your dev server publicly and
set `APP_BASE_URL` to that URL:

```bash
ngrok http 3000
# then in .env.local:
APP_BASE_URL=https://<your-subdomain>.ngrok-free.app
WEBHOOK_SECRET=<a long random string>   # e.g. openssl rand -hex 32
```

Without a reachable webhook, verifications still run, but the result screen stays on "Still processing".

### Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Start the dev server |
| `pnpm build` / `pnpm start` | Production build and server |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | TypeScript, no emit |
| `pnpm check` | Lint and typecheck (what CI runs, plus a build) |

## Configuration

All settings are environment variables — see [`.env.example`](.env.example). Restart the dev server after changing
them; `NEXT_PUBLIC_*` values are inlined into the browser bundle at build time.

| Variable | Where | Purpose |
| --- | --- | --- |
| `AUTHOLOGIC_API_URL`, `AUTHOLOGIC_API_LOGIN`, `AUTHOLOGIC_API_KEY` | server | Authologic API access |
| `APP_BASE_URL` | server | Public HTTPS origin used for the return and webhook URLs |
| `WEBHOOK_SECRET` | server | Shared secret the webhook URL must carry (`?token=`). Required in production builds. |
| `NEXT_PUBLIC_AUTHOLOGIC_WIDGET_ID` | browser | Widget id (`development_only` works in sandbox) |
| `NEXT_PUBLIC_AUTHOLOGIC_ENVIRONMENT` | browser | `sandbox`, `production`, or a custom base URL. Must match the environment of `AUTHOLOGIC_API_URL`. |
| `NEXT_PUBLIC_FORM_URL` | browser | Optional target for the "Fill out the form" button |
| `NEXT_PUBLIC_SOURCE_URL` | browser | Optional footer link to the source code (defaults to this repository) |

**Strategies** are defined in [`lib/methods.ts`](lib/methods.ts). Which ones work depends on what's enabled for your
Authologic account, so adjust them to match.

The `/config` page (gear icon) changes demo presentation only — logo, visible countries, and the AML form gate. These
settings live in the browser's `localStorage`. Countries marked `wip` in [`lib/methods.ts`](lib/methods.ts) (currently
Brazil, Serbia, Belgium and Greece) are hidden by default and labelled "Work in progress" there; you can still switch
them on.

## Troubleshooting

In development, `POST /api/conversations` errors include the reason Authologic gave. In production builds the reason
only goes to the server log.

| Symptom | Cause and fix |
| --- | --- |
| `POST /api/conversations 502`, `callbackUrl … must be a valid URL` | The callback URL is `localhost` or otherwise unreachable. Set `APP_BASE_URL` to a public HTTPS origin. |
| `POST /api/conversations 502` with `401`/`403` from Authologic | Wrong `AUTHOLOGIC_API_LOGIN` / `AUTHOLOGIC_API_KEY`, or credentials for a different environment than `AUTHOLOGIC_API_URL`. |
| Widget logs `kernel error … API request failed: 404` | The widget is talking to a different Authologic environment than the backend. Set `NEXT_PUBLIC_AUTHOLOGIC_ENVIRONMENT` to match `AUTHOLOGIC_API_URL` and restart. |
| `hide() called but widget is not shown` | Harmless. The harness always calls `hide()` before `init()`. |
| Result screen stays on "Still processing" | The webhook never arrived. Check that `${APP_BASE_URL}/api/webhook` is reachable and that `WEBHOOK_SECRET` matches. |
| Webhook returns `503 Webhook not configured` | Production build without `WEBHOOK_SECRET`. Set it. |

## Before going to production

This harness cuts corners that a real integration must not:

- **Result storage.** Results are written as JSON files on local disk with a one-hour expiry
  ([`lib/result-store.ts`](lib/result-store.ts)). Use a database, encrypt personal data at rest, and apply your
  retention policy. Local files don't work across multiple instances either, and expired files are only removed when
  they are read.
- **Result access.** `GET /api/conversations/<id>` returns the result to anyone who knows the id. Tie results to your
  authenticated user session and return only what the UI needs.
- **Webhook authentication.** The harness checks a shared-secret token in the URL, which can end up in access logs.
  Follow Authologic's documentation for verifying webhooks in production.
- **SDK license.** `@authologic/omni-websdk` is proprietary. It's licensed for development and integration testing,
  and production use needs a separate agreement with Authologic. See the package's `LICENSE`.

## Branding

The header uses a fictional "Acme" placeholder logo (switchable in `/config`, where you can also upload your own). The
verification buttons use the official wallet and eID artwork in [`public/wallets/`](public/wallets) — mObywatel, EU
Digital Identity Wallet, Cartera Digital, d-you Wallet and AusweisApp. These names and logos are trademarks of their
respective owners, are **not** covered by this repository's license, and are shown only to identify each verification
method. Follow each owner's brand guidelines when you use them in your own product. The button designs are defined in
`METHOD_DESIGN` in [`app/page.tsx`](app/page.tsx). See [`NOTICE.md`](NOTICE.md) for the full list.

## Contributing

Issues and pull requests are welcome — see [`CONTRIBUTING.md`](CONTRIBUTING.md). Please report security issues
privately as described in [`SECURITY.md`](SECURITY.md), not in public issues. This project follows a
[Code of Conduct](CODE_OF_CONDUCT.md).

## License

Copyright © 2026 Authologic Sp. z o.o.

The code in this repository is released under the [MIT License](LICENSE). You can use, copy, modify and distribute it,
including in commercial and closed-source products, as long as you keep the copyright and license notice.

The MIT License does **not** cover:

- **The Authologic OmniID web SDK** (`@authologic/omni-websdk`). It's installed from npm, isn't part of this
  repository, and is proprietary — see [Before going to production](#before-going-to-production) and the package's
  own `LICENSE`.
- **Third-party trademarks and artwork** in `public/`, such as the wallet and eID logos.

See [`NOTICE.md`](NOTICE.md) for details.
