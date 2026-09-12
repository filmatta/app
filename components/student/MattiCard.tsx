import Image from "next/image";
import { MATTI_POSE_ASSETS } from "@/lib/contextual-assistance/matti";
import type { MattiPose } from "@/lib/contextual-assistance/types";

export default function MattiCard({
  pose,
  message,
}: {
  pose: MattiPose;
  message: string;
}) {
  return (
    <section
      aria-labelledby="matti-message-title"
      className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-3 overflow-hidden rounded-xl border border-amber-200/20 bg-amber-300/[0.055] p-3.5 max-[359px]:grid-cols-1 min-[1440px]:grid-cols-[5rem_minmax(0,1fr)] min-[1440px]:gap-4 min-[1440px]:p-4"
    >
      <div className="flex h-[4.5rem] w-[4.5rem] shrink-0 items-center justify-center p-1 max-[359px]:justify-self-start min-[1440px]:h-20 min-[1440px]:w-20">
        <Image
          src={MATTI_POSE_ASSETS[pose]}
          alt=""
          width={1254}
          height={1254}
          sizes="(min-width: 1440px) 80px, 72px"
          className="pointer-events-none size-full object-contain"
        />
      </div>

      <div className="min-w-0">
        <p
          id="matti-message-title"
          className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100/55"
        >
          Matti
        </p>
        <p className="mt-2 text-sm leading-6 text-white/75">{message}</p>
      </div>
    </section>
  );
}
