import express from "express";
import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import {
  APPROVAL_TYPES,
  getAllowedNextStatuses,
  getRequiredApproval,
  isApprovalType,
  isProjectStatus,
  PROJECT_STATUSES,
  type ApprovalType,
  type ProjectStatus
} from "./workflow.js";
import {
  normalizeProjectInput,
  PROJECT_PRIORITY_OPTIONS,
  PROJECT_SOURCE_OPTIONS
} from "./validation.js";
import { BACKUP_DIR, createDatabaseBackup, listBackups } from "./database.js";
import { analysisWorkspace, registerAnalysisRoutes } from "./analysis-routes.js";
import type { AnalysisProvider } from "./analysis.js";
import { productionWorkspace, registerProductionRoutes } from "./production-routes.js";

type AppOptions = {
  backupDirectory?: string;
  analysisProvider?: AnalysisProvider;
  generatedDirectory?: string;
  exportDirectory?: string;
};

type ProjectRow = {
  id: string;
  status: string;
  [key: string]: unknown;
};

function getLatestApprovalDecision(
  db: Database.Database,
  projectId: string,
  approvalType: ApprovalType
) {
  return db
    .prepare(
      `SELECT decision
       FROM project_approvals
       WHERE project_id = ? AND approval_type = ?
       ORDER BY created_at DESC
       LIMIT 1`
    )
    .get(projectId, approvalType) as { decision: string } | undefined;
}

function nextActions(db: Database.Database, project: ProjectRow) {
  if (!isProjectStatus(project.status)) return [];

  return getAllowedNextStatuses(project.status).map((status) => {
    const approvalType = getRequiredApproval(project.status as ProjectStatus, status);
    const approvalSatisfied =
      !approvalType ||
      getLatestApprovalDecision(db, project.id, approvalType)?.decision === "approved";

    return {
      status,
      approvalType,
      approvalLabel: approvalType ? APPROVAL_TYPES[approvalType] : null,
      approvalSatisfied
    };
  });
}

function projectDetail(db: Database.Database, id: string) {
  const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as
    | ProjectRow
    | undefined;

  if (!project) return null;

  const latestAnalysis = db
    .prepare(
      "SELECT * FROM project_analyses WHERE project_id = ? ORDER BY created_at DESC LIMIT 1"
    )
    .get(id);

  const latestSpec = db
    .prepare(
      "SELECT * FROM project_specs WHERE project_id = ? ORDER BY version DESC LIMIT 1"
    )
    .get(id);

  const approvals = db
    .prepare(
      "SELECT * FROM project_approvals WHERE project_id = ? ORDER BY created_at DESC"
    )
    .all(id);

  const history = db
    .prepare(
      "SELECT * FROM project_history WHERE project_id = ? ORDER BY created_at DESC"
    )
    .all(id);

  return {
    project,
    latestAnalysis,
    latestSpec,
    approvals,
    history,
    analysisWorkspace: analysisWorkspace(db, project),
    productionWorkspace: productionWorkspace(db, project.id),
    nextActions: nextActions(db, project)
  };
}

export function createApp(db: Database.Database, options: AppOptions = {}) {
  const app = express();
  const backupDirectory = options.backupDirectory ?? BACKUP_DIR;

  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));

  app.use((req, res, next) => {
    if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
      const origin = req.get("origin");
      if (
        origin &&
        origin !== "http://127.0.0.1:5173" &&
        origin !== "http://localhost:5173"
      ) {
        res.status(403).json({ error: "許可されていないアクセスです。" });
        return;
      }
    }
    next();
  });

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, mode: "local-only" });
  });

  app.get("/api/meta", (_req, res) => {
    res.json({
      statuses: PROJECT_STATUSES,
      sources: PROJECT_SOURCE_OPTIONS,
      priorities: PROJECT_PRIORITY_OPTIONS,
      approvalTypes: APPROVAL_TYPES
    });
  });

  app.get("/api/projects", (_req, res) => {
    const projects = db
      .prepare(
        `SELECT id, project_code, project_name, client_name, source, status, priority,
                desired_deadline, created_at, updated_at
         FROM projects
         ORDER BY updated_at DESC, created_at DESC`
      )
      .all();

    res.json(projects);
  });

  app.get("/api/projects/:id", (req, res) => {
    const detail = projectDetail(db, req.params.id);
    if (!detail) {
      res.status(404).json({ error: "案件が見つかりません。" });
      return;
    }
    res.json(detail);
  });

  app.post("/api/projects", (req, res) => {
    const normalized = normalizeProjectInput(req.body);
    if (!normalized.value) {
      res.status(400).json({ error: normalized.error });
      return;
    }

    const body = normalized.value;
    const id = randomUUID();
    const now = new Date().toISOString();
    const stamp = now.slice(0, 10).replaceAll("-", "");
    const shortId = id.slice(0, 4).toUpperCase();
    const projectCode = `AWF-${stamp}-${shortId}`;

    const createProject = db.transaction(() => {
      db.prepare(`
        INSERT INTO projects (
          id, project_code, project_name, client_name, contact_name, contact, source,
          request_details, site_type, purpose, target, required_pages, design_preferences,
          reference_sites, required_features, assets, desired_deadline, budget,
          status, priority, created_at, updated_at
        ) VALUES (
          @id, @projectCode, @projectName, @clientName, @contactName, @contact, @source,
          @requestDetails, @siteType, @purpose, @target, @requiredPages, @designPreferences,
          @referenceSites, @requiredFeatures, @assets, @desiredDeadline, @budget,
          '新規', @priority, @createdAt, @updatedAt
        )
      `).run({
        id,
        projectCode,
        ...body,
        createdAt: now,
        updatedAt: now
      });

      db.prepare(
        `INSERT INTO project_history (id, project_id, event_type, description, created_at)
         VALUES (?, ?, 'project_created', '案件を手動登録しました。', ?)`
      ).run(randomUUID(), id, now);
    });

    createProject();
    res.status(201).json(projectDetail(db, id)?.project);
  });

  app.patch("/api/projects/:id", (req, res) => {
    const current = db
      .prepare("SELECT * FROM projects WHERE id = ?")
      .get(req.params.id) as Record<string, unknown> | undefined;

    if (!current) {
      res.status(404).json({ error: "案件が見つかりません。" });
      return;
    }

    const normalized = normalizeProjectInput(req.body);
    if (!normalized.value) {
      res.status(400).json({ error: normalized.error });
      return;
    }

    const body = normalized.value;
    const now = new Date().toISOString();

    const fieldMap: Array<[keyof typeof body, string, string]> = [
      ["projectName", "project_name", "案件名"],
      ["clientName", "client_name", "顧客名"],
      ["contactName", "contact_name", "担当者名"],
      ["contact", "contact", "連絡先"],
      ["source", "source", "受付元"],
      ["requestDetails", "request_details", "依頼内容"],
      ["siteType", "site_type", "サイト種類"],
      ["purpose", "purpose", "制作目的"],
      ["target", "target", "ターゲット"],
      ["requiredPages", "required_pages", "必要ページ"],
      ["designPreferences", "design_preferences", "希望デザイン"],
      ["referenceSites", "reference_sites", "参考サイト"],
      ["requiredFeatures", "required_features", "必要機能"],
      ["assets", "assets", "掲載素材"],
      ["desiredDeadline", "desired_deadline", "希望納期"],
      ["budget", "budget", "予算"],
      ["priority", "priority", "優先度"]
    ];

    const changedLabels = fieldMap
      .filter(([inputKey, column]) => current[column] !== body[inputKey])
      .map(([, , label]) => label);

    const updateProject = db.transaction(() => {
      db.prepare(`
        UPDATE projects SET
          project_name = @projectName,
          client_name = @clientName,
          contact_name = @contactName,
          contact = @contact,
          source = @source,
          request_details = @requestDetails,
          site_type = @siteType,
          purpose = @purpose,
          target = @target,
          required_pages = @requiredPages,
          design_preferences = @designPreferences,
          reference_sites = @referenceSites,
          required_features = @requiredFeatures,
          assets = @assets,
          desired_deadline = @desiredDeadline,
          budget = @budget,
          priority = @priority,
          updated_at = @updatedAt
        WHERE id = @id
      `).run({ id: req.params.id, ...body, updatedAt: now });

      if (changedLabels.length > 0) {
        db.prepare(
          `INSERT INTO project_history (id, project_id, event_type, description, created_at)
           VALUES (?, ?, 'project_updated', ?, ?)`
        ).run(
          randomUUID(),
          req.params.id,
          `案件情報を編集しました（${changedLabels.join("、")}）。`,
          now
        );
      }
    });

    updateProject();
    res.json(projectDetail(db, req.params.id));
  });

  app.post("/api/projects/:id/approvals", (req, res) => {
    const project = db
      .prepare("SELECT id, status FROM projects WHERE id = ?")
      .get(req.params.id) as { id: string; status: string } | undefined;

    if (!project) {
      res.status(404).json({ error: "案件が見つかりません。" });
      return;
    }

    const approvalType = req.body?.approvalType;
    const decision = req.body?.decision;
    const note = typeof req.body?.note === "string" ? req.body.note.trim().slice(0, 2_000) : "";

    if (!isApprovalType(approvalType)) {
      res.status(400).json({ error: "承認種別が正しくありません。" });
      return;
    }
    if (decision !== "approved" && decision !== "rejected") {
      res.status(400).json({ error: "承認結果が正しくありません。" });
      return;
    }

    if (approvalType === "production_start" && project.status !== "制作待ち") {
      res.status(409).json({ error: "制作開始はステータスが「制作待ち」の時だけ承認できます。" });
      return;
    }
    if (approvalType === "final_delivery" && project.status !== "最終確認") {
      res.status(409).json({ error: "最終納品はステータスが「最終確認」の時だけ承認できます。" });
      return;
    }

    const now = new Date().toISOString();
    const label = APPROVAL_TYPES[approvalType];

    const saveApproval = db.transaction(() => {
      db.prepare(
        `INSERT INTO project_approvals
         (id, project_id, approval_type, decision, note, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(randomUUID(), req.params.id, approvalType, decision, note, now);

      if (approvalType === "final_delivery") {
        db.prepare(
          "UPDATE projects SET final_confirmation = ?, updated_at = ? WHERE id = ?"
        ).run(decision === "approved" ? 1 : 0, now, req.params.id);
      }

      db.prepare(
        `INSERT INTO project_history (id, project_id, event_type, description, created_at)
         VALUES (?, ?, 'approval_recorded', ?, ?)`
      ).run(
        randomUUID(),
        req.params.id,
        `${label}を${decision === "approved" ? "承認" : "差し戻し"}しました。${note ? ` メモ: ${note}` : ""}`,
        now
      );
    });

    saveApproval();
    res.status(201).json(projectDetail(db, req.params.id));
  });

  app.post("/api/projects/:id/status", (req, res) => {
    const project = db
      .prepare("SELECT id, status FROM projects WHERE id = ?")
      .get(req.params.id) as { id: string; status: string } | undefined;

    if (!project) {
      res.status(404).json({ error: "案件が見つかりません。" });
      return;
    }
    if (!isProjectStatus(project.status)) {
      res.status(409).json({ error: "現在のステータスが不正です。" });
      return;
    }

    const requested = req.body?.status;
    if (!isProjectStatus(requested)) {
      res.status(400).json({ error: "変更先ステータスが正しくありません。" });
      return;
    }

    const allowed = getAllowedNextStatuses(project.status);
    if (!allowed.includes(requested)) {
      res.status(409).json({
        error: "このステータスには直接変更できません。",
        allowedNextStatuses: allowed
      });
      return;
    }

    const requiredApproval = getRequiredApproval(project.status, requested);
    if (requiredApproval) {
      const latest = getLatestApprovalDecision(db, project.id, requiredApproval);
      if (latest?.decision !== "approved") {
        res.status(409).json({
          error: `${APPROVAL_TYPES[requiredApproval]}の明示承認が必要です。`,
          code: "approval_required",
          approvalType: requiredApproval
        });
        return;
      }
    }

    const now = new Date().toISOString();
    const previous = project.status;

    const changeStatus = db.transaction(() => {
      db.prepare(
        `UPDATE projects
         SET status = ?, updated_at = ?,
             delivered_at = CASE WHEN ? = '納品' THEN ? ELSE delivered_at END
         WHERE id = ?`
      ).run(requested, now, requested, now, project.id);

      db.prepare(
        `INSERT INTO project_history (id, project_id, event_type, description, created_at)
         VALUES (?, ?, 'status_changed', ?, ?)`
      ).run(
        randomUUID(),
        project.id,
        `ステータスを「${previous}」から「${requested}」へ変更しました。`,
        now
      );
    });

    changeStatus();
    res.json(projectDetail(db, project.id));
  });

  registerAnalysisRoutes(app, db, (id) => projectDetail(db, id), options.analysisProvider);
  registerProductionRoutes(app, db, (id) => projectDetail(db, id), {
    generatedDirectory: options.generatedDirectory,
    exportDirectory: options.exportDirectory
  });

  app.get("/api/backups", (_req, res) => {
    res.json(listBackups(backupDirectory));
  });

  app.post("/api/backups", async (_req, res, next) => {
    try {
      const backup = await createDatabaseBackup(db, backupDirectory, "manual");
      res.status(201).json({
        ok: true,
        filename: backup.filename,
        createdAt: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  });

  app.use((_req, res) => {
    res.status(404).json({ error: "Not Found" });
  });

  app.use((
    error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error(error);
    res.status(500).json({ error: "内部エラーが発生しました。" });
  });

  return app;
}
