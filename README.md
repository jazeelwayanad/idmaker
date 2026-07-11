# ID Maker

Bulk ID Card Production System built with Next.js, Electron, TypeScript, and SQLite.

## Prerequisites

- Node.js 18+
- npm

## Getting Started

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Public Website (Landing + Download)

The homepage route (`/`) is now a public landing page. The app workspace is available at `/studio`.

To configure the **Download App** button on the landing page, set:

```bash
NEXT_PUBLIC_DOWNLOAD_URL=https://your-hosted-installer-url
```

For the **Releases** section on the landing page, optionally set:

```bash
NEXT_PUBLIC_LATEST_VERSION=v1.0.0
NEXT_PUBLIC_INSTALLER_SIZE=141.5 MB
NEXT_PUBLIC_RELEASE_NOTES_URL=https://your-release-notes-url
```

If not set, it defaults to:

```bash
/downloads/ID Maker Setup 1.0.0.exe
```

## Package Desktop App

```bash
npm run dist
```

## Open Source License

This project is open source under the [MIT License](./LICENSE).

Copyright (c) 2026 Eucodes

## Community

- [Contributing Guide](./CONTRIBUTING.md)
- [Code of Conduct](./CODE_OF_CONDUCT.md)
- [Security Policy](./SECURITY.md)
