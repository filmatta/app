import { timingSafeEqual } from "node:crypto";
import { cleanPortfolioMedia, cleanPortfolioOrphans } from "@/lib/profiles/mux-media";
import { cleanDiscardedReelCovers } from "@/lib/profiles/reel-cover-cleanup";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const supplied = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const suppliedBytes = Buffer.from(supplied),
    expectedBytes = Buffer.from(expected);
  if (
    !secret ||
    suppliedBytes.length !== expectedBytes.length ||
    !timingSafeEqual(suppliedBytes, expectedBytes)
  )
    return new Response(null, { status: 401 });
  try {
    return Response.json({ reconciled: await cleanPortfolioMedia(), orphanedForReview: await cleanPortfolioOrphans(), reelCoversRemoved: await cleanDiscardedReelCovers() });
  } catch {
    return Response.json(
      { error: "Cleanup pendiente de reintento." },
      { status: 503 },
    );
  }
}
