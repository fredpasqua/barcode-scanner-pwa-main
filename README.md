# Six Digit Barcode Scanner PWA

A mobile-first progressive web app for continuously scanning unique six-digit interleaved 2 of 5 (ITF) barcodes, recovering the active session from local storage, and exporting a numbers-only CSV.

## Requirements

- Node.js 20.19+ or 22.12+
- HTTPS in production (required for mobile camera access)
- iPhone/iPad: current Safari; Android: current Chrome

## Run locally

```bash
npm install
npm run dev
```

Camera access normally requires HTTPS. `localhost` is allowed for development, but another phone on your Wi-Fi will need an HTTPS development tunnel or deployed HTTPS site.

## Test and build

```bash
npm test
npm run lint
npm run build
npm run preview
```

## Install on a phone

- **iPhone:** open the deployed HTTPS site in Safari, tap Share, then **Add to Home Screen**.
- **Android:** open the site in Chrome and choose **Install app** or **Add to Home screen**.

## Important behavior

- Scans interleaved 2 of 5 (ITF) only and accepts exactly six digits.
- Duplicate values are rejected within the current stored session.
- Values persist in local storage until **Clear All** is confirmed.
- CSV files contain numbers only, one per line, in original scan order.
- Downloading does not clear the session.
- iOS decides whether a download is saved to Files or opened in a share/download sheet; this is controlled by Safari, not the PWA.
