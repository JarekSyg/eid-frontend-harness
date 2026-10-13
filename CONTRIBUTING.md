# Contributing

Thanks for your interest in improving the eID Frontend Harness. This is reference code, so the bar is clarity: changes
should keep the integration easy to read and copy.

## Ground rules

- Be respectful — this project follows the [Code of Conduct](CODE_OF_CONDUCT.md).
- **Security issues** go through [`SECURITY.md`](SECURITY.md), never public issues.
- **Never commit credentials**, real webhook secrets, or personal data (including verification results or screenshots
  of them). `.env.local` and `.verification-results/` are git-ignored for this reason.
- For anything larger than a small fix, open an issue first so we can agree on the approach.

## Development setup

```bash
corepack enable          # uses the pnpm version pinned in package.json
pnpm install
cp .env.example .env.local
pnpm dev
```

See the [README](README.md#getting-started) for credentials and receiving webhooks locally.

## Before you open a pull request

```bash
pnpm check   # lint + typecheck
pnpm build
```

CI runs the same steps on every pull request.

- Keep pull requests focused on one change.
- Follow the existing style: TypeScript, functional React components, Tailwind classes, named constants for animation
  and timing values.
- Add the SPDX header to new source files:
  ```ts
  // SPDX-FileCopyrightText: 2026 Authologic Sp. z o.o.
  // SPDX-License-Identifier: MIT
  ```
- Update the README when you change configuration, setup steps or behaviour that integrators rely on.
- Don't add third-party logos or artwork unless the owner's brand guidelines allow it; list new ones in
  [`NOTICE.md`](NOTICE.md).

## Licensing of contributions

This project is licensed under the [MIT License](LICENSE). By submitting a contribution, you agree that it is licensed
under the same terms.

We use the [Developer Certificate of Origin](https://developercertificate.org/) (DCO). Sign off every commit to
certify that you wrote the change or otherwise have the right to submit it under the project's license:

```bash
git commit -s -m "Describe your change"
```

This adds a `Signed-off-by: Your Name <you@example.com>` line to the commit message.
