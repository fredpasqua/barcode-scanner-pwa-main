import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import Quagga from "@ericblade/quagga2";
import {
  createCsv,
  formatFilename,
  isValidBarcode,
  STORAGE_KEY,
} from "./utils";
import "./styles.css";

type Notice = {
  type: "success" | "warning" | "error" | "info";
  text: string;
};

type QuaggaResult = {
  codeResult?: {
    code?: string | null;
    format?: string | null;
  };
  boxes?: number[][][];
  box?: number[][];
  line?: Array<{
    x: number;
    y: number;
  }>;
};

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
  const [manualValue, setManualValue] = useState("");
  const [notice, setNotice] = useState<Notice>({
    type: "info",
    text: "Ready to scan.",
  });
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showDownload, setShowDownload] = useState(false);
  const [fileBaseName, setFileBaseName] = useState("");

  const videoRef = useRef<HTMLDivElement>(null);
  const scannerRunningRef = useRef(false);
  const invalidAttemptsRef = useRef(0);
  const barcodeSetRef = useRef(new Set(barcodes));

  const lastDecodeRef = useRef<{
    value: string;
    at: number;
  }>({
    value: "",
    at: 0,
  });

  useEffect(() => {
    barcodeSetRef.current = new Set(barcodes);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(barcodes));
  }, [barcodes]);

  useEffect(() => {
    return () => {
      if (scannerRunningRef.current) {
        Quagga.offProcessed();
        Quagga.offDetected();
        Quagga.stop();
        scannerRunningRef.current = false;
      }
    };
  }, []);

  const vibrate = useCallback((pattern: number | number[]) => {
    navigator.vibrate?.(pattern);
  }, []);

  const playTone = useCallback((kind: "success" | "error") => {
    try {
      const AudioContextCtor =
        window.AudioContext ||
        (
          window as typeof window & {
            webkitAudioContext?: typeof AudioContext;
          }
        ).webkitAudioContext;

      if (!AudioContextCtor) return;

      const context = new AudioContextCtor();
      const oscillator = context.createOscillator();
      const gain = context.createGain();

      oscillator.frequency.value = kind === "success" ? 880 : 220;

      gain.gain.setValueAtTime(0.08, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.13);

      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.13);

      oscillator.onended = () => {
        void context.close();
      };
    } catch {
      // Audio feedback may be blocked until the user interacts.
    }
  }, []);

  const addBarcode = useCallback(
    (rawValue: string, source: "scan" | "manual") => {
      const value = rawValue.trim();

      if (!isValidBarcode(value)) {
        invalidAttemptsRef.current += 1;

        if (invalidAttemptsRef.current === 1) {
          setNotice({
            type: "error",
            text: "Invalid barcode. Please try scanning it one more time.",
          });
        } else {
          setNotice({
            type: "error",
            text: "Still invalid. Please move to another barcode.",
          });

          invalidAttemptsRef.current = 0;
        }

        vibrate([150, 80, 150]);
        playTone("error");
        return false;
      }

      if (barcodeSetRef.current.has(value)) {
        setNotice({
          type: "warning",
          text: `Barcode ${value} was already scanned.`,
        });

        vibrate([100, 60, 100]);
        playTone("error");
        invalidAttemptsRef.current = 0;
        return false;
      }

      barcodeSetRef.current.add(value);
      setBarcodes((previous) => [value, ...previous]);
      invalidAttemptsRef.current = 0;

      setNotice({
        type: "success",
        text: `${source === "manual" ? "Added" : "Scanned"} ${value}.`,
      });

      vibrate(80);
      playTone("success");
      return true;
    },
    [playTone, vibrate],
  );

  const stopScanning = useCallback(() => {
    if (scannerRunningRef.current) {
      Quagga.offProcessed();
      Quagga.offDetected();
      Quagga.stop();
      scannerRunningRef.current = false;
    }

    setIsScanning(false);

    setNotice((previous) =>
      previous.type === "success"
        ? previous
        : {
            type: "info",
            text: "Scanner paused.",
          },
    );
  }, []);

  const startScanning = useCallback(async () => {
    stopScanning();

    if (!videoRef.current) {
      setNotice({
        type: "error",
        text: "The camera area is not available. Reload the page and try again.",
      });
      return;
    }

    setNotice({
      type: "info",
      text: "Starting rear camera…",
    });

    try {
      await new Promise<void>((resolve, reject) => {
        Quagga.init(
          {
            inputStream: {
              type: "LiveStream",
              target: videoRef.current ?? undefined,

              constraints: {
                facingMode: {
                  ideal: "environment",
                },
                width: {
                  ideal: 1920,
                },
                height: {
                  ideal: 1080,
                },
              },

              area: {
                top: "20%",
                right: "0%",
                left: "0%",
                bottom: "20%",
              },
            },

            locator: {
              patchSize: "medium",
              halfSample: false,
            },

            numOfWorkers: navigator.hardwareConcurrency
              ? Math.min(navigator.hardwareConcurrency, 4)
              : 2,

            frequency: 10,

            decoder: {
              readers: ["code_128_reader", "i2of5_reader", "2of5_reader"],
              multiple: false,
            },

            locate: true,
          },
          (error) => {
            if (error) {
              reject(error);
              return;
            }

            resolve();
          },
        );
      });

      const handleProcessed = (result: QuaggaResult | null) => {
        const drawingCanvas = Quagga.canvas.dom.overlay;
        const drawingContext = Quagga.canvas.ctx.overlay;
        const imageCanvas = Quagga.canvas.dom.image;

        if (!drawingCanvas || !drawingContext) return;

        if (imageCanvas) {
          drawingCanvas.width = imageCanvas.width;
          drawingCanvas.height = imageCanvas.height;
        }

        drawingContext.clearRect(
          0,
          0,
          drawingCanvas.width,
          drawingCanvas.height,
        );

        if (result?.boxes) {
          result.boxes
            .filter((box) => box !== result.box)
            .forEach((box) => {
              Quagga.ImageDebug.drawPath(
                box,
                {
                  x: 0,
                  y: 1,
                },
                drawingContext,
                {
                  color: "green",
                  lineWidth: 2,
                },
              );
            });
        }

        if (result?.box) {
          Quagga.ImageDebug.drawPath(
            result.box,
            {
              x: 0,
              y: 1,
            },
            drawingContext,
            {
              color: "blue",
              lineWidth: 2,
            },
          );
        }

        if (result?.codeResult?.code && result.line) {
          Quagga.ImageDebug.drawPath(
            result.line,
            {
              x: "x",
              y: "y",
            },
            drawingContext,
            {
              color: "red",
              lineWidth: 3,
            },
          );
        }
      };

      const handleDetected = (result: QuaggaResult) => {
        const value = result.codeResult?.code?.trim();
        const format = result.codeResult?.format ?? "unknown";

        console.log("Decoded barcode:", {
          value,
          format,
        });

        if (!value || !/^\d{6}$/.test(value)) {
          return;
        }

        const now = Date.now();

        /*
         * Prevent the same live-camera result from firing repeatedly
         * within a short interval. The normal duplicate check still
         * prevents it from being stored twice.
         */
        if (
          lastDecodeRef.current.value === value &&
          now - lastDecodeRef.current.at < 2500
        ) {
          return;
        }

        lastDecodeRef.current = {
          value,
          at: now,
        };

        setNotice({
          type: "info",
          text: `Detected ${value} as ${format}.`,
        });

        addBarcode(value, "scan");
      };

      Quagga.onProcessed(handleProcessed);
      Quagga.onDetected(handleDetected);
      Quagga.start();

      scannerRunningRef.current = true;
      setIsScanning(true);

      setNotice({
        type: "info",
        text: "Scanner active. Hold the complete barcode inside the frame.",
      });
    } catch (error) {
      scannerRunningRef.current = false;
      setIsScanning(false);

      console.error("Unable to start scanner:", error);

      const message =
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "Camera permission was denied. Allow camera access in browser settings and try again."
          : "The camera could not start. Confirm camera access is allowed and try again.";

      setNotice({
        type: "error",
        text: message,
      });
    }
  }, [addBarcode, stopScanning]);

  const testBarcodeImage = useCallback(
    (file: File) => {
      const reader = new FileReader();

      reader.onload = () => {
        if (typeof reader.result !== "string") return;

        setNotice({
          type: "info",
          text: "Analyzing barcode photo…",
        });

        Quagga.decodeSingle(
          {
            src: reader.result,
            numOfWorkers: 0,
            locate: true,

            inputStream: {
              size: 1600,
              singleChannel: false,
            },

            locator: {
              patchSize: "small",
              halfSample: false,
            },

            decoder: {
              readers: ["code_128_reader", "i2of5_reader", "2of5_reader"],
              multiple: false,
            },
          },
          (result) => {
            const typedResult = result as QuaggaResult | null;
            const value = typedResult?.codeResult?.code?.trim();
            const format = typedResult?.codeResult?.format ?? "unknown format";

            console.log("Still image result:", typedResult);

            if (!value) {
              setNotice({
                type: "error",
                text: "The barcode photo could not be decoded.",
              });
              return;
            }

            if (!/^\d{6}$/.test(value)) {
              setNotice({
                type: "error",
                text: `The image returned ${value} as ${format}, but it is not exactly six digits.`,
              });
              return;
            }

            setNotice({
              type: "success",
              text: `Image decoded as ${value} using ${format}.`,
            });

            addBarcode(value, "scan");
          },
        );
      };

      reader.onerror = () => {
        setNotice({
          type: "error",
          text: "The selected image could not be opened.",
        });
      };

      reader.readAsDataURL(file);
    },
    [addBarcode],
  );

  const submitManual = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (addBarcode(manualValue, "manual")) {
      setManualValue("");
    }
  };

  const clearAll = () => {
    barcodeSetRef.current.clear();
    lastDecodeRef.current = {
      value: "",
      at: 0,
    };

    setBarcodes([]);
    setShowClearConfirm(false);

    setNotice({
      type: "info",
      text: "All scanned barcodes were cleared.",
    });
  };

  const downloadCsv = () => {
    if (!fileBaseName.trim()) {
      setNotice({
        type: "error",
        text: "Enter a file name before downloading.",
      });
      return;
    }

    if (barcodes.length === 0) {
      setNotice({
        type: "error",
        text: "There are no barcodes to download.",
      });
      return;
    }

    const csv = createCsv([...barcodes].reverse());

    const blob = new Blob([csv], {
      type: "text/csv;charset=utf-8",
    });

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = formatFilename(fileBaseName);

    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    URL.revokeObjectURL(url);

    setShowDownload(false);
    setFileBaseName("");

    setNotice({
      type: "success",
      text: `CSV downloaded with ${barcodes.length} unique barcode${
        barcodes.length === 1 ? "" : "s"
      }.`,
    });
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Offline-ready PWA</p>
          <h1>Barcode Scanner</h1>
        </div>

        <div
          className="count-badge"
          aria-label={`${barcodes.length} unique scans`}
        >
          <strong>{barcodes.length}</strong>
          <span>Unique</span>
        </div>
      </header>

      <section
        className={`notice ${notice.type}`}
        role="status"
        aria-live="polite"
      >
        {notice.text}
      </section>

      <section className="scanner-card">
        <div className="video-wrap">
          <div
            ref={videoRef}
            className="quagga-camera"
            aria-label="Rear camera barcode scanner"
          />

          <div className="scan-frame" aria-hidden="true">
            <span />
          </div>

          {!isScanning && (
            <div className="camera-placeholder">Camera is off</div>
          )}
        </div>

        {/* <div className="button-row">
          <button
            type="button"
            className="primary"
            onClick={isScanning ? stopScanning : startScanning}
          >
            {isScanning ? "Pause Scanner" : "Start Scanner"}
          </button>

          <label className="secondary">
            Test Barcode Photo
            <input
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];

                if (file) {
                  testBarcodeImage(file);
                }

                event.currentTarget.value = "";
              }}
            />
          </label>
        </div> */}
      </section>

      <section className="panel">
        <h2>Manual Entry</h2>

        <form className="manual-form" onSubmit={submitManual}>
          <input
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            value={manualValue}
            onChange={(event) =>
              setManualValue(event.target.value.replace(/\D/g, "").slice(0, 6))
            }
            placeholder="Enter 6 digits"
            aria-label="Six digit barcode"
          />

          <button type="submit" className="secondary">
            Add
          </button>
        </form>
      </section>

      <section className="panel list-panel">
        <div className="section-heading">
          <h2>Scanned Barcodes</h2>
          <span>{barcodes.length}</span>
        </div>

        <div className="barcode-list" role="list">
          {barcodes.length === 0 ? (
            <p className="empty">No barcodes scanned yet.</p>
          ) : (
            barcodes.map((barcode, index) => (
              <div className="barcode-row" role="listitem" key={barcode}>
                <span className="order">{barcodes.length - index}</span>
                <code>{barcode}</code>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="action-grid">
        <button
          type="button"
          className="primary"
          onClick={() => setShowDownload(true)}
          disabled={barcodes.length === 0}
        >
          Download CSV
        </button>

        <button
          type="button"
          className="danger-outline"
          onClick={() => setShowClearConfirm(true)}
          disabled={barcodes.length === 0}
        >
          Clear All
        </button>
      </section>

      {showDownload && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setShowDownload(false);
            }
          }}
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="download-title"
          >
            <h2 id="download-title">Name your CSV file</h2>
            <p>The date and time will be added automatically.</p>

            <input
              autoFocus
              value={fileBaseName}
              onChange={(event) => setFileBaseName(event.target.value)}
              placeholder="sampleFileName"
            />

            <div className="button-row">
              <button
                type="button"
                className="secondary"
                onClick={() => setShowDownload(false)}
              >
                Cancel
              </button>

              <button type="button" className="primary" onClick={downloadCsv}>
                Download
              </button>
            </div>
          </div>
        </div>
      )}

      {showClearConfirm && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setShowClearConfirm(false);
            }
          }}
        >
          <div
            className="modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="clear-title"
          >
            <h2 id="clear-title">Clear all scans?</h2>

            <p>
              This removes all {barcodes.length} stored barcodes from this
              device. This cannot be undone.
            </p>

            <div className="button-row">
              <button
                type="button"
                className="secondary"
                onClick={() => setShowClearConfirm(false)}
              >
                Keep Scans
              </button>

              <button type="button" className="danger" onClick={clearAll}>
                Yes, Clear All
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default App;
