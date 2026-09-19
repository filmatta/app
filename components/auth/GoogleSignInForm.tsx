import { signInWithGoogle } from "@/app/auth/actions";
import LoadingButton from "@/components/ui/LoadingButton";

export default function GoogleSignInForm({ nextPath }: { nextPath: string }) {
  return (
    <>
      <form action={signInWithGoogle} className="mt-10">
        <input type="hidden" name="next" value={nextPath} />
        <LoadingButton
          type="submit"
          loadingText="Conectando con Google…"
          className="w-full rounded-full border border-white/15 bg-white px-6 py-4 font-semibold text-black transition hover:bg-white/90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
        >
          <span
            aria-hidden
            className="grid h-5 w-5 place-items-center rounded-full border border-black/15 text-xs font-bold"
          >
            G
          </span>
          Continuar con Google
        </LoadingButton>
      </form>

      <div className="my-8 flex items-center gap-4" aria-hidden>
        <span className="h-px flex-1 bg-white/10" />
        <span className="text-xs uppercase tracking-[0.2em] text-white/30">
          o con correo
        </span>
        <span className="h-px flex-1 bg-white/10" />
      </div>
    </>
  );
}
