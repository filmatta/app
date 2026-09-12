import Link from "next/link";
import type { MattiPose } from "@/lib/contextual-assistance/types";
import ContextProgressCard from "./ContextProgressCard";
import MattiCard from "./MattiCard";
import NextActionCard from "./NextActionCard";

export type ContextNextAction = {
  title: string;
  description?: string | null;
  href: string;
  label: string;
  commercial?: boolean;
};

export default function ContextSidebar({
  percentage,
  completedLessons,
  totalLessons,
  nextAction,
  tip,
  pose,
  syllabusHref,
  unitLabel = "lecciones",
  showMobileProgress = true,
}: {
  percentage: number;
  completedLessons: number;
  totalLessons: number;
  nextAction: ContextNextAction;
  tip: string;
  pose: MattiPose;
  syllabusHref: string;
  unitLabel?: "lecciones" | "pasos";
  showMobileProgress?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div
        className={`min-[1100px]:order-2 ${
          showMobileProgress ? "" : "hidden min-[1100px]:block"
        }`}
      >
        <ContextProgressCard
          percentage={percentage}
          completedLessons={completedLessons}
          totalLessons={totalLessons}
          unitLabel={unitLabel}
        />
      </div>
      <div className="min-[1100px]:order-3">
        <NextActionCard {...nextAction} />
      </div>
      <div className="min-[1100px]:order-1">
        <MattiCard pose={pose} message={tip} />
      </div>
      <section className="order-4 rounded-xl border border-white/[0.07] px-4 py-3.5">
        <p className="text-sm font-medium text-white/65">¿Necesitas ayuda?</p>
        <Link
          href={syllabusHref}
          className="mt-1.5 inline-flex text-sm text-white/40 transition hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          Revisar el temario
        </Link>
      </section>
    </div>
  );
}
