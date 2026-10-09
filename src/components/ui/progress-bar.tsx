export function ProgressBar({ value, label }: { value: number; label: string }) {
  const clampedValue = Math.max(0, Math.min(100, value));
  return (
    <div
      className="progress-track"
      role="progressbar"
      aria-label={label}
      aria-valuenow={clampedValue}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span style={{ width: `${clampedValue}%` }} />
    </div>
  );
}
