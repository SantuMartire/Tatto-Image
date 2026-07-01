"use client";

import { useState } from "react";
import TattooBgRemover from "./TattooBgRemover";
import TattooPlacer from "./TattooPlacer";

type Step = "prepare" | "place";

function StepButton({
  active,
  done,
  n,
  label,
  onClick,
}: {
  active: boolean;
  done: boolean;
  n: number;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
        active
          ? "bg-violet-600 text-white"
          : "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
      }`}
    >
      <span
        className={`grid h-5 w-5 place-items-center rounded-full text-xs ${
          active
            ? "bg-white/25"
            : done
              ? "bg-emerald-500 text-white"
              : "bg-zinc-200 dark:bg-zinc-700"
        }`}
      >
        {done && !active ? "✓" : n}
      </span>
      {label}
    </button>
  );
}

export default function Studio() {
  const [step, setStep] = useState<Step>("prepare");
  const [tattoo, setTattoo] = useState<Blob | null>(null);

  return (
    <div className="w-full max-w-4xl flex flex-col gap-6">
      <nav className="flex items-center justify-center gap-1">
        <StepButton
          active={step === "prepare"}
          done={tattoo !== null}
          n={1}
          label="Preparar tatuaje"
          onClick={() => setStep("prepare")}
        />
        <div className="h-px w-6 bg-zinc-300 dark:bg-zinc-700" />
        <StepButton
          active={step === "place"}
          done={false}
          n={2}
          label="Colocar en el cuerpo"
          onClick={() => setStep("place")}
        />
      </nav>

      {step === "prepare" ? (
        <TattooBgRemover
          onUseInBody={(blob) => {
            setTattoo(blob);
            setStep("place");
          }}
        />
      ) : (
        <TattooPlacer initialTattoo={tattoo} />
      )}
    </div>
  );
}
