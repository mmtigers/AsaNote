"use client";

// 今日の体調を1〜5の5段階で記録する簡易入力(#3-4)。ロール(夫/妻)の概念は
// 無いため、記録する人なら誰でも自分の体調として入力できる。PMS周期との
// 相関などを将来見られるよう、日付と紐づけて保存する(傾向タブ側は未対応)。
//
// #5-4: 記録フローの入力項目としては不要という判断で ReasonStepView から
// 外し、現在はどこからも呼ばれていない。conditionScale自体の型・保存・同期
// ロジックは残しているため、UIを復活させたい場合はここを再度importするだけでよい。
const SCALE_OPTIONS = [
  { value: 1, emoji: "😩", label: "つらい" },
  { value: 2, emoji: "😟", label: "いまいち" },
  { value: 3, emoji: "😐", label: "ふつう" },
  { value: 4, emoji: "🙂", label: "良い" },
  { value: 5, emoji: "😄", label: "絶好調" },
] as const;

interface ConditionScalePickerProps {
  value: number | null;
  onChange: (next: number | null) => void;
}

export function ConditionScalePicker({ value, onChange }: ConditionScalePickerProps) {
  return (
    <div>
      <p className="mb-1.5 block text-xs text-[var(--sub)]">今日の体調(任意)</p>
      <div className="flex gap-1.5">
        {SCALE_OPTIONS.map((opt) => {
          const isSelected = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              aria-pressed={isSelected}
              aria-label={`体調${opt.value}: ${opt.label}`}
              onClick={() => onChange(isSelected ? null : opt.value)}
              className={`flex flex-1 flex-col items-center gap-0.5 rounded-xl border py-2 text-[11px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${
                isSelected
                  ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                  : "border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink)]"
              }`}
            >
              <span className="text-lg leading-none">{opt.emoji}</span>
              <span>{opt.value}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
