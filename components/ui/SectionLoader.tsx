import LoadingSpinner from "./LoadingSpinner";

export default function SectionLoader({
  title,
  className = "",
}: {
  title: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={`flex items-center gap-3 text-sm text-white/45 ${className}`}
    >
      <LoadingSpinner size="sm" />
      <span>{title}</span>
    </div>
  );
}
