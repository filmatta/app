import Link from "next/link";
export default function MetaChip({ label, href }: { label: string; href?: string }) {
  const content = <><span aria-hidden="true">#</span>{label}</>;
  return href ? <Link className="meta-chip" href={href}>{content}</Link> : <span className="meta-chip">{content}</span>;
}
export function MetaChips({ labels, limit = 5 }: { labels: (string | null | undefined)[]; limit?: number }) {
  const values = [...new Set(labels.filter((v): v is string => Boolean(v?.trim())))];
  return values.length ? <div className="meta-chips">{values.slice(0, limit).map(label => <MetaChip key={label} label={label} />)}{values.length > limit && <span className="meta-chip" title={values.slice(limit).join(" · ")}>+{values.length - limit}</span>}</div> : null;
}
