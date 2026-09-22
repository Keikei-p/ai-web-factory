import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Express } from "express";
import type Database from "better-sqlite3";
import type { Specification } from "./analysis-types.js";
import { sourceHash } from "./analysis.js";
import { EXPORT_DIR, GENERATED_DIR } from "./database.js";
import { buildSite, inspectSite } from "./production.js";
import { REVISION_TYPES, type RevisionType, type SiteManifest, type SiteOverrides } from "./production-types.js";

type ProjectRow = Record<string, unknown> & { id: string; project_code: string };
type SpecRow = {
  id: string;
  project_id: string;
  version: number;
  content_json: string;
  status: string;
  created_at: string;
  updated_at: string;
};
type BuildRow = {
  id: string;
  project_id: string;
  spec_id: string;
  version: number;
  output_dir: string;
  manifest_json: string;
  created_at: string;
};

function parseSpec(row: SpecRow) {
  return JSON.parse(row.content_json) as Specification;
}

function parseManifest(row: BuildRow) {
  return JSON.parse(row.manifest_json) as SiteManifest;
}

function latestQuality(db: Database.Database, buildId: string) {
  const row = db.prepare(
    "SELECT result_json, created_at FROM quality_checks WHERE build_id = ? ORDER BY rowid DESC LIMIT 1"
  ).get(buildId) as { result_json: string; created_at: string } | undefined;
  if (!row) return null;
  try { return { ...JSON.parse(row.result_json), createdAt: row.created_at }; }
  catch { return null; }
}

export function productionWorkspace(db: Database.Database, projectId: string) {
  const rows = db.prepare(
    "SELECT * FROM site_builds WHERE project_id = ? ORDER BY version DESC, rowid DESC"
  ).all(projectId) as BuildRow[];

  const builds = rows.flatMap((row) => {
    try {
      const manifest = parseManifest(row);
      return [{
        id: row.id,
        version: row.version,
        specificationId: row.spec_id,
        createdAt: row.created_at,
        manifest,
        previewUrl: `/preview/${row.id}/index.html`,
        latestQuality: latestQuality(db, row.id)
      }];
    } catch { return []; }
  });

  const revisions = db.prepare(
    `SELECT id, from_build_id AS fromBuildId, to_build_id AS toBuildId,
            instruction_type AS instructionType, value_json AS valueJson, created_at AS createdAt
     FROM revision_requests WHERE project_id = ? ORDER BY rowid DESC`
  ).all(projectId) as Array<Record<string, unknown>>;

  return { mode: "local-template", externalTransmission: false, revisionTypes: REVISION_TYPES, builds, revisions };
}

function normalizeRevision(type: unknown, value: unknown): { type: RevisionType; value: unknown; overrides: SiteOverrides } {
  if (typeof type !== "string" || !(type in REVISION_TYPES)) {
    throw Object.assign(new Error("修正種別が正しくありません。"), { status: 400 });
  }

  const revisionType = type as RevisionType;
  if (revisionType === "compactHero") {
    if (typeof value !== "boolean") throw Object.assign(new Error("ON/OFFを指定してください。"), { status: 400 });
    return { type: revisionType, value, overrides: { compactHero: value } };
  }

  if (typeof value !== "string") throw Object.assign(new Error("修正内容を入力してください。"), { status: 400 });
  const text = value.trim();
  if (revisionType === "primaryColor") {
    if (!/^#[0-9a-f]{6}$/i.test(text)) {
      throw Object.assign(new Error("カラーは #314eea のような6桁HEXで指定してください。"), { status: 400 });
    }
    return { type: revisionType, value: text, overrides: { primaryColor: text } };
  }
  const limits: Record<Exclude<RevisionType, "compactHero" | "primaryColor">, number> = {
    heroTitle: 120, heroDescription: 600, ctaLabel: 80
  };
  const limit = limits[revisionType];
  if (!text || text.length > limit) {
    throw Object.assign(new Error(`1〜${limit}文字で入力してください。`), { status: 400 });
  }
  return { type: revisionType, value: text, overrides: { [revisionType]: text } };
}

export function registerProductionRoutes(
  app: Express,
  db: Database.Database,
  detail: (id: string) => unknown,
  options: { generatedDirectory?: string; exportDirectory?: string } = {}
) {
  const generatedRoot = options.generatedDirectory ?? GENERATED_DIR;
  const exportRoot = options.exportDirectory ?? EXPORT_DIR;

  const projectById = (id: string) => db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as ProjectRow | undefined;
  const specById = (projectId: string, specId: string) => db.prepare(
    "SELECT * FROM project_specs WHERE id = ? AND project_id = ?"
  ).get(specId, projectId) as SpecRow | undefined;
  const buildById = (projectId: string, buildId: string) => db.prepare(
    "SELECT * FROM site_builds WHERE id = ? AND project_id = ?"
  ).get(buildId, projectId) as BuildRow | undefined;
  const history = (projectId: string, eventType: string, description: string, now: string) =>
    db.prepare(
      "INSERT INTO project_history (id, project_id, event_type, description, created_at) VALUES (?, ?, ?, ?, ?)"
    ).run(randomUUID(), projectId, eventType, description, now);

  app.post("/api/projects/:id/specifications/:specId/decision", (req, res, next) => {
    try {
      const projectId = String(req.params.id);
      const specId = String(req.params.specId);
      const project = projectById(projectId);
      const specRow = specById(projectId, specId);
      if (!project || !specRow) { res.status(404).json({ error: "案件または仕様書が見つかりません。" }); return; }

      const decision = req.body?.decision;
      const note = typeof req.body?.note === "string" ? req.body.note.trim().slice(0, 2000) : "";
      if (decision !== "approved" && decision !== "rejected") {
        res.status(400).json({ error: "承認または差し戻しを指定してください。" }); return;
      }

      const latest = db.prepare(
        "SELECT id FROM project_specs WHERE project_id = ? ORDER BY version DESC, rowid DESC LIMIT 1"
      ).get(projectId) as { id: string } | undefined;
      const content = parseSpec(specRow);
      if (latest?.id !== specId || content.sourceHash !== sourceHash(project)) {
        res.status(409).json({ error: "最新の案件内容から生成した仕様書を使用してください。" }); return;
      }
      if (decision === "approved" && content.unresolved.length > 0) {
        res.status(409).json({ error: "未確定事項があります。案件情報を補完して再分析・再生成してください。" }); return;
      }

      const now = new Date().toISOString();
      db.transaction(() => {
        db.prepare("UPDATE project_specs SET status = ?, updated_at = ? WHERE id = ?")
          .run(decision, now, specId);
        db.prepare(
          `INSERT INTO project_approvals
           (id, project_id, approval_type, decision, note, created_at)
           VALUES (?, ?, 'specification_approval', ?, ?, ?)`
        ).run(randomUUID(), projectId, decision, `仕様書v${specRow.version}${note ? `: ${note}` : ""}`, now);
        history(projectId, "specification_decision",
          `制作仕様書 v${specRow.version} を${decision === "approved" ? "承認" : "差し戻し"}しました。`, now);
      })();

      res.json(detail(projectId));
    } catch (error) { next(error); }
  });

  function createBuild(project: ProjectRow, specRow: SpecRow, overrides: SiteOverrides, now: string) {
    const versionRow = db.prepare(
      "SELECT COALESCE(MAX(version), 0) + 1 AS version FROM site_builds WHERE project_id = ?"
    ).get(project.id) as { version: number };
    const buildId = randomUUID();
    const outputDir = path.join(generatedRoot, project.id, buildId);
    const spec = parseSpec(specRow);
    const manifest = buildSite({
      project, spec, specificationId: specRow.id, specificationVersion: specRow.version,
      buildVersion: versionRow.version, outputDirectory: outputDir, overrides
    });
    db.prepare(
      `INSERT INTO site_builds (id, project_id, spec_id, version, output_dir, manifest_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(buildId, project.id, specRow.id, versionRow.version, outputDir, JSON.stringify(manifest), now);
    db.prepare("UPDATE projects SET preview_url = ?, updated_at = ? WHERE id = ?")
      .run(`/preview/${buildId}/index.html`, now, project.id);
    return { buildId, version: versionRow.version, manifest };
  }

  app.post("/api/projects/:id/site-builds", (req, res, next) => {
    try {
      const projectId = String(req.params.id);
      const project = projectById(projectId);
      const specId = req.body?.specificationId;
      if (!project) { res.status(404).json({ error: "案件が見つかりません。" }); return; }
      if (typeof specId !== "string") { res.status(400).json({ error: "承認済み仕様書を指定してください。" }); return; }
      const specRow = specById(projectId, specId);
      if (!specRow || specRow.status !== "approved") {
        res.status(409).json({ error: "承認済み仕様書からのみ制作できます。" }); return;
      }
      const latest = db.prepare(
        "SELECT id FROM project_specs WHERE project_id = ? ORDER BY version DESC, rowid DESC LIMIT 1"
      ).get(projectId) as { id: string } | undefined;
      const spec = parseSpec(specRow);
      if (latest?.id !== specId || spec.sourceHash !== sourceHash(project)) {
        res.status(409).json({ error: "案件が更新されています。最新仕様書を承認してください。" }); return;
      }

      const now = new Date().toISOString();
      let built!: ReturnType<typeof createBuild>;
      db.transaction(() => {
        built = createBuild(project, specRow, {}, now);
        history(projectId, "site_build_created", `ローカルサイト v${built.version} を生成しました。`, now);
      })();
      res.status(201).json(detail(projectId));
    } catch (error) { next(error); }
  });

  app.post("/api/projects/:id/site-builds/:buildId/quality-checks", (req, res, next) => {
    try {
      const projectId = String(req.params.id);
      const build = buildById(projectId, String(req.params.buildId));
      if (!build) { res.status(404).json({ error: "生成サイトが見つかりません。" }); return; }
      const manifest = parseManifest(build);
      const result = inspectSite(build.id, build.output_dir, manifest);
      const now = new Date().toISOString();
      db.transaction(() => {
        db.prepare(
          "INSERT INTO quality_checks (id, project_id, build_id, result_json, created_at) VALUES (?, ?, ?, ?, ?)"
        ).run(randomUUID(), projectId, build.id, JSON.stringify(result), now);
        history(projectId, "quality_check", `サイト v${build.version} の品質チェック: ${result.overall}`, now);
      })();
      res.status(201).json(detail(projectId));
    } catch (error) { next(error); }
  });

  app.post("/api/projects/:id/site-builds/:buildId/revisions", (req, res, next) => {
    try {
      const projectId = String(req.params.id);
      const project = projectById(projectId);
      const from = buildById(projectId, String(req.params.buildId));
      if (!project || !from) { res.status(404).json({ error: "案件または生成サイトが見つかりません。" }); return; }
      const specRow = specById(projectId, from.spec_id);
      if (!specRow || specRow.status !== "approved") {
        res.status(409).json({ error: "承認済み仕様書に基づくサイトだけ修正できます。" }); return;
      }
      const revision = normalizeRevision(req.body?.type, req.body?.value);
      const previousManifest = parseManifest(from);
      const overrides = { ...previousManifest.overrides, ...revision.overrides };
      const now = new Date().toISOString();
      let built!: ReturnType<typeof createBuild>;
      db.transaction(() => {
        built = createBuild(project, specRow, overrides, now);
        db.prepare(
          `INSERT INTO revision_requests
           (id, project_id, from_build_id, to_build_id, instruction_type, value_json, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).run(randomUUID(), projectId, from.id, built.buildId, revision.type, JSON.stringify(revision.value), now);
        history(projectId, "site_revision",
          `サイト v${from.version} に「${REVISION_TYPES[revision.type]}」修正を適用し v${built.version} を生成しました。`, now);
      })();
      res.status(201).json(detail(projectId));
    } catch (error) {
      const status = typeof error === "object" && error && "status" in error ? Number((error as { status: unknown }).status) : 500;
      if (status >= 400 && status < 500) res.status(status).json({ error: error instanceof Error ? error.message : "修正できませんでした。" });
      else next(error);
    }
  });

  app.post("/api/projects/:id/site-builds/:buildId/export", (req, res, next) => {
    try {
      const projectId = String(req.params.id);
      const project = projectById(projectId);
      const build = buildById(projectId, String(req.params.buildId));
      if (!project || !build) { res.status(404).json({ error: "案件または生成サイトが見つかりません。" }); return; }

      const quality = latestQuality(db, build.id);
      if (!quality || quality.overall === "fail") {
        res.status(409).json({ error: "品質チェックを実行し、失敗項目を解消してから書き出してください。" }); return;
      }

      const safeCode = project.project_code.replace(/[^A-Za-z0-9_-]/g, "_");
      const destination = path.join(exportRoot, `${safeCode}-v${build.version}`);
      fs.rmSync(destination, { recursive: true, force: true });
      fs.mkdirSync(exportRoot, { recursive: true });
      fs.cpSync(build.output_dir, destination, { recursive: true });
      const now = new Date().toISOString();
      history(projectId, "site_exported", `納品用フォルダを書き出しました: ${destination}`, now);
      res.status(201).json({ ok: true, destination, buildVersion: build.version });
    } catch (error) { next(error); }
  });

  app.get("/preview/:buildId/:file", (req, res) => {
    const build = db.prepare("SELECT * FROM site_builds WHERE id = ?").get(String(req.params.buildId)) as BuildRow | undefined;
    if (!build) { res.status(404).send("Preview not found"); return; }
    let manifest: SiteManifest;
    try { manifest = parseManifest(build); } catch { res.status(404).send("Preview not found"); return; }
    const file = String(req.params.file);
    if (!manifest.pages.some((page) => page.file === file)) { res.status(404).send("File not found"); return; }
    res.sendFile(path.resolve(build.output_dir, file));
  });
}
