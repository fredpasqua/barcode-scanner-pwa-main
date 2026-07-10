import { useCallback, useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType, NotFoundException, Result } from '@zxing/library';
import { createCsv, formatFilename, isValidBarcode, STORAGE_KEY } from './utils';
import './styles.css';

type Notice = { type: 'success' | 'warning' | 'error' | 'info'; text: string };

const hints = new Map();
hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.ITF]);
hints.set(DecodeHintType.TRY_HARDER, true);
hints.set(DecodeHintType.ALLOWED_LENGTHS, [6]);

function App() {
  const [barcodes, setBarcodes] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [isScanning, setIsScanning] = useState(false);
  const [manualValue, setManualValue] = useState('');
  const [notice, setNotice] = useState<Notice>({ type: 'info', text: 'Ready to scan.' });
  const invalidAttemptsRef = useRef(0);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showDownload, setShowDownload] = useState(false);
  const [fileBaseName, setFileBaseName] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const lastDecodeRef = useRef<{ value: string; at: number }>({ value: '', at: 0 });
  const barcodeSetRef = useRef(new Set(barcodes));

  useEffect(() => {
    barcodeSetRef.current = new Set(barcodes);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(barcodes));
  }, [barcodes]);

  useEffect(() => () => controlsRef.current?.stop(), []);

  const vibrate = useCallback((pattern: number | number[]) => {
    navigator.vibrate?.(pattern);
  }, []);

  const playTone = useCallback((kind: 'success' | 'error') => {
    try {
      const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) return;
      const ctx = new AudioContextCtor();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.frequency.value = kind === 'success' ? 880 : 220;
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.13);
      oscillator.connect(gain).connect(ctx.destination);
      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.13);
      oscillator.onended = () => void ctx.close();
    } catch {
      // Audio feedback is optional and may be blocked until the user interacts.
    }
  }, []);

  const addBarcode = useCallback((rawValue: string, source: 'scan' | 'manual') => {
    const value = rawValue.trim();
    if (!isValidBarcode(value)) {
      invalidAttemptsRef.current += 1;
      if (invalidAttemptsRef.current === 1) {
        setNotice({ type: 'error', text: 'Invalid barcode. Please try scanning it one more time.' });
      } else {
        setNotice({ type: 'error', text: 'Still invalid. Please move to another barcode.' });
        invalidAttemptsRef.current = 0;
      }
      vibrate([150, 80, 150]);
      playTone('error');
      return false;
    }

    if (barcodeSetRef.current.has(value)) {
      setNotice({ type: 'warning', text: `Barcode ${value} was already scanned.` });
      vibrate([100, 60, 100]);
      playTone('error');
      invalidAttemptsRef.current = 0;
      return false;
    }

    barcodeSetRef.current.add(value);
    setBarcodes((previous) => [value, ...previous]);
    invalidAttemptsRef.current = 0;
    setNotice({ type: 'success', text: `${source === 'manual' ? 'Added' : 'Scanned'} ${value}.` });
    vibrate(80);
    playTone('success');
    return true;
  }, [playTone, vibrate]);

  const stopScanning = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setIsScanning(false);
    setNotice((previous) => previous.type === 'success' ? previous : { type: 'info', text: 'Scanner paused.' });
  }, []);

  const startScanning = useCallback(async () => {
    if (!videoRef.current) return;
    stopScanning();
    setNotice({ type: 'info', text: 'Starting rear camera…' });
    try {
      const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 150, delayBetweenScanSuccess: 650 });
      const controls = await reader.decodeFromConstraints(
        { audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } } },
        videoRef.current,
        (result: Result | undefined, error: Error | undefined) => {
          if (result) {
            const value = result.getText().trim();
            const now = Date.now();
            if (lastDecodeRef.current.value === value && now - lastDecodeRef.current.at < 1500) return;
            lastDecodeRef.current = { value, at: now };
            addBarcode(value, 'scan');
          } else if (error && !(error instanceof NotFoundException)) {
            console.warn('Scanner decode error:', error);
          }
        }
      );
      controlsRef.current = controls;
      setIsScanning(true);
      setNotice({ type: 'info', text: 'Scanner active. Hold an Interleaved 2 of 5 barcode inside the frame.' });
    } catch (error) {
      setIsScanning(false);
      const message = error instanceof DOMException && error.name === 'NotAllowedError'
        ? 'Camera permission was denied. Allow camera access in browser settings and try again.'
        : 'The camera could not start. Confirm this page is opened over HTTPS and try again.';
      setNotice({ type: 'error', text: message });
    }
  }, [addBarcode, stopScanning]);

  const submitManual = (event: React.FormEvent) => {
    event.preventDefault();
    if (addBarcode(manualValue, 'manual')) setManualValue('');
  };

  const clearAll = () => {
    barcodeSetRef.current.clear();
    setBarcodes([]);
    setShowClearConfirm(false);
    setNotice({ type: 'info', text: 'All scanned barcodes were cleared.' });
  };

  const downloadCsv = () => {
    if (!fileBaseName.trim()) {
      setNotice({ type: 'error', text: 'Enter a file name before downloading.' });
      return;
    }
    if (barcodes.length === 0) {
      setNotice({ type: 'error', text: 'There are no barcodes to download.' });
      return;
    }
    const blob = new Blob([createCsv([...barcodes].reverse())], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = formatFilename(fileBaseName);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setShowDownload(false);
    setFileBaseName('');
    setNotice({ type: 'success', text: `CSV downloaded with ${barcodes.length} unique barcode${barcodes.length === 1 ? '' : 's'}.` });
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Offline-ready PWA</p>
          <h1>Barcode Scanner</h1>
        </div>
        <div className="count-badge" aria-label={`${barcodes.length} unique scans`}>
          <strong>{barcodes.length}</strong><span>Unique</span>
        </div>
      </header>

      <section className={`notice ${notice.type}`} role="status" aria-live="polite">{notice.text}</section>

      <section className="scanner-card">
        <div className="video-wrap">
          <video ref={videoRef} muted playsInline aria-label="Rear camera barcode scanner" />
          <div className="scan-frame" aria-hidden="true"><span /></div>
          {!isScanning && <div className="camera-placeholder">Camera is off</div>}
        </div>
        <div className="button-row">
          <button className="primary" onClick={isScanning ? stopScanning : startScanning}>
            {isScanning ? 'Pause Scanner' : 'Start Scanner'}
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>Manual Entry</h2>
        <form className="manual-form" onSubmit={submitManual}>
          <input
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            value={manualValue}
            onChange={(event) => setManualValue(event.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="Enter 6 digits"
            aria-label="Six digit barcode"
          />
          <button type="submit" className="secondary">Add</button>
        </form>
      </section>

      <section className="panel list-panel">
        <div className="section-heading">
          <h2>Scanned Barcodes</h2>
          <span>{barcodes.length}</span>
        </div>
        <div className="barcode-list" role="list">
          {barcodes.length === 0 ? <p className="empty">No barcodes scanned yet.</p> : barcodes.map((barcode, index) => (
            <div className="barcode-row" role="listitem" key={barcode}>
              <span className="order">{barcodes.length - index}</span>
              <code>{barcode}</code>
            </div>
          ))}
        </div>
      </section>

      <section className="action-grid">
        <button className="primary" onClick={() => setShowDownload(true)} disabled={barcodes.length === 0}>Download CSV</button>
        <button className="danger-outline" onClick={() => setShowClearConfirm(true)} disabled={barcodes.length === 0}>Clear All</button>
      </section>

      {showDownload && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && setShowDownload(false)}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="download-title">
            <h2 id="download-title">Name your CSV file</h2>
            <p>The date and time will be added automatically.</p>
            <input autoFocus value={fileBaseName} onChange={(e) => setFileBaseName(e.target.value)} placeholder="sampleFileName" />
            <div className="button-row">
              <button className="secondary" onClick={() => setShowDownload(false)}>Cancel</button>
              <button className="primary" onClick={downloadCsv}>Download</button>
            </div>
          </div>
        </div>
      )}

      {showClearConfirm && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && setShowClearConfirm(false)}>
          <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="clear-title">
            <h2 id="clear-title">Clear all scans?</h2>
            <p>This removes all {barcodes.length} stored barcodes from this device. This cannot be undone.</p>
            <div className="button-row">
              <button className="secondary" onClick={() => setShowClearConfirm(false)}>Keep Scans</button>
              <button className="danger" onClick={clearAll}>Yes, Clear All</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default App;
