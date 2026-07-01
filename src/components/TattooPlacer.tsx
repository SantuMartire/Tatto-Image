"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Stage } from "konva/lib/Stage";
import type { Layer } from "konva/lib/Layer";
import type { Image as KImage } from "konva/lib/shapes/Image";
import type { Shape as KShape } from "konva/lib/Shape";
import type { Transformer } from "konva/lib/shapes/Transformer";
// Solo tipos (se borran en compilación). El runtime se importa dinámico en el efecto.
type KonvaModule = typeof import("konva")["default"];

type Pt = { x: number; y: number };
type Mode = "transform" | "warp";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Dibuja un triángulo de la imagen (s0,s1,s2 en píxeles de la imagen) mapeado al
// triángulo destino (d0,d1,d2 en coordenadas del lienzo) con una transformación afín.
function drawTriangle(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  s0: Pt,
  s1: Pt,
  s2: Pt,
  d0: Pt,
  d1: Pt,
  d2: Pt,
) {
  // Expandir levemente el recorte para tapar las costuras entre triángulos.
  const cx = (d0.x + d1.x + d2.x) / 3;
  const cy = (d0.y + d1.y + d2.y) / 3;
  const grow = (p: Pt): Pt => ({
    x: p.x + (p.x - cx) * 0.02,
    y: p.y + (p.y - cy) * 0.02,
  });
  const e0 = grow(d0);
  const e1 = grow(d1);
  const e2 = grow(d2);

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(e0.x, e0.y);
  ctx.lineTo(e1.x, e1.y);
  ctx.lineTo(e2.x, e2.y);
  ctx.closePath();
  ctx.clip();

  const x0 = s0.x, y0 = s0.y, x1 = s1.x, y1 = s1.y, x2 = s2.x, y2 = s2.y;
  const u0 = d0.x, v0 = d0.y, u1 = d1.x, v1 = d1.y, u2 = d2.x, v2 = d2.y;
  const delta = x0 * (y1 - y2) - x1 * (y0 - y2) + x2 * (y0 - y1);
  if (delta === 0) {
    ctx.restore();
    return;
  }
  const a = (u0 * (y1 - y2) - u1 * (y0 - y2) + u2 * (y0 - y1)) / delta;
  const b = (v0 * (y1 - y2) - v1 * (y0 - y2) + v2 * (y0 - y1)) / delta;
  const c = (x0 * (u1 - u2) - x1 * (u0 - u2) + x2 * (u0 - u1)) / delta;
  const d = (x0 * (v1 - v2) - x1 * (v0 - v2) + x2 * (v0 - v1)) / delta;
  const e = (x0 * (y1 * u2 - y2 * u1) - x1 * (y0 * u2 - y2 * u0) + x2 * (y0 * u1 - y1 * u0)) / delta;
  const f = (x0 * (y1 * v2 - y2 * v1) - x1 * (y0 * v2 - y2 * v0) + x2 * (y0 * v1 - y1 * v0)) / delta;
  ctx.transform(a, b, c, d, e, f);
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}

function drawMesh(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  src: Pt[],
  dst: Pt[],
  cols: number,
  rows: number,
) {
  const idx = (i: number, j: number) => j * (cols + 1) + i;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const a = idx(i, j);
      const b = idx(i + 1, j);
      const c = idx(i, j + 1);
      const d = idx(i + 1, j + 1);
      drawTriangle(ctx, img, src[a], src[b], src[c], dst[a], dst[b], dst[c]);
      drawTriangle(ctx, img, src[b], src[d], src[c], dst[b], dst[d], dst[c]);
    }
  }
}

function Dropzone({
  label,
  hint,
  onFile,
}: {
  label: string;
  hint: string;
  onFile: (f: File) => void;
}) {
  const [drag, setDrag] = useState(false);
  return (
    <label
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
      className={`flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-12 text-center cursor-pointer transition-colors ${
        drag
          ? "border-violet-500 bg-violet-500/10"
          : "border-zinc-300 hover:border-violet-400 dark:border-zinc-700 dark:hover:border-violet-500"
      }`}
    >
      <p className="font-medium text-zinc-800 dark:text-zinc-200">{label}</p>
      <p className="text-xs text-zinc-500">{hint}</p>
      <input
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />
    </label>
  );
}

export default function TattooPlacer({
  initialTattoo,
}: {
  initialTattoo?: Blob | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const konvaRef = useRef<KonvaModule | null>(null);
  const stageRef = useRef<Stage | null>(null);
  const tattooLayerRef = useRef<Layer | null>(null);
  const anchorLayerRef = useRef<Layer | null>(null);
  const tattooNodeRef = useRef<KImage | null>(null);
  const transformerRef = useRef<Transformer | null>(null);
  const bodyDimsRef = useRef<{ natW: number; stageW: number; stageH: number } | null>(
    null,
  );

  // Estado del warp (malla)
  const meshShapeRef = useRef<KShape | null>(null);
  const warpImgRef = useRef<HTMLImageElement | null>(null);
  const warpSrcRef = useRef<Pt[]>([]);
  const warpDstRef = useRef<Pt[]>([]);
  const gridRef = useRef<{ cols: number; rows: number }>({ cols: 3, rows: 3 });

  const [bodyBlob, setBodyBlob] = useState<File | null>(null);
  const [tattooBlob, setTattooBlob] = useState<Blob | null>(initialTattoo ?? null);

  const [isReady, setIsReady] = useState(false);
  const [tattooPlaced, setTattooPlaced] = useState(false);
  const [mode, setMode] = useState<Mode>("transform");
  const [density, setDensity] = useState(3);
  const [opacity, setOpacity] = useState(1);
  const [multiply, setMultiply] = useState(false);

  // Espejos en ref (sincronizados en efectos) para leer el valor actual al crear
  // nodos sin recrearlos cuando cambian.
  const opacityRef = useRef(opacity);
  const multiplyRef = useRef(multiply);
  useEffect(() => {
    opacityRef.current = opacity;
  }, [opacity]);
  useEffect(() => {
    multiplyRef.current = multiply;
  }, [multiply]);

  // ---- Crear el escenario Konva cuando hay foto del cuerpo ----
  useEffect(() => {
    if (!bodyBlob) return;
    let cancelled = false;
    const url = URL.createObjectURL(bodyBlob);
    (async () => {
      const Konva = (await import("konva")).default;
      if (cancelled) return;
      const body = await loadImage(url);
      if (cancelled) return;
      const container = containerRef.current;
      if (!container) return;

      const stageW = container.clientWidth || 800;
      const scale = stageW / body.naturalWidth;
      const stageH = Math.round(body.naturalHeight * scale);
      bodyDimsRef.current = { natW: body.naturalWidth, stageW, stageH };

      const stage = new Konva.Stage({ container, width: stageW, height: stageH });
      const bgLayer = new Konva.Layer();
      const bgImg = new Konva.Image({ image: body, width: stageW, height: stageH });
      bgLayer.add(bgImg);

      const tattooLayer = new Konva.Layer();
      const anchorLayer = new Konva.Layer();
      const tr = new Konva.Transformer({
        rotateEnabled: true,
        keepRatio: false,
        borderStroke: "#7c3aed",
        anchorStroke: "#7c3aed",
        anchorFill: "#ffffff",
        anchorSize: 12,
        anchorCornerRadius: 6,
      });
      tattooLayer.add(tr);

      stage.add(bgLayer);
      stage.add(tattooLayer);
      stage.add(anchorLayer);

      // Selección: clic en el tatuaje lo selecciona; clic en el fondo deselecciona.
      stage.on("click tap", (e) => {
        if (e.target === tattooNodeRef.current) {
          tr.nodes([tattooNodeRef.current]);
        } else {
          tr.nodes([]);
        }
        tattooLayer.batchDraw();
      });

      konvaRef.current = Konva;
      stageRef.current = stage;
      tattooLayerRef.current = tattooLayer;
      anchorLayerRef.current = anchorLayer;
      transformerRef.current = tr;
      bgLayer.draw();
      tattooLayer.draw();
      setIsReady(true);
    })();

    return () => {
      cancelled = true;
      URL.revokeObjectURL(url);
      stageRef.current?.destroy();
      stageRef.current = null;
      tattooNodeRef.current = null;
      transformerRef.current = null;
      tattooLayerRef.current = null;
      anchorLayerRef.current = null;
      meshShapeRef.current = null;
      setIsReady(false);
      setTattooPlaced(false);
    };
  }, [bodyBlob]);

  // ---- Colocar / reemplazar el tatuaje ----
  useEffect(() => {
    if (!isReady || !tattooBlob) return;
    let cancelled = false;
    const url = URL.createObjectURL(tattooBlob);
    (async () => {
      const Konva = konvaRef.current;
      const layer = tattooLayerRef.current;
      const tr = transformerRef.current;
      const dims = bodyDimsRef.current;
      if (!Konva || !layer || !tr || !dims) return;
      const img = await loadImage(url);
      if (cancelled) return;

      // Limpiar cualquier malla previa.
      meshShapeRef.current?.destroy();
      meshShapeRef.current = null;
      anchorLayerRef.current?.destroyChildren();
      warpImgRef.current = null;
      warpSrcRef.current = [];
      warpDstRef.current = [];

      tattooNodeRef.current?.destroy();

      const targetW = dims.stageW * 0.35;
      const s = targetW / img.naturalWidth;
      const node = new Konva.Image({
        image: img,
        draggable: true,
        x: dims.stageW / 2,
        y: dims.stageH / 2,
        offsetX: img.naturalWidth / 2,
        offsetY: img.naturalHeight / 2,
        scaleX: s,
        scaleY: s,
        opacity: opacityRef.current,
      });
      if (multiplyRef.current) node.globalCompositeOperation("multiply");
      node.on("click tap", () => {
        tr.nodes([node]);
        layer.batchDraw();
      });

      layer.add(node);
      tr.moveToTop();
      tr.nodes([node]);
      tattooNodeRef.current = node;
      layer.batchDraw();
      setMode("transform");
      setTattooPlaced(true);
    })();

    return () => {
      cancelled = true;
      URL.revokeObjectURL(url);
    };
  }, [isReady, tattooBlob]);

  // Aplicar opacidad / multiply a lo que esté activo (imagen o malla).
  useEffect(() => {
    tattooNodeRef.current?.opacity(opacity);
    meshShapeRef.current?.opacity(opacity);
    tattooLayerRef.current?.batchDraw();
  }, [opacity]);

  useEffect(() => {
    const comp = multiply ? "multiply" : "source-over";
    tattooNodeRef.current?.globalCompositeOperation(comp);
    meshShapeRef.current?.globalCompositeOperation(comp);
    tattooLayerRef.current?.batchDraw();
  }, [multiply]);

  // ---- Construir la malla a partir de la transformación actual del tatuaje ----
  const bakeMesh = useCallback((cols: number, rows: number) => {
    const node = tattooNodeRef.current;
    const Konva = konvaRef.current;
    const tLayer = tattooLayerRef.current;
    const aLayer = anchorLayerRef.current;
    if (!node || !Konva || !tLayer || !aLayer) return;

    const img = node.image() as HTMLImageElement;
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const t = node.getAbsoluteTransform();

    const src: Pt[] = [];
    const dst: Pt[] = [];
    for (let j = 0; j <= rows; j++) {
      for (let i = 0; i <= cols; i++) {
        const sx = (i / cols) * w;
        const sy = (j / rows) * h;
        src.push({ x: sx, y: sy });
        const p = t.point({ x: sx, y: sy });
        dst.push({ x: p.x, y: p.y });
      }
    }
    warpImgRef.current = img;
    warpSrcRef.current = src;
    warpDstRef.current = dst;
    gridRef.current = { cols, rows };

    meshShapeRef.current?.destroy();
    aLayer.destroyChildren();

    const shape = new Konva.Shape({
      listening: false,
      opacity: opacityRef.current,
      sceneFunc: (context) => {
        const ctx = (context as unknown as { _context: CanvasRenderingContext2D })
          ._context;
        const image = warpImgRef.current;
        if (!image) return;
        drawMesh(
          ctx,
          image,
          warpSrcRef.current,
          warpDstRef.current,
          gridRef.current.cols,
          gridRef.current.rows,
        );
      },
    });
    if (multiplyRef.current) shape.globalCompositeOperation("multiply");
    meshShapeRef.current = shape;
    tLayer.add(shape);

    dst.forEach((p, k) => {
      const circle = new Konva.Circle({
        x: p.x,
        y: p.y,
        radius: 7,
        fill: "#7c3aed",
        stroke: "#ffffff",
        strokeWidth: 2,
        draggable: true,
      });
      circle.on("dragmove", () => {
        warpDstRef.current[k] = { x: circle.x(), y: circle.y() };
        tLayer.batchDraw();
      });
      circle.on("mouseenter", () => {
        const st = circle.getStage();
        if (st) st.container().style.cursor = "grab";
      });
      circle.on("mouseleave", () => {
        const st = circle.getStage();
        if (st) st.container().style.cursor = "default";
      });
      aLayer.add(circle);
    });

    tLayer.batchDraw();
    aLayer.batchDraw();
  }, []);

  const enterWarp = useCallback(() => {
    const node = tattooNodeRef.current;
    if (!node) return;
    transformerRef.current?.nodes([]);
    node.draggable(false);
    node.visible(false);
    bakeMesh(gridRef.current.cols, gridRef.current.rows);
    tattooLayerRef.current?.batchDraw();
    setMode("warp");
  }, [bakeMesh]);

  const exitWarp = useCallback(() => {
    meshShapeRef.current?.destroy();
    meshShapeRef.current = null;
    anchorLayerRef.current?.destroyChildren();
    warpImgRef.current = null;
    warpSrcRef.current = [];
    warpDstRef.current = [];
    const node = tattooNodeRef.current;
    if (node) {
      node.visible(true);
      node.draggable(true);
      transformerRef.current?.nodes([node]);
    }
    tattooLayerRef.current?.batchDraw();
    anchorLayerRef.current?.batchDraw();
    setMode("transform");
  }, []);

  const changeDensity = useCallback(
    (d: number) => {
      setDensity(d);
      gridRef.current = { cols: d, rows: d };
      if (meshShapeRef.current) bakeMesh(d, d); // re-hornea (reinicia deformación)
    },
    [bakeMesh],
  );

  const resetMesh = useCallback(() => {
    bakeMesh(gridRef.current.cols, gridRef.current.rows);
  }, [bakeMesh]);

  const flipH = useCallback(() => {
    const n = tattooNodeRef.current;
    if (n) {
      n.scaleX(n.scaleX() * -1);
      n.getLayer()?.batchDraw();
    }
  }, []);

  const removeTattoo = useCallback(() => {
    meshShapeRef.current?.destroy();
    meshShapeRef.current = null;
    anchorLayerRef.current?.destroyChildren();
    anchorLayerRef.current?.batchDraw();
    tattooNodeRef.current?.destroy();
    tattooNodeRef.current = null;
    transformerRef.current?.nodes([]);
    tattooLayerRef.current?.batchDraw();
    setTattooPlaced(false);
    setMode("transform");
    setTattooBlob(null);
  }, []);

  const download = useCallback(() => {
    const stage = stageRef.current;
    const dims = bodyDimsRef.current;
    if (!stage || !dims) return;
    const tr = transformerRef.current;
    const selected = tr?.nodes() ?? [];
    tr?.nodes([]);
    anchorLayerRef.current?.visible(false);
    tr?.getLayer()?.batchDraw();

    const pixelRatio = dims.natW / dims.stageW; // resolución nativa del cuerpo
    const uri = stage.toDataURL({ mimeType: "image/png", pixelRatio });

    if (selected.length) tr?.nodes(selected);
    anchorLayerRef.current?.visible(true);
    stage.batchDraw();

    const a = document.createElement("a");
    a.href = uri;
    a.download = "tatuaje-en-el-cuerpo.png";
    a.click();
  }, []);

  const resetAll = useCallback(() => {
    setBodyBlob(null);
    setTattooBlob(null);
  }, []);

  // ---- Render ----
  if (!bodyBlob) {
    return (
      <div className="w-full flex flex-col gap-4">
        <Dropzone
          label="Subí la foto del cuerpo"
          hint="La parte del cuerpo donde va el tatuaje (brazo, pierna, etc.)"
          onFile={setBodyBlob}
        />
        {tattooBlob && (
          <p className="text-center text-xs text-emerald-600 dark:text-emerald-400">
            ✓ Ya tenés un tatuaje recortado listo para colocar
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col gap-5">
      {/* Lienzo Konva */}
      <div
        ref={containerRef}
        className="mx-auto w-full rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900"
        style={{ lineHeight: 0, touchAction: "none" }}
      />

      {!tattooBlob && (
        <div className="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 p-4">
          <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
            Ahora subí el <strong>PNG del tatuaje</strong> (recortado en la Etapa 1) para
            colocarlo encima.
          </p>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700">
            Elegir tatuaje (PNG)
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) setTattooBlob(f);
              }}
            />
          </label>
        </div>
      )}

      {tattooBlob && tattooPlaced && (
        <>
          {/* Selector de modo */}
          <div className="flex justify-center">
            <div className="inline-flex rounded-full border border-zinc-300 dark:border-zinc-700 p-0.5">
              <button
                onClick={() => mode === "warp" && exitWarp()}
                className={`rounded-full px-4 py-1.5 text-sm font-medium ${
                  mode === "transform"
                    ? "bg-violet-600 text-white"
                    : "text-zinc-600 dark:text-zinc-300"
                }`}
              >
                Mover / Rotar
              </button>
              <button
                onClick={() => mode === "transform" && enterWarp()}
                className={`rounded-full px-4 py-1.5 text-sm font-medium ${
                  mode === "warp"
                    ? "bg-violet-600 text-white"
                    : "text-zinc-600 dark:text-zinc-300"
                }`}
              >
                Deformar
              </button>
            </div>
          </div>

          <p className="text-center text-xs text-zinc-500">
            {mode === "transform"
              ? "Tocá el tatuaje para seleccionarlo · arrastralo para moverlo · usá los tiradores para escalar y rotar"
              : "Arrastrá cada punto violeta para deformar el tatuaje y adaptarlo a la curvatura del cuerpo"}
          </p>

          <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm">
                <span className="text-zinc-500">Opacidad</span>
                <input
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.05}
                  value={opacity}
                  onChange={(e) => setOpacity(Number(e.target.value))}
                  className="accent-violet-600"
                />
                <span className="w-10 text-right tabular-nums">
                  {Math.round(opacity * 100)}%
                </span>
              </label>

              <button
                onClick={() => setMultiply((m) => !m)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium border ${
                  multiply
                    ? "bg-violet-600 text-white border-violet-600"
                    : "border-zinc-300 dark:border-zinc-700"
                }`}
                title="Funde la tinta con la piel (adelanto del realismo)"
              >
                Fusionar con la piel
              </button>

              {mode === "transform" && (
                <button
                  onClick={flipH}
                  className="rounded-full border border-zinc-300 dark:border-zinc-700 px-4 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  Espejar
                </button>
              )}

              {mode === "warp" && (
                <>
                  <label className="flex items-center gap-2 text-sm">
                    <span className="text-zinc-500">Grilla</span>
                    <select
                      value={density}
                      onChange={(e) => changeDensity(Number(e.target.value))}
                      className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1"
                    >
                      <option value={2}>2 × 2</option>
                      <option value={3}>3 × 3</option>
                      <option value={4}>4 × 4</option>
                      <option value={5}>5 × 5</option>
                    </select>
                  </label>
                  <button
                    onClick={resetMesh}
                    className="rounded-full border border-zinc-300 dark:border-zinc-700 px-4 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  >
                    Reiniciar malla
                  </button>
                </>
              )}

              <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-zinc-300 dark:border-zinc-700 px-4 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800">
                Cambiar tatuaje
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) setTattooBlob(f);
                  }}
                />
              </label>

              <button
                onClick={removeTattoo}
                className="rounded-full border border-red-300 dark:border-red-800 px-4 py-1.5 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-500/10"
              >
                Quitar tatuaje
              </button>
            </div>

            {mode === "warp" && (
              <p className="text-xs text-zinc-500">
                Volver a &quot;Mover / Rotar&quot; reinicia la deformación. Deformá y
                exportá desde este modo. Más puntos en la grilla = ajuste más fino.
              </p>
            )}
            {multiply && (
              <p className="text-xs text-zinc-500">
                &quot;Fusionar con la piel&quot; usa modo <em>multiply</em>: la tinta se
                mezcla con el tono y las sombras de la piel. En la Etapa 4 la IA lo va a
                perfeccionar.
              </p>
            )}
          </section>
        </>
      )}

      {/* Acciones finales */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={download}
          className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-6 py-2.5 font-medium text-white hover:bg-emerald-700"
        >
          Descargar resultado
        </button>
        <button
          onClick={resetAll}
          className="inline-flex items-center gap-2 rounded-full border border-zinc-300 dark:border-zinc-700 px-6 py-2.5 font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          Empezar de nuevo
        </button>
      </div>
    </div>
  );
}
