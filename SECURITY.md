# Security policy

## Reporting a vulnerability

Please **do not** report security vulnerabilities in public issues, discussions or pull requests.

Report them privately through GitHub instead:
[**Report a vulnerability**](https://github.com/JarekSyg/eid-frontend-harness/security/advisories/new)
(Security tab → "Report a vulnerability").

Please include:

- A description of the issue and its impact
- Steps to reproduce, or a proof of concept
- Affected files, versions or commits, if known

You should get an acknowledgement within a few business days. We'll keep you updated while we work on a fix and credit
you in the advisory unless you prefer otherwise.

## Scope

In scope: the code in this repository — the Next.js app, its API routes and the integration helpers in `lib/`.

Out of scope:

- **The Authologic OmniID web SDK** (`@authologic/omni-websdk`) and the Authologic platform. Report those to Authologic
  directly.
- Shortcuts that this repository documents as demo-only in the
  [README](README.md#before-going-to-production), such as file-based result storage or unauthenticated result
  access. Reports that show those shortcuts are more dangerous than documented are still welcome.
- Vulnerabilities in third-party dependencies that are already publicly known. Dependabot keeps those updated.

## Supported versions

Only the latest commit on the `main` branch is supported.
