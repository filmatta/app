import { slugify } from "../slugify";

// The database UNIQUE constraint is the final arbiter, including concurrent creates.
export async function insertWithUniqueSlug<T>(
  title: string,
  fallback: string,
  insert: (slug: string) => PromiseLike<{ data: T | null; error: { code?: string; message: string } | null }>
) {
  const base = slugify(title).slice(0, 145).replace(/-+$/, "") || fallback;
  for (let attempt = 1; attempt <= 1000; attempt++) {
    const slug = attempt === 1 ? base : `${base}-${attempt}`;
    const result = await insert(slug);
    if (result.error?.code !== "23505" || !result.error.message.includes("slug")) {
      return { ...result, slug };
    }
  }
  throw new Error("No se pudo reservar una URL única después de 1000 intentos.");
}
