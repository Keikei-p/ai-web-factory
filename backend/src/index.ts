import express from "express";
import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const HOST = "127.0.0.1";
const PORT = 8787;

const dataDir = path.resolve(process.cwd(), "../data");
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, "ai-web-factory.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    project_code TEXT NOT NULL UNIQUE,
    project_name TEXT NOT NULL,
    client_name TEXT NOT NULL DEFAULT '',
    contact_name TEXT NOT NULL DEFAULT '',
    contact TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT 'manual',
    request_details TEXT NOT NULL,
    site_type TEXT NOT NULL DEFAULT '',
    purpose TEXT NOT NULL DEFAULT '',
    target TEXT NOT NULL DEFAULT '',
    required_pages TEXT NOT NULL DEFAULT '',
    design_preferences TEXT NOT NULL DEFAULT '',
    reference_sites TEXT NOT NULL DEFAULT '',
    required_features TEXT NOT NULL DEFAULT '',
    assets TEXT NOT NULL DEFAULT '',
    desired_deadline TEXT NOT NULL DEFAULT '',
    budget TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT '新規',
    priority TEXT NOT NULL DEFAULT '通常',
    assignee TEXT NOT NULL DEFAULT '',
    preview_url TEXT NOT NULL DEFAULT '',
    github_repository TEXT NOT NULL DEFAULT '',
    final_confirmation INTEGER NOT NULL DEFAULT 0,
    delivered_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS project_analyses (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    missing_information TEXT NOT NULL DEFAULT '',
    customer_questions TEXT NOT NULL DEFAULT '',
    recommended_structure TEXT NOT NULL DEFAULT '',
    recommended_features TEXT NOT NULL DEFAULT '',
    recommended_design TEXT NOT NULL DEFAULT '',
    production_notes TEXT NOT NULL DEFAULT '',
    raw_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS project_specs (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    content_json TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'draft',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS project_approvals (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    approval_type TEXT NOT NULL,
    decision TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS project_history (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    description TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_projects_created_at ON projects(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
  CREATE INDEX IF NOT EXISTS idx_history_project_id ON project_history(project_id);
`);

type CreateProjectBody = {
  projectName?: string;
  clientName?: string;
  contactName?: string;
  contact?: string;
  source?: string;
  requestDetails?: string;
  siteType?: string;
  purpose?: string;
  target?: string;
  requiredPages?: string;
  designPreferences?: string;
  referenceSites?: string;
  requiredFeatures?: string;
  assets?: string;
  desiredDeadline?: string;
  budget?: string;
  priority?: string;
};

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, mode: "local-only" });
});

app.get("/api/projects", (_req, res) => {
  const projects = db
    .prepare(
      `SELECT id, project_code, project_name, client_name, source, status, priority,
              desired_deadline, created_at, updated_at
       FROM projects
       ORDER BY created_at DESC`
    )
    .all();

  res.json(projects);
});

app.get("/api/projects/:id", (req, res) => {
  const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(req.params.id);

  if (!project) {
    res.status(404).json({ error: "案件が見つかりません。" });
    return;
  }

  const latestAnalysis = db
    .prepare(
      "SELECT * FROM project_analyses WHERE project_id = ? ORDER BY created_at DESC LIMIT 1"
    )
    .get(req.params.id);

  const latestSpec = db
    .prepare(
      "SELECT * FROM project_specs WHERE project_id = ? ORDER BY version DESC LIMIT 1"
    )
    .get(req.params.id);

  const approvals = db
    .prepare(
      "SELECT * FROM project_approvals WHERE project_id = ? ORDER BY created_at DESC"
    )
    .all(req.params.id);

  const history = db
    .prepare(
      "SELECT * FROM project_history WHERE project_id = ? ORDER BY created_at DESC"
    )
    .all(req.params.id);

  res.json({ project, latestAnalysis, latestSpec, approvals, history });
});

app.post("/api/projects", (req, res) => {
  const body = req.body as CreateProjectBody;
  const projectName = body.projectName?.trim();
  const requestDetails = body.requestDetails?.trim();

  if (!projectName) {
    res.status(400).json({ error: "案件名は必須です。" });
    return;
  }

  if (!requestDetails) {
    res.status(400).json({ error: "依頼内容は必須です。" });
    return;
  }

  const id = randomUUID();
  const now = new Date().toISOString();
  const stamp = now.slice(0, 10).replaceAll("-", "");
  const shortId = id.slice(0, 4).toUpperCase();
  const projectCode = `AWF-${stamp}-${shortId}`;

  const insert = db.prepare(`
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
  `);

  const createProject = db.transaction(() => {
    insert.run({
      id,
      projectCode,
      projectName,
      clientName: body.clientName?.trim() ?? "",
      contactName: body.contactName?.trim() ?? "",
      contact: body.contact?.trim() ?? "",
      source: body.source?.trim() || "manual",
      requestDetails,
      siteType: body.siteType?.trim() ?? "",
      purpose: body.purpose?.trim() ?? "",
      target: body.target?.trim() ?? "",
      requiredPages: body.requiredPages?.trim() ?? "",
      designPreferences: body.designPreferences?.trim() ?? "",
      referenceSites: body.referenceSites?.trim() ?? "",
      requiredFeatures: body.requiredFeatures?.trim() ?? "",
      assets: body.assets?.trim() ?? "",
      desiredDeadline: body.desiredDeadline?.trim() ?? "",
      budget: body.budget?.trim() ?? "",
      priority: body.priority?.trim() || "通常",
      createdAt: now,
      updatedAt: now
    });

    db.prepare(
      `INSERT INTO project_history (id, project_id, event_type, description, created_at)
       VALUES (?, ?, 'project_created', '案件を手動登録しました。', ?)`
    ).run(randomUUID(), id, now);
  });

  createProject();

  const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(id);
  res.status(201).json(project);
});

app.use((_req, res) => {
  res.status(404).json({ error: "Not Found" });
});

app.listen(PORT, HOST, () => {
  console.log(`AI Web Factory API: http://${HOST}:${PORT}`);
  console.log(`SQLite: ${path.join(dataDir, "ai-web-factory.db")}`);
});
