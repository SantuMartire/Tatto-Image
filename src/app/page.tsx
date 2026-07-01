import Studio from "@/components/Studio";

export default function Home() {
  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 dark:bg-black">
      <main className="flex flex-1 w-full max-w-4xl flex-col items-center gap-8 px-6 py-16">
        <header className="flex flex-col items-center gap-3 text-center">
          <span className="rounded-full bg-violet-100 dark:bg-violet-500/15 px-3 py-1 text-xs font-medium text-violet-700 dark:text-violet-300">
            Tattoo Studio
          </span>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Probá tu tatuaje en el cuerpo
          </h1>
          <p className="max-w-md text-zinc-600 dark:text-zinc-400">
            Recortá el tatuaje, colocalo sobre la foto del cuerpo y ajustalo.
            Todo el procesamiento ocurre en tu navegador.
          </p>
        </header>

        <Studio />
      </main>
    </div>
  );
}
