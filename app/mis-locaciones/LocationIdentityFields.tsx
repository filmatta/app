"use client";

import { useState } from "react";
import { slugify } from "@/lib/slugify";

const inputClass =
  "w-full rounded-xl border border-white/10 bg-[#111111] px-4 py-3 text-white outline-none transition placeholder:text-white/20 focus:border-white/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60";

export default function LocationIdentityFields({
  defaultTitle = "",
  defaultSlug = "",
  autoGenerateSlug,
}: {
  defaultTitle?: string;
  defaultSlug?: string;
  autoGenerateSlug: boolean;
}) {
  const [title, setTitle] = useState(defaultTitle);
  const [slug, setSlug] = useState(defaultSlug);
  const [slugEdited, setSlugEdited] = useState(!autoGenerateSlug);

  return (
    <>
      <label className="block" htmlFor="location-title">
        <span className="mb-2 block text-sm text-white/50">Nombre</span>
        <input
          id="location-title"
          name="title"
          value={title}
          onChange={(event) => {
            const nextTitle = event.target.value;
            setTitle(nextTitle);

            if (!slugEdited) {
              setSlug(slugify(nextTitle));
            }
          }}
          required
          maxLength={160}
          autoComplete="off"
          className={inputClass}
          placeholder="Casa modernista en Coyoacán"
        />
      </label>

      <label className="block" htmlFor="location-slug">
        <span className="mb-2 block text-sm text-white/50">Slug público</span>
        <div className="flex rounded-xl border border-white/10 bg-[#111111] focus-within:border-white/30 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-white/60">
          <span className="hidden items-center border-r border-white/10 px-4 text-sm text-white/25 sm:flex">
            /locaciones/
          </span>
          <input
            id="location-slug"
            name="slug"
            value={slug}
            onChange={(event) => {
              setSlugEdited(true);
              setSlug(event.target.value);
            }}
            onBlur={() => setSlug(slugify(slug))}
            maxLength={160}
            autoComplete="off"
            aria-describedby="location-slug-help"
            className="min-w-0 flex-1 bg-transparent px-4 py-3 text-white outline-none placeholder:text-white/20"
            placeholder="casa-modernista-coyoacan"
          />
        </div>
        <span
          id="location-slug-help"
          className="mt-2 block text-xs leading-5 text-white/45"
        >
          Se genera con el nombre al crearla. Puedes editarlo; se normalizará con
          minúsculas y guiones.
        </span>
      </label>
    </>
  );
}
