# Test Report

Validated on July 10, 2026.

## Passed checks

- `npm test`: 5/5 automated utility tests passed
- `npm run lint`: passed with no errors
- `npm run build`: TypeScript and Vite production build passed
- PWA service worker and web app manifest generated successfully
- `npm audit`: 0 known vulnerabilities at install time

## Tested logic

- Exactly six numeric digits accepted
- Incorrect lengths and non-numeric values rejected
- Numbers-only CSV output
- Filename sanitization
- Filename date/time formatting
- Duplicate protection uses a live in-memory set during continuous scanning
- Session persistence uses local storage

## Hardware validation note

Camera focus, vibration, audio permissions, iOS download presentation, and barcode recognition quality depend on the physical phone, browser, lighting, label quality, and HTTPS hosting. These require a final acceptance test on the target iPhone and Android devices after deployment to HTTPS.
