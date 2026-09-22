import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { AddressInfo } from "node:net";

import { createApp } from "./app.js";
import { createDatabase } from "./database.js";

const completeProject = {
  projectName: "ローカル制作テスト",
  clientName: "テスト商店",
  contactName: "担当者",
  contact: "test@example.invalid",
  source: "manual",
  requestDetails: "店舗紹介サイトを制作する。",
  siteType: "コーポレートサイト",
  purpose: "店舗情報を分かりやすく案内する",
  target: "地域の利用者",
  requiredPages: "TOP、会社概要、サービス、お問い合わせ",
  designPreferences: "シンプルで読みやすい",
  referenceSites: "なし",
  requiredFeatures: "お問い合わせ導線",
  assets: "ロゴあり",
  desiredDeadline: "2026-12-31",
  budget: "20万円",
  priority: "通常"
};

async function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "awf-production-"));
  const db = createDatabase(path.join(directory, "test.db"));
  const generatedDirectory = path.join(directory, "generated");
  const exportDirectory = path.join(directory, "exports");
  const server = createApp(db, { generatedDirectory, exportDirectory }).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const port = (server.address() as AddressInfo).port;

  async function request(route: string, body?: object, method = "POST") {
    const response = await fetch(`http://127.0.0.1:${port}/api${route}`, {
      method,
      headers: { "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    return { status: response.status, body: await response.json() };
  }

  async function preview(route: string) {
    return fetch(`http://127.0.0.1:${port}${route}`);
  }

  return {
    db,
    directory,
    exportDirectory,
    request,
    preview,
    async close() {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      db.close();
      fs.rmSync(directory, { recursive: true, force: true });
    }
  };
}

test("仕様書承認から生成・プレビュー・品質確認・修正・納品用書き出しまでローカルで完結する", async () => {
  const ctx = await fixture();

  try {
    const created = await ctx.request("/projects", completeProject);
    assert.equal(created.status, 201);
    const id = created.body.id as string;
    const route = `/projects/${id}`;

    const earlyStartApproval = await ctx.request(`${route}/approvals`, {
      approvalType: "production_start",
      decision: "approved",
      note: "早すぎる承認"
    });
    assert.equal(earlyStartApproval.status, 409);

    const earlyDeliveryApproval = await ctx.request(`${route}/approvals`, {
      approvalType: "final_delivery",
      decision: "approved",
      note: "早すぎる承認"
    });
    assert.equal(earlyDeliveryApproval.status, 409);

    const analyzed = await ctx.request(`${route}/analyses`, {});
    assert.equal(analyzed.status, 201);
    assert.equal(analyzed.body.analysisWorkspace.analyses[0].result.missingInformation.length, 0);
    const analysisId = analyzed.body.analysisWorkspace.analyses[0].id as string;

    const specified = await ctx.request(`${route}/specifications`, { analysisId });
    assert.equal(specified.status, 201);
    const specId = specified.body.analysisWorkspace.specifications[0].id as string;
    assert.equal(specified.body.analysisWorkspace.specifications[0].status, "draft");

    const approvedSpec = await ctx.request(
      `${route}/specifications/${specId}/decision`,
      { decision: "approved", note: "内容確認済み" }
    );
    assert.equal(approvedSpec.status, 200);
    assert.equal(approvedSpec.body.analysisWorkspace.specifications[0].status, "approved");

    const blockedBuild = await ctx.request(`${route}/site-builds`, { specificationId: specId });
    assert.equal(blockedBuild.status, 409);

    for (const status of ["AI分析中", "確認待ち", "制作待ち"]) {
      const moved = await ctx.request(`${route}/status`, { status });
      assert.equal(moved.status, 200);
    }

    const startApproved = await ctx.request(`${route}/approvals`, {
      approvalType: "production_start",
      decision: "approved",
      note: "制作開始OK"
    });
    assert.equal(startApproved.status, 201);

    const started = await ctx.request(`${route}/status`, { status: "制作中" });
    assert.equal(started.status, 200);
    assert.equal(started.body.productionWorkspace.productionStartApproved, true);

    const built = await ctx.request(`${route}/site-builds`, { specificationId: specId });
    assert.equal(built.status, 201);
    assert.equal(built.body.productionWorkspace.builds.length, 1);
    const build = built.body.productionWorkspace.builds[0];
    assert.ok(build.previewUrl.endsWith("/index.html"));

    const preview = await ctx.preview(build.previewUrl);
    assert.equal(preview.status, 200);
    const html = await preview.text();
    assert.match(html, /テスト商店/);
    assert.match(html, /viewport/);

    const quality = await ctx.request(`${route}/site-builds/${build.id}/quality-checks`, {});
    assert.equal(quality.status, 201);
    const checked = quality.body.productionWorkspace.builds[0].latestQuality;
    assert.ok(checked);
    assert.notEqual(checked.overall, "fail");
    assert.ok(checked.checks.some((item: { id: string; status: string }) => item.id === "links" && item.status === "pass"));

    const revised = await ctx.request(`${route}/site-builds/${build.id}/revisions`, {
      type: "heroTitle",
      value: "新しいローカル見出し"
    });
    assert.equal(revised.status, 201);
    assert.equal(revised.body.productionWorkspace.builds.length, 2);
    const revisedBuild = revised.body.productionWorkspace.builds[0];

    const revisedPreview = await ctx.preview(revisedBuild.previewUrl);
    assert.equal(revisedPreview.status, 200);
    assert.match(await revisedPreview.text(), /新しいローカル見出し/);

    const revisedQuality = await ctx.request(
      `${route}/site-builds/${revisedBuild.id}/quality-checks`,
      {}
    );
    assert.equal(revisedQuality.status, 201);
    assert.notEqual(revisedQuality.body.productionWorkspace.builds[0].latestQuality.overall, "fail");

    const blockedExport = await ctx.request(
      `${route}/site-builds/${revisedBuild.id}/export`,
      {}
    );
    assert.equal(blockedExport.status, 409);

    for (const status of ["AI品質チェック", "ユーザー確認", "最終確認"]) {
      const moved = await ctx.request(`${route}/status`, { status });
      assert.equal(moved.status, 200);
    }

    const deliveryApproved = await ctx.request(`${route}/approvals`, {
      approvalType: "final_delivery",
      decision: "approved",
      note: "最終確認OK"
    });
    assert.equal(deliveryApproved.status, 201);
    assert.equal(deliveryApproved.body.productionWorkspace.finalDeliveryApproved, true);

    const exported = await ctx.request(
      `${route}/site-builds/${revisedBuild.id}/export`,
      {}
    );
    assert.equal(exported.status, 201);
    assert.ok(exported.body.destination.startsWith(ctx.exportDirectory));
    assert.ok(fs.existsSync(path.join(exported.body.destination, "index.html")));

    const delivered = await ctx.request(`${route}/status`, { status: "納品" });
    assert.equal(delivered.status, 200);
  } finally {
    await ctx.close();
  }
});

test("未確定事項がある仕様書は正式承認できない", async () => {
  const ctx = await fixture();

  try {
    const created = await ctx.request("/projects", {
      ...completeProject,
      target: "",
      budget: "未定"
    });
    const route = `/projects/${created.body.id}`;
    const analyzed = await ctx.request(`${route}/analyses`, {});
    const analysisId = analyzed.body.analysisWorkspace.analyses[0].id as string;
    const specified = await ctx.request(`${route}/specifications`, { analysisId });
    const specId = specified.body.analysisWorkspace.specifications[0].id as string;

    const approval = await ctx.request(
      `${route}/specifications/${specId}/decision`,
      { decision: "approved", note: "" }
    );
    assert.equal(approval.status, 409);
  } finally {
    await ctx.close();
  }
});
