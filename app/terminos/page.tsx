import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Términos de uso",
  description: "Condiciones generales para utilizar FILMATTA.",
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#080808] text-white">
      <header className="border-b border-white/10">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-5">
          <Link href="/" className="text-xl font-black tracking-[0.25em]">
            FILMATTA
          </Link>
          <Link href="/" className="text-sm text-white/50 hover:text-white">
            ← Volver
          </Link>
        </div>
      </header>

      <article className="mx-auto max-w-4xl px-6 py-16 sm:py-24">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/35">
          Información legal
        </p>
        <h1 className="mt-5 text-5xl font-semibold tracking-[-0.04em] sm:text-6xl">
          Términos de uso
        </h1>
        <p className="mt-5 text-sm text-white/40">
          Última actualización: 19 de septiembre de 2026
        </p>

        <div className="mt-14 space-y-10 text-base leading-8 text-white/65">
          <LegalSection title="1. Uso de FILMATTA">
            <p>
              FILMATTA es una plataforma para aprender, crear una identidad
              profesional y conectar con recursos de la industria audiovisual.
              Debes utilizarla de forma legal, respetuosa y compatible con la
              finalidad de cada función.
            </p>
          </LegalSection>

          <LegalSection title="2. Tu cuenta">
            <p>
              Eres responsable de mantener el control de los métodos con los
              que accedes a tu cuenta y de que la información que proporcionas
              sea correcta. No debes suplantar identidades, compartir acceso de
              forma abusiva ni intentar eludir controles de seguridad.
            </p>
          </LegalSection>

          <LegalSection title="3. Contenido y conducta">
            <p>
              Conservas los derechos que te correspondan sobre el contenido que
              aportes. Al publicarlo, declaras que tienes autorización para
              hacerlo. No se permite contenido ilícito, fraudulento, abusivo,
              invasivo de la privacidad o que infrinja derechos de terceros.
            </p>
          </LegalSection>

          <LegalSection title="4. Disponibilidad del servicio">
            <p>
              Podemos modificar, suspender o retirar funciones para mantener la
              seguridad, cumplir obligaciones o mejorar el producto. Procuramos
              ofrecer un servicio confiable, pero no garantizamos disponibilidad
              ininterrumpida ni que todo contenido de terceros sea exacto.
            </p>
          </LegalSection>

          <LegalSection title="5. Suspensión y terminación">
            <p>
              Podemos limitar o suspender cuentas que incumplan estos términos,
              causen riesgo a otras personas o comprometan la seguridad de
              FILMATTA. Puedes dejar de utilizar el servicio y solicitar la
              eliminación de tu cuenta.
            </p>
          </LegalSection>

          <LegalSection title="6. Contacto">
            <p>
              Para consultas sobre estos términos, escribe a{" "}
              <a
                href="mailto:alain.tonatiuh@gmail.com"
                className="text-white underline decoration-white/30 underline-offset-4 hover:decoration-white"
              >
                alain.tonatiuh@gmail.com
              </a>
              . Este contacto será reemplazado por support@filmatta.com cuando
              esté disponible.
            </p>
          </LegalSection>
        </div>
      </article>
    </main>
  );
}

function LegalSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-2xl font-semibold tracking-[-0.02em] text-white">
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}
