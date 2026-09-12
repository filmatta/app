import Link from "next/link";

export default function NextActionCard({ eyebrow = "Siguiente paso", title, description, href, label, commercial = false }: { eyebrow?: string; title: string; description?: string | null; href: string; label: string; commercial?: boolean }) {
  return (
    <section className={`rounded-xl border p-4 ${commercial ? "border-red-400/20 bg-red-500/[0.035]" : "border-white/[0.09] bg-white/[0.02]"}`}>
      <p className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${commercial ? "text-red-200/65" : "text-white/35"}`}>{eyebrow}</p>
      <h2 className="mt-2 text-base font-semibold leading-6">{title}</h2>
      {description && <p className="mt-2 text-sm leading-6 text-white/45">{description}</p>}
      <Link href={href} className={`mt-4 inline-flex w-full items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-white ${commercial ? "bg-white text-black hover:bg-white/85" : "border border-white/15 text-white/80 hover:bg-white/[0.06] hover:text-white"}`}>
        {label}
      </Link>
    </section>
  );
}
