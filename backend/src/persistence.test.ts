import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { AddressInfo } from "node:net";
import { createApp } from "./app.js";
import { createDatabase } from "./database.js";

const project = {
  projectName: "再起動テスト案件",
  clientName: "",
  contactName: "",
  contact: "",
  source: "manual",
  requestDetails: "再起動後も保存されることを確認する。",
  siteType: "",
  purpose: "",
  target: "",
  requiredPages: "",
  designPreferences: "",
  referenceSites: "",
  requiredFeatures: "",
  assets: "",
  desiredDeadline: "",
  budget: "",
  priority: "通常"
};

async function listen(app: ReturnType<typeof createApp>) {
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address() as AddressInfo;
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

test("SQLite再オープン後も案件を保持する", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "awf-persist-"));
  const dbPath = path.join(directory, "persist.db");

  let db = createDatabase(dbPath);
  let running = await listen(createApp(db, { backupDirectory: path.join(directory, "backups") }));

  try {
    const created = await fetch(`${running.baseUrl}/api/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(project)
    });
    assert.equal(created.status, 201);

    await new Promise<void>((resolve) => running.server.close(() => resolve()));
    db.close();

    db = createDatabase(dbPath);
    running = await listen(createApp(db, { backupDirectory: path.join(directory, "backups") }));

    const response = await fetch(`${running.baseUrl}/api/projects`);
    const projects = await response.json();

    assert.equal(response.status, 200);
    assert.equal(projects.length, 1);
    assert.equal(projects[0].project_name, "再起動テスト案件");
  } finally {
    if (running.server.listening) {
      await new Promise<void>((resolve) => running.server.close(() => resolve()));
    }
    if (db.open) db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
