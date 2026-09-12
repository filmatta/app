export default function ContextProgressCard({ percentage, completedLessons, totalLessons, unitLabel = "lecciones" }: { percentage: number; completedLessons: number; totalLessons: number; unitLabel?: "lecciones" | "pasos" }) {
  return (
    <section aria-labelledby="context-progress-title" className="rounded-xl border border-white/[0.09] bg-white/[0.02] p-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">Tu progreso</p>
          <h2 id="context-progress-title" className="mt-2 text-2xl font-semibold">{percentage}%</h2>
        </div>
        <p className="pb-1 text-xs text-white/40">{completedLessons}/{totalLessons} {unitLabel}</p>
      </div>
      <div role="progressbar" aria-label="Progreso del curso" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percentage} className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
        <span className="block h-full rounded-full bg-red-400/80" style={{ width: `${percentage}%` }} />
      </div>
    </section>
  );
}
