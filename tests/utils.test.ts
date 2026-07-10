import { describe, expect, it } from 'vitest';
import { createCsv, formatFilename, isValidBarcode, sanitizeBaseName } from '../src/utils';

describe('barcode validation', () => {
  it('accepts exactly six digits', () => expect(isValidBarcode('123456')).toBe(true));
  it('rejects other lengths and non-digits', () => {
    expect(isValidBarcode('12345')).toBe(false);
    expect(isValidBarcode('1234567')).toBe(false);
    expect(isValidBarcode('12A456')).toBe(false);
  });
});

describe('CSV and filenames', () => {
  it('creates a numbers-only CSV', () => expect(createCsv(['123456', '654321'])).toBe('123456\r\n654321\r\n'));
  it('sanitizes names', () => expect(sanitizeBaseName(' My File.csv ')).toBe('My_File'));
  it('formats expected timestamp', () => {
    const date = new Date(2026, 5, 12, 10, 42, 31);
    expect(formatFilename('sampleFileName', date)).toBe('sampleFileName_June_12_2026_10-42-31.csv');
  });
});
