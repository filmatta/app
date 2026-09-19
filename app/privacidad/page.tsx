import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Política de privacidad",
  description: "Cómo FILMATTA recopila, utiliza y protege tus datos.",
};

export default function PrivacyPage() {
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
          Política de privacidad
        </h1>
        <p className="mt-5 text-sm text-white/40">
          Última actualización: 19 de septiembre de 2026
        </p>

        <div className="mt-14 space-y-10 text-base leading-8 text-white/65">
          <LegalSection title="1. Qué información recopilamos">
            <p>
              Cuando creas una cuenta o inicias sesión, FILMATTA puede recibir
              tu nombre, correo electrónico, identificador de cuenta y, si el
              proveedor lo entrega, tu imagen de perfil. También recopilamos la
              información que decides añadir a tu cuenta y datos técnicos
              necesarios para mantener la sesión, proteger el servicio y
              diagnosticar errores.
            </p>
          </LegalSection>

          <LegalSection title="2. Inicio de sesión con Google">
            <p>
              Si eliges “Continuar con Google”, Google autentica tu identidad y
              comparte con FILMATTA los datos básicos autorizados: nombre,
              correo electrónico e información básica del perfil. FILMATTA no
              recibe tu contraseña de Google ni solicita acceso a Drive,
              Calendar, contactos u otros servicios de Google.
            </p>
          </LegalSection>

          <LegalSection title="3. Para qué usamos tus datos">
            <p>
              Utilizamos tus datos para crear y administrar tu cuenta,
              mantener tu sesión, darte acceso a cursos y funciones de la
              plataforma, prevenir abuso, atender solicitudes de soporte y
              mejorar la seguridad y funcionamiento de FILMATTA.
            </p>
          </LegalSection>

          <LegalSection title="4. Proveedores y transferencias">
            <p>
              FILMATTA utiliza proveedores de infraestructura y autenticación,
              entre ellos Google y Supabase, que procesan información para
              prestar sus servicios. No vendemos tus datos personales. Sólo los
              compartimos cuando es necesario para operar FILMATTA, cumplir la
              ley o proteger derechos y seguridad.
            </p>
          </LegalSection>

          <LegalSection title="5. Conservación y seguridad">
            <p>
              Conservamos la información mientras tu cuenta esté activa o sea
              necesaria para prestar el servicio, cumplir obligaciones y
              resolver disputas. Aplicamos controles técnicos y organizativos
              razonables, aunque ningún sistema puede garantizar seguridad
              absoluta.
            </p>
          </LegalSection>

          <LegalSection title="6. Tus opciones y contacto">
            <p>
              Puedes dejar de usar Google para iniciar sesión o solicitar
              acceso, corrección o eliminación de la información asociada a tu
              cuenta. Para dudas o solicitudes de privacidad, escribe a{" "}
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
