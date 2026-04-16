/**
 * MaskingCanvas — lets the user draw a black rectangle over the patient name
 * before the image is sent to Gemini / uploaded to storage.
 *
 * Usage:
 *   <MaskingCanvas imageFile={file} onConfirm={(maskedBlob) => ...} onSkip={...} />
 *
 * The user drags to place a rectangle. They can redraw as many times as needed.
 * "Confirmer" exports the canvas as a JPEG Blob (the masked version).
 */
import { useEffect, useRef, useState } from 'react';

interface Props {
  imageFile: File;
  onConfirm: (maskedBlob: Blob, originalFile: File) => void;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export default function MaskingCanvas({ imageFile, onConfirm }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [dragging, setDragging] = useState(false);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const [scale, setScale] = useState(1);
  const [exporting, setExporting] = useState(false);

  // Load image onto canvas
  useEffect(() => {
    const url = URL.createObjectURL(imageFile);
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      const canvas = canvasRef.current;
      if (!canvas) return;

      // Scale image to fit within 900px width
      const maxW = 900;
      const s = img.width > maxW ? maxW / img.width : 1;
      setScale(s);
      canvas.width  = Math.round(img.width  * s);
      canvas.height = Math.round(img.height * s);
      draw(null);
    };
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  function draw(r: Rect | null) {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    if (r && r.w !== 0 && r.h !== 0) {
      ctx.fillStyle = '#000000';
      ctx.fillRect(
        Math.min(r.x, r.x + r.w),
        Math.min(r.y, r.y + r.h),
        Math.abs(r.w),
        Math.abs(r.h),
      );
    }
  }

  function canvasPoint(e: React.MouseEvent<HTMLCanvasElement>): { x: number; y: number } {
    const canvas = canvasRef.current!;
    const bounds = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / bounds.width;
    const scaleY = canvas.height / bounds.height;
    return {
      x: (e.clientX - bounds.left) * scaleX,
      y: (e.clientY - bounds.top)  * scaleY,
    };
  }

  function onMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    const pt = canvasPoint(e);
    startRef.current = pt;
    setDragging(true);
    setRect({ x: pt.x, y: pt.y, w: 0, h: 0 });
  }

  function onMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!dragging || !startRef.current) return;
    const pt = canvasPoint(e);
    const r: Rect = {
      x: startRef.current.x,
      y: startRef.current.y,
      w: pt.x - startRef.current.x,
      h: pt.y - startRef.current.y,
    };
    setRect(r);
    draw(r);
  }

  function onMouseUp(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!dragging || !startRef.current) return;
    const pt = canvasPoint(e);
    const r: Rect = {
      x: startRef.current.x,
      y: startRef.current.y,
      w: pt.x - startRef.current.x,
      h: pt.y - startRef.current.y,
    };
    setDragging(false);
    setRect(r);
    draw(r);
  }

  function clearRect() {
    setRect(null);
    draw(null);
  }

  async function handleConfirm() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setExporting(true);

    // Re-draw with full-resolution image to export at native size
    const fullCanvas = document.createElement('canvas');
    const img = imgRef.current!;
    fullCanvas.width  = img.naturalWidth;
    fullCanvas.height = img.naturalHeight;
    const ctx = fullCanvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);

    if (rect && (rect.w !== 0 || rect.h !== 0)) {
      // Scale rect back to original image coords
      const invScale = 1 / scale;
      ctx.fillStyle = '#000000';
      ctx.fillRect(
        Math.round(Math.min(rect.x, rect.x + rect.w) * invScale),
        Math.round(Math.min(rect.y, rect.y + rect.h) * invScale),
        Math.round(Math.abs(rect.w) * invScale),
        Math.round(Math.abs(rect.h) * invScale),
      );
    }

    fullCanvas.toBlob(
      (blob) => {
        setExporting(false);
        if (blob) onConfirm(blob, imageFile);
      },
      'image/jpeg',
      0.92,
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-white">Masquer le nom du patient</h2>
        <p className="text-navy-400 text-sm mt-1">
          Dessinez un rectangle noir sur le nom du patient avant l'envoi. Cette étape est obligatoire.
        </p>
      </div>

      <div className="relative border border-navy-600 rounded-xl overflow-hidden bg-black">
        <canvas
          ref={canvasRef}
          className="max-w-full h-auto cursor-crosshair select-none"
          style={{ display: 'block' }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
        />
      </div>

      <div className="flex items-center gap-3">
        {rect && (rect.w !== 0 || rect.h !== 0) && (
          <button
            onClick={clearRect}
            className="px-4 py-2 text-sm text-navy-400 hover:text-white border border-navy-600 hover:border-navy-500 rounded-lg transition-colors"
          >
            Effacer le masque
          </button>
        )}
        <button
          onClick={handleConfirm}
          disabled={exporting}
          className="px-5 py-2 bg-teal-500 hover:bg-teal-400 disabled:opacity-60 text-white font-semibold rounded-lg text-sm transition-colors"
        >
          {exporting ? 'Traitement…' : 'Confirmer et continuer'}
        </button>
        <p className="text-xs text-navy-500 ml-auto">
          {rect && (rect.w !== 0 || rect.h !== 0)
            ? 'Masque appliqué'
            : 'Aucun masque — vous pouvez continuer sans masquer'}
        </p>
      </div>
    </div>
  );
}
