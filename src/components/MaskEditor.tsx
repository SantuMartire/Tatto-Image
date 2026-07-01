"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const MAX_DIM = 1600; // Resolución de trabajo máxima (px). Limita memoria y mantiene fluidez.
const HISTORY_LIMIT = 10;

type Tool = "erase" | "restore";
type Mode = "brush" | "threshold";
type BgPreview = "checker" | "white" | "black";

export default function MaskEditor({
  file,
  fileName,
  onReset,
}: {
  file: File;
  fileName: string;
  onReset: () => void;
}) {
  const displayRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);

  // Canvases fuera de pantalla (no se re-crean en cada render).
  const sourceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const scratchCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const sourceDataRef = useRef<ImageData | null>(null);

  const historyRef = useRef<ImageData[]>([]);
  const drawingRef = useRef(false);
  const lastPtRef = useRef<{ x: number; y: number } | null>(null);
  const renderRafRef = useRef<number | null>(null);
  const thrRafRef = useRef<number | null>(null);

  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [mode, setMode] = useState<Mode>("brush");
  const [tool, setTool] = useState<Tool>("erase");
  const [brushSize, setBrushSize] = useState(40);
  const [threshold, setThreshold] = useState(110);
  const [bg, setBg] = useState<BgPreview>("checker");
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState("");
  const [canUndo, setCanUndo] = useState(false);

  // ---- Carga de la imagen y preparación de los canvases ----
  useEffect(() => {
    let cancelled = false;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));

      const source = document.createElement("canvas");
      source.width = w;
      source.height = h;
      const sctx = source.getContext("2d", { willReadFrequently: true })!;
      sctx.drawImage(img, 0, 0, w, h);
      sourceCanvasRef.current = source;
      sourceDataRef.current = sctx.getImageData(0, 0, w, h);

      // Máscara inicial: todo blanco/opaco = todo visible.
      const mask = document.createElement("canvas");
      mask.width = w;
      mask.height = h;
      const mctx = mask.getContext("2d", { willReadFrequently: true })!;
      mctx.fillStyle = "#fff";
      mctx.fillRect(0, 0, w, h);
      maskCanvasRef.current = mask;

      const scratch = document.createElement("canvas");
      scratch.width = w;
      scratch.height = h;
      scratch.getContext("2d", { willReadFrequently: true });
      scratchCanvasRef.current = scratch;

      historyRef.current = [];
      setCanUndo(false);
      setMode("brush");
      setDims({ w, h });
      setLoaded(true);
      URL.revokeObjectURL(url);
    };
    img.src = url;
    return () => {
      cancelled = true;
      URL.revokeObjectURL(url);
    };
  }, [file]);

  // ---- Composición del preview: mask (alfa) + source ----
  const renderWith = useCallback((maskCanvas: HTMLCanvasElement | null) => {
    const display = displayRef.current;
    const source = sourceCanvasRef.current;
    if (!display || !source || !maskCanvas) return;
    const ctx = display.getContext("2d")!;
    ctx.clearRect(0, 0, display.width, display.height);
    ctx.globalCompositeOperation = "source-over";
    ctx.drawImage(maskCanvas, 0, 0);
    ctx.globalCompositeOperation = "source-in";
    ctx.drawImage(source, 0, 0);
    ctx.globalCompositeOperation = "source-over";
  }, []);

  const renderPreview = useCallback(() => {
    renderWith(maskCanvasRef.current);
  }, [renderWith]);

  const scheduleRender = useCallback(() => {
    if (renderRafRef.current != null) return;
    renderRafRef.current = requestAnimationFrame(() => {
      renderRafRef.current = null;
      renderPreview();
    });
  }, [renderPreview]);

  // Render inicial cuando ya hay dims y el canvas tiene su tamaño intrínseco.
  useEffect(() => {
    if (loaded && mode === "brush") renderPreview();
  }, [loaded, dims, mode, renderPreview]);

  // ---- Historial / deshacer ----
  const pushHistory = useCallback(() => {
    const mask = maskCanvasRef.current;
    if (!mask) return;
    const mctx = mask.getContext("2d")!;
    const snap = mctx.getImageData(0, 0, mask.width, mask.height);
    const h = historyRef.current;
    h.push(snap);
    if (h.length > HISTORY_LIMIT) h.shift();
    setCanUndo(true);
  }, []);

  const undo = useCallback(() => {
    const h = historyRef.current;
    const snap = h.pop();
    if (!snap) return;
    const mask = maskCanvasRef.current!;
    mask.getContext("2d")!.putImageData(snap, 0, 0);
    setCanUndo(h.length > 0);
    renderPreview();
  }, [renderPreview]);

  // ---- Utilidades de máscara ----
  const fillMask = useCallback(
    (visible: boolean) => {
      const mask = maskCanvasRef.current;
      if (!mask) return;
      pushHistory();
      const mctx = mask.getContext("2d")!;
      mctx.globalCompositeOperation = "source-over";
      if (visible) {
        mctx.fillStyle = "#fff";
        mctx.fillRect(0, 0, mask.width, mask.height);
      } else {
        mctx.clearRect(0, 0, mask.width, mask.height);
      }
      renderPreview();
    },
    [pushHistory, renderPreview],
  );

  const invertMask = useCallback(() => {
    const mask = maskCanvasRef.current;
    if (!mask) return;
    pushHistory();
    const mctx = mask.getContext("2d")!;
    const id = mctx.getImageData(0, 0, mask.width, mask.height);
    const d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = 255;
      d[i + 1] = 255;
      d[i + 2] = 255;
      d[i + 3] = 255 - d[i + 3];
    }
    mctx.putImageData(id, 0, 0);
    renderPreview();
  }, [pushHistory, renderPreview]);

  // ---- Punto de partida: quitar fondo automático ----
  const autoRemoveBg = useCallback(async () => {
    const source = sourceCanvasRef.current;
    const mask = maskCanvasRef.current;
    if (!source || !mask) return;
    setBusy(true);
    setBusyLabel("Cargando modelo…");
    try {
      const { removeBackground } = await import("@imgly/background-removal");
      const srcBlob: Blob = await new Promise((res, rej) =>
        source.toBlob((b) => (b ? res(b) : rej(new Error("toBlob falló"))), "image/png"),
      );
      const outBlob = await removeBackground(srcBlob, {
        output: { format: "image/png" },
        progress: (key, current, total) => {
          const pct = total > 0 ? Math.round((current / total) * 100) : 0;
          setBusyLabel(
            key.startsWith("fetch")
              ? `Descargando modelo… ${pct}%`
              : `Procesando… ${pct}%`,
          );
        },
      });
      const outUrl = URL.createObjectURL(outBlob);
      const outImg = await new Promise<HTMLImageElement>((res, rej) => {
        const im = new Image();
        im.onload = () => res(im);
        im.onerror = rej;
        im.src = outUrl;
      });
      pushHistory();
      const mctx = mask.getContext("2d")!;
      mctx.globalCompositeOperation = "source-over";
      mctx.clearRect(0, 0, mask.width, mask.height);
      mctx.drawImage(outImg, 0, 0, mask.width, mask.height);
      // La máscara guarda el alfa del recorte, pero en blanco (el color no importa).
      const id = mctx.getImageData(0, 0, mask.width, mask.height);
      const d = id.data;
      for (let i = 0; i < d.length; i += 4) {
        d[i] = 255;
        d[i + 1] = 255;
        d[i + 2] = 255;
      }
      mctx.putImageData(id, 0, 0);
      URL.revokeObjectURL(outUrl);
      renderPreview();
    } catch (err) {
      console.error(err);
      setBusyLabel("");
      alert(
        "No se pudo quitar el fondo automáticamente. Podés recortar a mano con el pincel.",
      );
    } finally {
      setBusy(false);
      setBusyLabel("");
    }
  }, [pushHistory, renderPreview]);

  // ---- Punto de partida: detectar tinta oscura (umbral de luminancia) ----
  const computeThreshold = useCallback((value: number): HTMLCanvasElement | null => {
    const src = sourceDataRef.current;
    const scratch = scratchCanvasRef.current;
    if (!src || !scratch) return null;
    const sctx = scratch.getContext("2d", { willReadFrequently: true })!;
    const out = sctx.createImageData(scratch.width, scratch.height);
    const sd = src.data;
    const od = out.data;
    for (let i = 0; i < sd.length; i += 4) {
      const lum = 0.299 * sd[i] + 0.587 * sd[i + 1] + 0.114 * sd[i + 2];
      od[i] = 255;
      od[i + 1] = 255;
      od[i + 2] = 255;
      od[i + 3] = lum < value ? 255 : 0; // píxeles oscuros = tinta = visibles
    }
    sctx.putImageData(out, 0, 0);
    return scratch;
  }, []);

  // Preview en vivo del umbral (no toca la máscara real hasta "Aplicar").
  useEffect(() => {
    if (mode !== "threshold" || !dims) return;
    if (thrRafRef.current != null) cancelAnimationFrame(thrRafRef.current);
    thrRafRef.current = requestAnimationFrame(() => {
      thrRafRef.current = null;
      const scratch = computeThreshold(threshold);
      renderWith(scratch);
    });
  }, [mode, threshold, dims, computeThreshold, renderWith]);

  const applyThreshold = useCallback(() => {
    const scratch = computeThreshold(threshold);
    const mask = maskCanvasRef.current;
    if (!scratch || !mask) return;
    pushHistory();
    const mctx = mask.getContext("2d")!;
    mctx.globalCompositeOperation = "source-over";
    mctx.clearRect(0, 0, mask.width, mask.height);
    mctx.drawImage(scratch, 0, 0);
    setMode("brush");
    renderPreview();
  }, [computeThreshold, threshold, pushHistory, renderPreview]);

  const cancelThreshold = useCallback(() => {
    setMode("brush");
    renderPreview();
  }, [renderPreview]);

  // ---- Pincel ----
  const canvasPos = (e: React.PointerEvent) => {
    const display = displayRef.current!;
    const rect = display.getBoundingClientRect();
    const scale = display.width / rect.width;
    return {
      x: (e.clientX - rect.left) * scale,
      y: (e.clientY - rect.top) * scale,
      scale,
    };
  };

  const stroke = (from: { x: number; y: number }, to: { x: number; y: number }, scale: number) => {
    const mask = maskCanvasRef.current;
    if (!mask) return;
    const mctx = mask.getContext("2d")!;
    mctx.lineCap = "round";
    mctx.lineJoin = "round";
    mctx.lineWidth = brushSize * scale; // brushSize está en px de pantalla
    if (tool === "restore") {
      mctx.globalCompositeOperation = "source-over";
      mctx.strokeStyle = "#fff";
    } else {
      mctx.globalCompositeOperation = "destination-out";
      mctx.strokeStyle = "#000";
    }
    mctx.beginPath();
    mctx.moveTo(from.x, from.y);
    mctx.lineTo(to.x, to.y);
    mctx.stroke();
    mctx.globalCompositeOperation = "source-over";
    scheduleRender();
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (mode !== "brush" || busy) return;
    e.preventDefault();
    pushHistory();
    drawingRef.current = true;
    const p = canvasPos(e);
    lastPtRef.current = p;
    stroke(p, p, p.scale);
    displayRef.current?.setPointerCapture(e.pointerId);
  };

  const moveCursor = (e: React.PointerEvent) => {
    const wrap = wrapRef.current;
    const cur = cursorRef.current;
    if (!wrap || !cur) return;
    const rect = wrap.getBoundingClientRect();
    cur.style.left = `${e.clientX - rect.left}px`;
    cur.style.top = `${e.clientY - rect.top}px`;
  };

  const onPointerMove = (e: React.PointerEvent) => {
    moveCursor(e);
    if (!drawingRef.current || mode !== "brush") return;
    const p = canvasPos(e);
    const last = lastPtRef.current ?? p;
    stroke(last, p, p.scale);
    lastPtRef.current = p;
  };

  const endStroke = (e: React.PointerEvent) => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastPtRef.current = null;
    displayRef.current?.releasePointerCapture(e.pointerId);
  };

  // ---- Exportar PNG ----
  const download = useCallback(() => {
    const source = sourceCanvasRef.current;
    const mask = maskCanvasRef.current;
    if (!source || !mask) return;
    const out = document.createElement("canvas");
    out.width = source.width;
    out.height = source.height;
    const octx = out.getContext("2d")!;
    octx.drawImage(mask, 0, 0);
    octx.globalCompositeOperation = "source-in";
    octx.drawImage(source, 0, 0);
    out.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${fileName}-sin-fondo.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  }, [fileName]);

  // Limpieza de rAF pendientes.
  useEffect(() => {
    return () => {
      if (renderRafRef.current != null) cancelAnimationFrame(renderRafRef.current);
      if (thrRafRef.current != null) cancelAnimationFrame(thrRafRef.current);
    };
  }, []);

  const bgClass =
    bg === "checker" ? "checkerboard" : bg === "white" ? "bg-white" : "bg-black";

  return (
    <div className="w-full max-w-4xl flex flex-col gap-5">
      {/* Lienzo */}
      <div
        ref={wrapRef}
        className={`relative mx-auto rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800 ${bgClass}`}
        style={{ touchAction: "none", lineHeight: 0 }}
      >
        <canvas
          ref={displayRef}
          width={dims?.w ?? 0}
          height={dims?.h ?? 0}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endStroke}
          onPointerLeave={(e) => {
            endStroke(e);
            if (cursorRef.current) cursorRef.current.style.opacity = "0";
          }}
          onPointerEnter={() => {
            if (cursorRef.current && mode === "brush")
              cursorRef.current.style.opacity = "1";
          }}
          className={`block w-full h-auto max-h-[65vh] object-contain ${
            mode === "brush" ? "cursor-none" : "cursor-default"
          }`}
        />
        {/* Cursor circular del pincel */}
        <div
          ref={cursorRef}
          aria-hidden
          className="pointer-events-none absolute rounded-full border-2 border-violet-500 mix-blend-difference -translate-x-1/2 -translate-y-1/2 opacity-0 transition-opacity"
          style={{ width: brushSize, height: brushSize }}
        />
        {busy && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <p className="rounded-lg bg-black/70 px-4 py-2 text-sm text-white">
              {busyLabel || "Procesando…"}
            </p>
          </div>
        )}
      </div>

      {/* Fondo de previsualización */}
      <div className="flex items-center justify-center gap-2 text-xs text-zinc-500">
        <span>Fondo:</span>
        {(["checker", "white", "black"] as BgPreview[]).map((b) => (
          <button
            key={b}
            onClick={() => setBg(b)}
            className={`px-2 py-1 rounded border ${
              bg === b
                ? "border-violet-500 text-violet-600 dark:text-violet-300"
                : "border-zinc-300 dark:border-zinc-700"
            }`}
          >
            {b === "checker" ? "Damero" : b === "white" ? "Blanco" : "Negro"}
          </button>
        ))}
      </div>

      {/* Punto de partida */}
      <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          1 · Punto de partida (opcional)
        </h3>
        {mode === "threshold" ? (
          <div className="flex flex-col gap-3">
            <label className="flex items-center gap-3 text-sm">
              <span className="w-28 text-zinc-500">Umbral de tinta</span>
              <input
                type="range"
                min={20}
                max={230}
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                className="flex-1 accent-violet-600"
              />
              <span className="w-10 text-right tabular-nums">{threshold}</span>
            </label>
            <p className="text-xs text-zinc-500">
              Mové el umbral hasta que se vea solo la tinta. Después refiná con el pincel.
            </p>
            <div className="flex gap-2">
              <button
                onClick={applyThreshold}
                className="rounded-full bg-violet-600 px-5 py-2 text-sm font-medium text-white hover:bg-violet-700"
              >
                Aplicar
              </button>
              <button
                onClick={cancelThreshold}
                className="rounded-full border border-zinc-300 dark:border-zinc-700 px-5 py-2 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={autoRemoveBg}
              disabled={busy}
              className="rounded-full bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
            >
              Quitar fondo automático
            </button>
            <button
              onClick={() => setMode("threshold")}
              disabled={busy}
              className="rounded-full border border-violet-500 px-4 py-2 text-sm font-medium text-violet-600 dark:text-violet-300 hover:bg-violet-500/10 disabled:opacity-50"
            >
              Detectar tinta oscura
            </button>
          </div>
        )}
        <p className="text-xs text-zinc-500">
          <strong>Fondo plano</strong> → &quot;Quitar fondo automático&quot;. &nbsp;
          <strong>Tatuaje en la piel</strong> → &quot;Detectar tinta oscura&quot; y refiná a mano.
        </p>
      </section>

      {/* Pincel */}
      <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          2 · Retoque con pincel
        </h3>
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-full border border-zinc-300 dark:border-zinc-700 p-0.5">
            <button
              onClick={() => setTool("erase")}
              className={`rounded-full px-4 py-1.5 text-sm font-medium ${
                tool === "erase"
                  ? "bg-violet-600 text-white"
                  : "text-zinc-600 dark:text-zinc-300"
              }`}
            >
              Borrar
            </button>
            <button
              onClick={() => setTool("restore")}
              className={`rounded-full px-4 py-1.5 text-sm font-medium ${
                tool === "restore"
                  ? "bg-violet-600 text-white"
                  : "text-zinc-600 dark:text-zinc-300"
              }`}
            >
              Restaurar
            </button>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <span className="text-zinc-500">Tamaño</span>
            <input
              type="range"
              min={4}
              max={200}
              value={brushSize}
              onChange={(e) => setBrushSize(Number(e.target.value))}
              className="accent-violet-600"
            />
            <span className="w-8 text-right tabular-nums">{brushSize}</span>
          </label>

          <button
            onClick={undo}
            disabled={!canUndo}
            className="rounded-full border border-zinc-300 dark:border-zinc-700 px-4 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40"
          >
            Deshacer
          </button>
          <button
            onClick={invertMask}
            className="rounded-full border border-zinc-300 dark:border-zinc-700 px-4 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            Invertir
          </button>
          <button
            onClick={() => fillMask(true)}
            className="rounded-full border border-zinc-300 dark:border-zinc-700 px-4 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            Mostrar todo
          </button>
          <button
            onClick={() => fillMask(false)}
            className="rounded-full border border-zinc-300 dark:border-zinc-700 px-4 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            Ocultar todo
          </button>
        </div>
        <p className="text-xs text-zinc-500">
          <strong>Borrar</strong> quita zonas del recorte; <strong>Restaurar</strong> las
          trae de vuelta. Usá el fondo negro/blanco de arriba para ver los bordes.
        </p>
      </section>

      {/* Acciones finales */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={download}
          className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-6 py-2.5 font-medium text-white hover:bg-emerald-700"
        >
          Descargar PNG
        </button>
        <button
          onClick={onReset}
          className="inline-flex items-center gap-2 rounded-full border border-zinc-300 dark:border-zinc-700 px-6 py-2.5 font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          Cambiar imagen
        </button>
      </div>
    </div>
  );
}
