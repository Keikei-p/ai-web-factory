import type { Express } from "express";
import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { AnalysisError, analyzeProject, buildSpecification, localStubProvider, sourceHash,
  type AnalysisDocument, type AnalysisProvider } from "./analysis.js";

type Row = { id: string; raw_json: string; created_at: string };
function readAnalyses(db: Database.Database, projectId: string) {
  const rows = db.prepare("SELECT id, raw_json, created_at FROM project_analyses WHERE project_id = ? ORDER BY rowid DESC").all(projectId) as Row[];
  return rows.flatMap(row => {
    try {
      const document = JSON.parse(row.raw_json) as AnalysisDocument;
      // Ignore the Phase 1 placeholder/legacy format; do not modify existing rows.
      return document.schemaVersion === 1 && document.result && Number.isInteger(document.version)
        ? [{ id: row.id, createdAt: row.created_at, ...document }] : [];
    } catch { return []; }
  });
}

export function analysisWorkspace(db: Database.Database, project: Record<string, unknown> & { id: string }) {
  const hash = sourceHash(project);
  const analyses = readAnalyses(db, project.id).map(item => ({ ...item, stale: item.sourceHash !== hash }));
  const rows = db.prepare("SELECT id, version, content_json, status, created_at FROM project_specs WHERE project_id = ? ORDER BY version DESC, rowid DESC")
    .all(project.id) as { id: string; version: number; content_json: string; status: string; created_at: string }[];
  const specifications = rows.flatMap(row => {
    try {
      const content = JSON.parse(row.content_json) as ReturnType<typeof buildSpecification>;
      return content.schemaVersion === 1 && content.analysisId ? [{ id: row.id, version: row.version,
        status: row.status, createdAt: row.created_at, content,
        stale: content.sourceHash !== hash || content.analysisId !== analyses[0]?.id }] : [];
    } catch { return []; }
  });
  return { mode: "local-stub", externalTransmission: false, analyses, specifications };
}

export function registerAnalysisRoutes(app: Express, db: Database.Database,
  detail: (id: string) => unknown, provider: AnalysisProvider = localStubProvider) {
  const running = new Set<string>();
  const projectById = (id: string) => db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as
    (Record<string, unknown> & { id: string }) | undefined;
  const history = (id: string, event: string, description: string, now: string) =>
    db.prepare("INSERT INTO project_history (id, project_id, event_type, description, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(randomUUID(), id, event, description, now);

  app.post("/api/projects/:id/analyses", async (req, res, next) => {
    const id = String(req.params.id);
    const project = projectById(id);
    if (!project) { res.status(404).json({ error: "案件が見つかりません。" }); return; }
    if (req.body && (typeof req.body !== "object" || Array.isArray(req.body) || Object.keys(req.body).length)) {
      res.status(400).json({ error: "分析は保存済み案件を使用します。プロバイダーや入力の上書きはできません。" }); return;
    }
    if (running.has(id)) { res.status(409).json({ error: "分析実行中です。完了後に再実行してください。" }); return; }
    running.add(id);
    try {
      const document = await analyzeProject(project, provider);
      db.transaction(() => {
        const current = projectById(id);
        if (!current || sourceHash(current) !== document.sourceHash) throw new AnalysisError("実行中に案件が更新されました。再分析してください。");
        const version = (readAnalyses(db, id)[0]?.version ?? 0) + 1;
        const now = new Date().toISOString();
        db.prepare(`INSERT INTO project_analyses (id, project_id, summary, missing_information, customer_questions, raw_json, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`).run(randomUUID(), id, "ローカルスタブによる入力整理（要確認）",
          JSON.stringify(document.result.missingInformation), JSON.stringify(document.result.customerQuestions),
          JSON.stringify({ ...document, version }), now);
        history(id, "analysis_created", `ローカル分析 v${version} を保存しました（外部送信なし）。`, now);
      })();
      res.status(201).json(detail(id));
    } catch (error) {
      if (error instanceof AnalysisError) res.status(error.status).json({ error: error.message });
      else next(new Error("ローカル分析に失敗しました。再実行してください。"));
    } finally { running.delete(id); }
  });

  app.post("/api/projects/:id/specifications", (req, res, next) => {
    const id = String(req.params.id);
    try {
      db.transaction(() => {
        const project = projectById(id);
        if (!project) throw new AnalysisError("案件が見つかりません。", 404);
        if (!req.body || typeof req.body.analysisId !== "string" || Object.keys(req.body).join() !== "analysisId") {
          throw new AnalysisError("生成元の分析IDを指定してください。", 400);
        }
        const latest = readAnalyses(db, id)[0];
        if (!latest || latest.id !== req.body.analysisId || latest.sourceHash !== sourceHash(project)) {
          throw new AnalysisError("最新の案件で再分析してから仕様書を生成してください。");
        }
        const { version } = db.prepare("SELECT COALESCE(MAX(version), 0) + 1 AS version FROM project_specs WHERE project_id = ?")
          .get(id) as { version: number };
        const now = new Date().toISOString();
        db.prepare(`INSERT INTO project_specs (id, project_id, version, content_json, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, 'draft', ?, ?)`).run(randomUUID(), id, version,
          JSON.stringify(buildSpecification(latest.id, latest)), now, now);
        history(id, "specification_created", `制作仕様書 v${version} の下書きを分析 v${latest.version} から保存しました。`, now);
      })();
      res.status(201).json(detail(id));
    } catch (error) {
      if (error instanceof AnalysisError) res.status(error.status).json({ error: error.message });
      else next(error);
    }
  });
}
