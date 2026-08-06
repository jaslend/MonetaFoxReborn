/**
 * Optional mouse-movement entropy capture (Phase 2 setup, BASIC mode).
 *
 * The captured bytes are stored at setup (base64) and reused on unlock, so they
 * act as a per-user salt mixed into the keying material (see deriveKey's
 * `basic` mode). Capture is OPTIONAL — a vault with no entropy still derives a
 * strong key from email+password via PBKDF2.
 *
 * The control collects raw bytes from each mousemove event (x low byte, y low
 * byte, and the low byte of `performance.now()`) and accumulates them until
 * `targetBytes` (default 64) are gathered, then reports the buffer up. A
 * progress bar shows how much has been collected; "Clear" resets it.
 */
import { useCallback, useRef, useState } from 'react';

interface Props {
  targetBytes?: number;
  /** Called with the accumulated entropy whenever it changes. */
  onEntropy: (bytes: Uint8Array | null) => void;
}

export function EntropyCapture({ targetBytes = 64, onEntropy }: Props) {
  const bufferRef = useRef<Uint8Array>(new Uint8Array(0));
  const [collected, setCollected] = useState(0);

  const flush = useCallback(
    (next: Uint8Array) => {
      setCollected(next.length);
      onEntropy(next.length > 0 ? next : null);
    },
    [onEntropy],
  );

  const handleMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (bufferRef.current.length >= targetBytes) return;
      const t =
        typeof performance !== 'undefined' ? performance.now() : Date.now();
      const chunk = [e.clientX & 0xff, e.clientY & 0xff, Math.floor(t) & 0xff];
      const current = bufferRef.current;
      const room = targetBytes - current.length;
      const take = chunk.slice(0, room);
      const next = new Uint8Array(current.length + take.length);
      next.set(current, 0);
      next.set(take, current.length);
      bufferRef.current = next;
      flush(next);
    },
    [targetBytes, flush],
  );

  const handleClear = useCallback(() => {
    bufferRef.current = new Uint8Array(0);
    flush(new Uint8Array(0));
  }, [flush]);

  const pct = Math.min(100, Math.round((collected / targetBytes) * 100));

  return (
    <div className="flex flex-col gap-2">
      <div
        onMouseMove={handleMove}
        className="border-border bg-muted/40 flex h-24 w-full items-center justify-center rounded-md border border-dashed text-xs select-none"
        role="application"
        aria-label="Move your mouse here to add entropy"
        data-testid="entropy-capture"
      >
        {collected >= targetBytes
          ? 'Entropy captured'
          : 'Move your mouse here to add entropy'}
      </div>
      <div
        className="bg-muted h-1.5 w-full overflow-hidden rounded"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="bg-primary h-full transition-all"
          style={{ width: `${pct}%` }}
          data-testid="entropy-progress"
        />
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          {collected}/{targetBytes} bytes
        </span>
        <button
          type="button"
          onClick={handleClear}
          className="text-muted-foreground hover:text-foreground underline"
          data-testid="entropy-clear"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
