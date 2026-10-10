import assert from "node:assert/strict";
import { test } from "node:test";
import { createProjectModuleRoute } from "../../lib/create/routes.ts";
import type { CreateProjectContext } from "../../lib/create/project.ts";

const project: CreateProjectContext = {
  id: "project-a", name: "Proyecto A", ownerId: "owner-a",
  writers: [{ id: "writer-a", title: "Guion", projectId: "project-a" }],
  shotlists: [{ id: "shotlist-a", title: "A", projectId: "project-a", scriptId: "writer-a" }],
  storyboards: [{ id: "shotlist-a", title: "A", projectId: "project-a", panelCount: 1 }],
  productions: [{ id: "production-a", title: "Rodaje", projectId: "project-a" }],
};

test("one artifact opens directly with its canonical Project context", () => {
  assert.equal(createProjectModuleRoute(project, "writer"), "/writer/writer-a?project=project-a");
  assert.equal(createProjectModuleRoute(project, "sandbox"), "/create/projects/project-a/sandbox");
  assert.equal(createProjectModuleRoute(project, "breakdown"), "/writer/writer-a?project=project-a");
  assert.equal(createProjectModuleRoute(project, "shotlist"), "/shotlists/shotlist-a?project=project-a");
  assert.equal(createProjectModuleRoute(project, "storyboard"), "/shotlists/shotlist-a/storyboard?project=project-a");
  assert.equal(createProjectModuleRoute(project, "production"), "/production/production-a?project=project-a");
  assert.equal(createProjectModuleRoute(project, "documents"), "/create/projects/project-a/documents");
});

test("multiple or missing artifacts open the Project list, never an arbitrary first row", () => {
  const multiple: CreateProjectContext = {
    ...project,
    shotlists: [...project.shotlists, { id: "shotlist-b", title: "B", projectId: "project-a", scriptId: null }],
    storyboards: [...project.storyboards, { id: "shotlist-b", title: "B", projectId: "project-a", panelCount: 0 }],
    productions: [...project.productions, { id: "production-b", title: "B", projectId: "project-a" }],
  };
  assert.equal(createProjectModuleRoute(multiple, "shotlist"), "/create/projects/project-a#shotlists");
  assert.equal(createProjectModuleRoute(multiple, "storyboard"), "/create/projects/project-a#storyboards");
  assert.equal(createProjectModuleRoute(multiple, "production"), "/production?project=project-a");
  assert.equal(createProjectModuleRoute({ ...project, writers: [] }, "writer"), "/create/projects/project-a#writer");
  assert.equal(createProjectModuleRoute({ ...project, productions: [] }, "production"), "/production?project=project-a");
});
