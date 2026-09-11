export default function Skeleton({
  className = "",
}: {
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={`block animate-pulse rounded-lg bg-white/[0.07] motion-reduce:animate-none ${className}`}
    />
  );
}
