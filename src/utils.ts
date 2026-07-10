export const STORAGE_KEY = 'six-digit-barcode-session-v1';

export function isValidBarcode(value: string): boolean {
  return /^\d{6}$/.test(value.trim());
}

export function createCsv(values: string[]): string {
  return values.join('\r\n') + (values.length ? '\r\n' : '');
}

export function sanitizeBaseName(value: string): string {
  return value
    .trim()
    .replace(/\.csv$/i, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'barcode_export';
}

export function formatFilename(baseName: string, date = new Date()): string {
  const month = date.toLocaleString('en-US', { month: 'long' });
  const day = String(date.getDate()).padStart(2, '0');
  const year = date.getFullYear();
  const time = [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map((part) => String(part).padStart(2, '0'))
    .join('-');
  return `${sanitizeBaseName(baseName)}_${month}_${day}_${year}_${time}.csv`;
}
