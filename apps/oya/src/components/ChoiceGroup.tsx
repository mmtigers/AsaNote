"use client";

import type { Choice } from "@/constants/choices";

/**
 * 選択肢のボタン(1つだけ選ぶ)。高齢の利用者が押しやすいよう、大きなボタンにする。
 * 選んでいるボタンをもう一度押すと、選択を外して「未入力」(null)に戻す(「しなかった」などとは区別する)。
 */
export function ChoiceGroup<T extends string | boolean>({
  label,
  choices,
  value,
  onChange,
  disabled,
}: {
  label: string;
  choices: readonly Choice<T>[];
  value: T | null;
  onChange: (value: T | null) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-lg font-bold">
        {label}
        {value === null && <span className="ml-2 text-sm font-normal text-[var(--sub)]">(未入力)</span>}
      </legend>
      {/* 選択肢の数に合わせて列を決める(2択なら広く)。文字は、折り返すときも語の途中で切らない(auto-phrase。
          対応していないブラウザでは、ふつうの折り返し)。 */}
      <div role="radiogroup" aria-label={label} className={`grid gap-2 ${choices.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
        {choices.map((choice) => {
          const selected = value === choice.value;
          return (
            <button
              key={String(choice.value)}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={choice.label}
              disabled={disabled}
              onClick={() => onChange(selected ? null : choice.value)}
              className={`min-h-14 rounded-2xl px-1 py-3 text-base font-bold leading-tight [word-break:auto-phrase] focus:ring-2 focus:ring-[var(--accent)] disabled:opacity-60 ${
                selected ? "bg-[var(--accent)] text-[var(--accent-ink)]" : "bg-[var(--surface-2)] text-[var(--ink)]"
              }`}
            >
              {choice.lines
                ? choice.lines.map((line) => (
                    <span key={line} className="block">
                      {line}
                    </span>
                  ))
                : choice.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
