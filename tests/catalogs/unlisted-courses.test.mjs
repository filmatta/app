import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const catalog = fs.readFileSync("app/cursos/page.tsx", "utf8");
const detail = fs.readFileSync("app/cursos/[slug]/page.tsx", "utf8");
const lesson = fs.readFileSync(
  "app/cursos/[slug]/lecciones/[lessonSlug]/page.tsx",
  "utf8",
);
const actions = fs.readFileSync("app/admin/cursos/actions.ts", "utf8");
const newCourse = fs.readFileSync("app/admin/cursos/nuevo/page.tsx", "utf8");
const editCourse = fs.readFileSync("app/admin/cursos/[id]/page.tsx", "utf8");
const adminCatalog = fs.readFileSync("app/admin/cursos/page.tsx", "utf8");

test("public catalog lists only published and listed content", () => {
  assert.match(catalog, /\.eq\("status", "published"\)[\s\S]*\.eq\("is_listed", true\)/);
});

test("published unlisted content keeps direct routes and receives noindex", () => {
  const publicCourseQuery = detail.match(
    /const getPublishedCourse[\s\S]*?return course;/,
  )?.[0] ?? "";
  assert.match(publicCourseQuery, /\.eq\("status", "published"\)/);
  assert.doesNotMatch(publicCourseQuery, /\.eq\("is_listed", true\)/);
  assert.match(detail, /course\.is_listed[\s\S]*index: false, follow: false/);
  assert.match(lesson, /courseQuery = courseQuery\.eq\("status", "published"\)/);
  assert.doesNotMatch(lesson, /courseQuery = courseQuery\.eq\("is_listed", true\)/);
});

test("admin creates and updates listing explicitly and presents unambiguous states", () => {
  assert.equal((actions.match(/formData\.get\("is_listed"\)/g) ?? []).length, 2);
  assert.match(newCourse, /name="is_listed"[\s\S]*defaultChecked/);
  assert.match(editCourse, /name="is_listed"[\s\S]*course\.is_listed !== false/);
  assert.match(adminCatalog, /Publicado · listado/);
  assert.match(adminCatalog, /Publicado · no listado/);
  assert.match(adminCatalog, /Borrador/);
});
