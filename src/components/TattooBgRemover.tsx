"use client";

import { useCallback, useRef, useState } from "react";
import MaskEditor from "./MaskEditor";

export default function TattooBgRemover() {
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState("tatuaje");
  const [isDragging, setIsDragging] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((f: File) => {
    if (!f.type.startsWith("image/")) {
      setErrorMsg("El archivo debe ser una imagen (PNG, JPG, WEBP…).");
      return;
    }
    setErrorMsg("");
    setFileName(f.name.replace(/\.[^.]+$/, "") || "tatuaje");
    setFile(f);
  }, []);

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const reset = useCallback(() => {
    setFile(null);
    setErrorMsg("");
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  if (file) {
    return <MaskEditor file={file} fileName={fileName} onReset={reset} />;
  }

  return (
    <div className="w-full max-w-4xl flex flex-col gap-4">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        className={`group flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-16 text-center cursor-pointer transition-colors ${
          isDragging
            ? "border-violet-500 bg-violet-500/10"
            : "border-zinc-300 hover:border-violet-400 dark:border-zinc-700 dark:hover:border-violet-500"
        }`}
      >
        <svg
          className="h-12 w-12 text-zinc-400 group-hover:text-violet-500 transition-colors"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"
          />
        </svg>
        <div>
          <p className="font-medium text-zinc-800 dark:text-zinc-200">
            Arrastrá la foto aquí
          </p>
          <p className="text-sm text-zinc-500">o hacé clic para elegir un archivo</p>
        </div>
        <p className="text-xs text-zinc-400">
          Un diseño con fondo, o una foto de un tatuaje en la piel — se procesa en tu
          navegador
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onInputChange}
        />
      </label>

      {errorMsg && (
        <p className="text-sm text-red-500 bg-red-500/10 rounded-lg px-4 py-2">{errorMsg}</p>
      )}
    </div>
  );
}
