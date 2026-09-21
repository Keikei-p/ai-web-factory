import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { AddressInfo } from "node:net";
import { createApp } from "./app.js";
import { createDatabase } from "./database.js";

async function startTestServer() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ai-web-factory-"));
  const db = createDatabase(path.join(directory, "test.db"));
  const app = createApp(db, { backupDirectory: path.join(directory, "backups") });
  const server = app.listen(0, "127.0.0.1");

  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    directory,
    db,
    server,
    async close() {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
      db.close();
      fs.rmSync(directory, { recursive: true, force: true });
    }
  };
}

async function jsonRequest(
  baseUrl: string,
  route: string,
  options: RequestInit = {}
) {
  const response = await fetch(`${baseUrl}${route}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {})
    }
  });

  const body = await response.json();
  return { response, body };
}

const validProject = {
  projectName: "テスト案件",
  clientName: "テスト株式会社",
  contactName: "担当者",
  contact: "test@example.com",
  source: "manual",
  requestDetails: "コーポレートサイトを制作したい。",
  siteType: "コーポレートサイト",
  purpose: "問い合わせ増加",
  target: "法人顧客",
  requiredPages: "TOP、会社概要、お問い合わせ",
  designPreferences: "信頼感のあるデザイン",
  referenceSites: "",
  requiredFeatures: "お問い合わせフォーム",
  assets: "ロゴあり",
  desiredDeadline: "2026-12-31",
  budget: "未定",
  priority: "通常"
};

test("案件作成・編集・承認付きステータス変更・バックアップが動く", async () => {
  const ctx = await startTestServer();

  try {
    const created = await jsonRequest(ctx.baseUrl, "/api/projects", {
      method: "POST",
      body: JSON.stringify(validProject)
    });

    assert.equal(created.response.status, 201);
    assert.equal(created.body.status, "新規");
    const projectId = created.body.id as string;

    const edited = await jsonRequest(ctx.baseUrl, `/api/projects/${projectId}`, {
      method: "PATCH",
      body: JSON.stringify({ ...validProject, clientName: "更新後株式会社" })
    });

    assert.equal(edited.response.status, 200);
    assert.equal(edited.body.project.client_name, "更新後株式会社");
    assert.ok(
      edited.body.history.some((item: { event_type: string }) => item.event_type === "project_updated")
    );

    const invalidSkip = await jsonRequest(
      ctx.baseUrl,
      `/api/projects/${projectId}/status`,
      { method: "POST", body: JSON.stringify({ status: "制作中" }) }
    );
    assert.equal(invalidSkip.response.status, 409);

    for (const status of ["AI分析中", "確認待ち", "制作待ち"]) {
      const moved = await jsonRequest(
        ctx.baseUrl,
        `/api/projects/${projectId}/status`,
        { method: "POST", body: JSON.stringify({ status }) }
      );
      assert.equal(moved.response.status, 200);
    }

    const blockedStart = await jsonRequest(
      ctx.baseUrl,
      `/api/projects/${projectId}/status`,
      { method: "POST", body: JSON.stringify({ status: "制作中" }) }
    );
    assert.equal(blockedStart.response.status, 409);
    assert.equal(blockedStart.body.code, "approval_required");
    assert.equal(blockedStart.body.approvalType, "production_start");

    const approved = await jsonRequest(
      ctx.baseUrl,
      `/api/projects/${projectId}/approvals`,
      {
        method: "POST",
        body: JSON.stringify({
          approvalType: "production_start",
          decision: "approved",
          note: "テスト承認"
        })
      }
    );
    assert.equal(approved.response.status, 201);

    const started = await jsonRequest(
      ctx.baseUrl,
      `/api/projects/${projectId}/status`,
      { method: "POST", body: JSON.stringify({ status: "制作中" }) }
    );
    assert.equal(started.response.status, 200);
    assert.equal(started.body.project.status, "制作中");

    for (const status of ["AI品質チェック", "ユーザー確認", "最終確認"]) {
      const moved = await jsonRequest(
        ctx.baseUrl,
        `/api/projects/${projectId}/status`,
        { method: "POST", body: JSON.stringify({ status }) }
      );
      assert.equal(moved.response.status, 200);
    }

    const blockedDelivery = await jsonRequest(
      ctx.baseUrl,
      `/api/projects/${projectId}/status`,
      { method: "POST", body: JSON.stringify({ status: "納品" }) }
    );
    assert.equal(blockedDelivery.response.status, 409);
    assert.equal(blockedDelivery.body.approvalType, "final_delivery");

    const rejectedDelivery = await jsonRequest(
      ctx.baseUrl,
      `/api/projects/${projectId}/approvals`,
      {
        method: "POST",
        body: JSON.stringify({
          approvalType: "final_delivery",
          decision: "rejected",
          note: "最終確認で差し戻し"
        })
      }
    );
    assert.equal(rejectedDelivery.response.status, 201);

    const stillBlocked = await jsonRequest(
      ctx.baseUrl,
      `/api/projects/${projectId}/status`,
      { method: "POST", body: JSON.stringify({ status: "納品" }) }
    );
    assert.equal(stillBlocked.response.status, 409);

    const approvedDelivery = await jsonRequest(
      ctx.baseUrl,
      `/api/projects/${projectId}/approvals`,
      {
        method: "POST",
        body: JSON.stringify({
          approvalType: "final_delivery",
          decision: "approved",
          note: "最終確認OK"
        })
      }
    );
    assert.equal(approvedDelivery.response.status, 201);
    assert.equal(approvedDelivery.body.project.final_confirmation, 1);

    const delivered = await jsonRequest(
      ctx.baseUrl,
      `/api/projects/${projectId}/status`,
      { method: "POST", body: JSON.stringify({ status: "納品" }) }
    );
    assert.equal(delivered.response.status, 200);
    assert.ok(delivered.body.project.delivered_at);

    const completed = await jsonRequest(
      ctx.baseUrl,
      `/api/projects/${projectId}/status`,
      { method: "POST", body: JSON.stringify({ status: "完了" }) }
    );
    assert.equal(completed.response.status, 200);

    const backup = await jsonRequest(ctx.baseUrl, "/api/backups", {
      method: "POST",
      body: "{}"
    });
    assert.equal(backup.response.status, 201);
    assert.ok(backup.body.filename.endsWith(".db"));

    const backupList = await jsonRequest(ctx.baseUrl, "/api/backups");
    assert.equal(backupList.response.status, 200);
    assert.ok(backupList.body.length >= 1);
  } finally {
    await ctx.close();
  }
});

test("必須項目とローカル以外の更新アクセスを拒否する", async () => {
  const ctx = await startTestServer();

  try {
    const invalid = await jsonRequest(ctx.baseUrl, "/api/projects", {
      method: "POST",
      body: JSON.stringify({ projectName: "", requestDetails: "" })
    });
    assert.equal(invalid.response.status, 400);

    const blockedOrigin = await jsonRequest(ctx.baseUrl, "/api/projects", {
      method: "POST",
      headers: { Origin: "https://example.com" },
      body: JSON.stringify(validProject)
    });
    assert.equal(blockedOrigin.response.status, 403);
  } finally {
    await ctx.close();
  }
});
