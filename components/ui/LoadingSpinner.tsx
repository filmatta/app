type SpinnerSize = "sm" | "md" | "lg";

const sizeClasses: Record<SpinnerSize, string> = {
  sm: "size-3.5 border",
  md: "size-5 border-2",
  lg: "size-8 border-2",
};

export default function LoadingSpinner({
  size = "md",
  label,
  className = "",
}: {
  size?: SpinnerSize;
  label?: string;
  className?: string;
}) {
  const spinner = (
    <span
      aria-hidden="true"
      className={`${sizeClasses[size]} inline-block shrink-0 animate-spin rounded-full border-current border-r-transparent motion-reduce:animate-none ${className}`}
    />
  );

  if (!label) return spinner;

  return (
    <span role="status" className="inline-flex items-center gap-2">
      {spinner}
      <span className="sr-only">{label}</span>
    </span>
  );
}
