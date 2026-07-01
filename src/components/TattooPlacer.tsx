"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Stage } from "konva/lib/Stage";
import type { Layer } from "konva/lib/Layer";
import type { Image as KImage } from "konva/lib/shapes/Image";
import type { Transformer } from "konva/lib/shapes/Transformer";
// Solo tipos (se borran en compilación). El runtime se importa dinámico en el efecto.
type KonvaModule = typeof import("konva")["default"];

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
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
  const tattooNodeRef = useRef<KImage | null>(null);
  const transformerRef = useRef<Transformer | null>(null);
  const bodyDimsRef = useRef<{ natW: number; stageW: number; stageH: number } | null>(
    null,
  );

  const [bodyBlob, setBodyBlob] = useState<File | null>(null);
  const [tattooBlob, setTattooBlob] = useState<Blob | null>(initialTattoo ?? null);

  const [isReady, setIsReady] = useState(false);
  const [opacity, setOpacity] = useState(1);
  const [multiply, setMultiply] = useState(false);

  // Espejos en ref (sincronizados en efectos) para leer el valor actual al crear
  // el nodo sin volver a crearlo cuando cambian.
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
      setIsReady(false);
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
      tr.moveToTop(); // los tiradores por encima del tatuaje
      tr.nodes([node]);
      tattooNodeRef.current = node;
      layer.batchDraw();
    })();

    return () => {
      cancelled = true;
      URL.revokeObjectURL(url);
    };
  }, [isReady, tattooBlob]);

  // Aplicar opacidad / multiply al nodo existente.
  useEffect(() => {
    const n = tattooNodeRef.current;
    if (n) {
      n.opacity(opacity);
      n.getLayer()?.batchDraw();
    }
  }, [opacity]);

  useEffect(() => {
    const n = tattooNodeRef.current;
    if (n) {
      n.globalCompositeOperation(multiply ? "multiply" : "source-over");
      n.getLayer()?.batchDraw();
    }
  }, [multiply]);

  const flipH = useCallback(() => {
    const n = tattooNodeRef.current;
    if (n) {
      n.scaleX(n.scaleX() * -1);
      n.getLayer()?.batchDraw();
    }
  }, []);

  const removeTattoo = useCallback(() => {
    tattooNodeRef.current?.destroy();
    tattooNodeRef.current = null;
    transformerRef.current?.nodes([]);
    tattooLayerRef.current?.batchDraw();
    setTattooBlob(null);
  }, []);

  const download = useCallback(() => {
    const stage = stageRef.current;
    const dims = bodyDimsRef.current;
    if (!stage || !dims) return;
    // Ocultar los tiradores en la exportación.
    const tr = transformerRef.current;
    const selected = tr?.nodes() ?? [];
    tr?.nodes([]);
    tr?.getLayer()?.batchDraw();

    const pixelRatio = dims.natW / dims.stageW; // exportar a resolución nativa del cuerpo
    const uri = stage.toDataURL({ mimeType: "image/png", pixelRatio });

    if (selected.length) {
      tr?.nodes(selected);
      tr?.getLayer()?.batchDraw();
    }

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

      {tattooBlob && (
        <>
          <p className="text-center text-xs text-zinc-500">
            Tocá el tatuaje para seleccionarlo · arrastralo para moverlo · usá los tiradores
            para escalar y rotar
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

              <button
                onClick={flipH}
                className="rounded-full border border-zinc-300 dark:border-zinc-700 px-4 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                Espejar
              </button>

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
