import Link from "next/link";
import { toolStatus, type Tool } from "@/lib/tools/registry";
export default function ToolCards({ items }: { items: readonly Tool[] }) {
  return (
    <div className="grid gap-px border border-white/15 bg-white/15 md:grid-cols-2">
      {items.map((tool) => (
        <Link
          key={tool.slug}
          href={tool.href}
          className="group min-w-0 bg-[#101014] p-6 transition hover:bg-[#18181f] focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-[#BFC0D7] sm:p-9"
        >
          <div className="flex flex-wrap justify-between gap-3 text-xs uppercase tracking-widest">
            <span className="text-white/65">{tool.category}</span>
            <span className="text-[#BFC0D7]">{toolStatus[tool.status]}</span>
          </div>
          <h2 className="mt-9 text-2xl font-medium tracking-tight">
            {tool.name}{" "}
            <span
              aria-hidden="true"
              className="inline-block transition group-hover:translate-x-1"
            >
              ↗
            </span>
          </h2>
          <p className="mt-4 max-w-lg text-sm leading-7 text-white/70">
            {tool.description}
          </p>
          <p className="mt-6 text-xs text-white/60">
            {tool.status === "in-development"
              ? "Conocer la visión del producto"
              : "Acceso público · Sin registro"}
          </p>
        </Link>
      ))}
    </div>
  );
}
