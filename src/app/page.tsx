import TattooBgRemover from "@/components/TattooBgRemover";

export default function Home() {
  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 dark:bg-black">
      <main className="flex flex-1 w-full max-w-4xl flex-col items-center gap-10 px-6 py-16">
        <header className="flex flex-col items-center gap-3 text-center">
          <span className="rounded-full bg-violet-100 dark:bg-violet-500/15 px-3 py-1 text-xs font-medium text-violet-700 dark:text-violet-300">
            Etapa 1 · Quitar fondo
          </span>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Tattoo Studio
          </h1>
          <p className="max-w-md text-zinc-600 dark:text-zinc-400">
            Subí la foto de un tatuaje y le quitamos el fondo automáticamente.
            Todo el procesamiento ocurre en tu navegador.
          </p>
        </header>

        <TattooBgRemover />
      </main>
    </div>
  );
}
