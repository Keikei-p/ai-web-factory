import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

export const PROJECT_ROOT = path.resolve(moduleDir, "../..");
export const DATA_DIR = path.join(PROJECT_ROOT, "data");
export const DATABASE_PATH = path.join(DATA_DIR, "ai-web-factory.db");
export const BACKUP_DIR = path.join(DATA_DIR, "backups");
export const GENERATED_DIR = path.join(DATA_DIR, "generated");
export const EXPORT_DIR = path.join(DATA_DIR, "exports");

export function createDatabase(databasePath = DATABASE_PATH) {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const db = new Database(databasePath);

  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");

  const integrity = db.pragma("integrity_check", { simple: true });
  if (integrity !== "ok") {
    db.close();
    throw new Error("SQLite database integrity check failed.");
  }

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

    CREATE TABLE IF NOT EXISTS site_builds (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      spec_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      output_dir TEXT NOT NULL,
      manifest_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY(spec_id) REFERENCES project_specs(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS quality_checks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      build_id TEXT NOT NULL,
      result_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY(build_id) REFERENCES site_builds(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS revision_requests (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      from_build_id TEXT NOT NULL,
      to_build_id TEXT NOT NULL,
      instruction_type TEXT NOT NULL,
      value_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY(from_build_id) REFERENCES site_builds(id) ON DELETE RESTRICT,
      FOREIGN KEY(to_build_id) REFERENCES site_builds(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_projects_created_at ON projects(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
    CREATE INDEX IF NOT EXISTS idx_history_project_id ON project_history(project_id);
    CREATE INDEX IF NOT EXISTS idx_approvals_project_id ON project_approvals(project_id);
    CREATE INDEX IF NOT EXISTS idx_site_builds_project_id ON site_builds(project_id, version DESC);
    CREATE INDEX IF NOT EXISTS idx_quality_checks_build_id ON quality_checks(build_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_revision_requests_project_id ON revision_requests(project_id, created_at DESC);
  `);

  return db;
}

function pruneBackups(directory: string, keep = 30) {
  if (!fs.existsSync(directory)) return;
  const files = fs
    .readdirSync(directory)
    .filter((name) => name.endsWith(".db"))
    .map((name) => ({
      name,
      fullPath: path.join(directory, name),
      time: fs.statSync(path.join(directory, name)).mtimeMs
    }))
    .sort((a, b) => b.time - a.time);

  for (const file of files.slice(keep)) {
    fs.rmSync(file.fullPath, { force: true });
  }
}

export async function createDatabaseBackup(
  db: Database.Database,
  directory = BACKUP_DIR,
  label = "manual"
) {
  fs.mkdirSync(directory, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `ai-web-factory-${label}-${stamp}.db`;
  const destination = path.join(directory, filename);

  await db.backup(destination);
  pruneBackups(directory);

  return { filename, destination };
}

export async function ensureDailyBackup(db: Database.Database, directory = BACKUP_DIR) {
  fs.mkdirSync(directory, { recursive: true });
  const day = new Date().toISOString().slice(0, 10);
  const prefix = `ai-web-factory-auto-${day}`;

  if (fs.readdirSync(directory).some((name) => name.startsWith(prefix))) {
    return null;
  }

  return createDatabaseBackup(db, directory, `auto-${day}`);
}

export function listBackups(directory = BACKUP_DIR) {
  if (!fs.existsSync(directory)) return [];

  return fs
    .readdirSync(directory)
    .filter((name) => name.endsWith(".db"))
    .map((name) => {
      const fullPath = path.join(directory, name);
      const stat = fs.statSync(fullPath);
      return {
        filename: name,
        createdAt: stat.mtime.toISOString(),
        size: stat.size
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
