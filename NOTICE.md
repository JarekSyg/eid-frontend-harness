# Notice

eID Frontend Harness
Copyright (c) 2026 Authologic Sp. z o.o.

The source code in this repository is licensed under the [MIT License](LICENSE). This notice lists what that license
does not cover.

## Authologic OmniID Web SDK

This project depends on the Authologic OmniID Web SDK (the `@authologic/omni-websdk` package), which is installed
from npm and is **not** part of this repository. The SDK is proprietary software of Authologic Sp. z o.o., licensed
separately under the terms in the package's own `LICENSE` file. The MIT License of this repository grants no rights to
the SDK. At the time of writing, its terms allow development and integration testing only; production use requires a
separate agreement with Authologic.

## Third-party trademarks and artwork

The following files are not covered by the MIT License. They are trademarks or brand artwork of their respective owners,
included only to identify each verification method or the SDK vendor:

| Path | Owner / mark |
| --- | --- |
| `public/authologic-logo.svg` | Authologic Sp. z o.o. |
| `public/wallets/mobywatel.png` | mObywatel (Republic of Poland) |
| `public/wallets/eu_wallet.svg` | EU Digital Identity Wallet (European Commission) |
| `public/wallets/cartera_digital_mark.png` | Cartera Digital Beta (Government of Spain) |
| `public/wallets/d-you-wallet/` | d-you Wallet |
| `public/wallets/ausweisapp_logo.svg` | AusweisApp (Federal Republic of Germany) |

Use of these marks is subject to each owner's brand guidelines. Their inclusion does not imply endorsement.

## Third-party software

Dependencies installed from npm are distributed under their own licenses; see each package's `LICENSE` file in
`node_modules`. `components/ui/sonner.tsx` is adapted from [shadcn/ui](https://ui.shadcn.com) (MIT License).
