import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Timeline route and refresh path remain read-only and do not mount editor persistence", async () => {
  const [page, component] = await Promise.all([
    readFile("app/writer/[id]/timeline/page.tsx", "utf8"),
    readFile("components/writer/WriterTimeline.tsx", "utf8"),
  ]);

  assert.match(page, /\.from\("writer_scripts"\)/);
  assert.match(page, /\.select\("id,title,document,schema_version,revision,updated_at"\)/);
  assert.match(page, /\.eq\("id", id\)/);
  assert.doesNotMatch(page, /\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(/);
  assert.doesNotMatch(page, /service[_ -]?role/i);
  assert.doesNotMatch(page, /WriterWorkspace|persistence|tab-lease|storage/);

  assert.match(component, /fetch\(`\/api\/writer\/scripts\/\$\{initialTimeline\.scriptId\}`/);
  assert.doesNotMatch(component, /method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/);
  assert.doesNotMatch(component, /indexedDB|localStorage|sessionStorage|BroadcastChannel/);
});
