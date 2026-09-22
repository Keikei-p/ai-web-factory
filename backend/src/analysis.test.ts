import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { AddressInfo } from "node:net";
import { createDatabase } from "./database.js";
import { createApp } from "./app.js";
import { analyzeProject, localStubProvider, prepareAnalysisInput, validateAnalysis, type AnalysisProvider } from "./analysis.js";

const inputProject = { projectName: "分析テスト", requestDetails: "店舗の紹介サイト。", purpose: "来店促進", budget: "未定" };

test("根拠を保持し、不明と提案を分離、外部プロバイダーを呼び出さない", async () => {
  const input = prepareAnalysisInput({ request_details: "会社を紹介したい", budget: "未定", purpose: "TBD", target: "なし" });
  const result = validateAnalysis(await localStubProvider.analyze(input), input);
  assert.equal(result.facts.find(item => item.field === "request_details")?.value, "会社を紹介したい");
  assert.ok(result.missingInformation.some(item => item.field === "budget"));
  assert.ok(result.missingInformation.some(item => item.field === "purpose"));
  assert.ok(!result.missingInformation.some(item => item.field === "target"));
  assert.equal(result.customerQuestions.length, result.missingInformation.length);
  assert.ok(result.recommendations.every(item => item.status === "proposed"));
  const invented = structuredClone(result);
  invented.facts[0]!.value = "実績100件";
  assert.throws(() => validateAnalysis(invented, input), /根拠/);
  assert.throws(() => validateAnalysis({ ...result, missingInformation: [] }, input), /根拠/);
  assert.throws(() => validateAnalysis({ ...result, customerQuestions: [] }, input), /根拠/);
  assert.throws(() => validateAnalysis({ ...result, productionNotes: [] }, input), /注意事項/);
  assert.throws(() => validateAnalysis({ ...result, recommendations: [{ title: "料金", rationale: "確定", status: "approved" }] }, input));
  assert.throws(() => validateAnalysis({ ...result, extra: "injected" }, input));
  let called = false;
  await assert.rejects(analyzeProject({}, { id: "paid", execution: "external", async analyze() { called = true; return result; } }), /外部AI/);
  assert.equal(called, false);
});

test("許可した制作項目だけを渡し、連絡先と秘密情報を除外する", async () => {
  const project = { project_name: "秘密案件名", client_name: "架空商店", contact_name: "架空担当者",
    contact: "owner@example.test", assignee: "秘密担当", request_details: "架空商店 架空担当者 owner@example.test other@example.com 090-1234-5678 https://example.com/?token=secret",
    assets: "password: confidential", required_features: "api_key=confidential", design_preferences: "sk-testSecret123", budget: "10万円" };
  let captured = "";
  const provider: AnalysisProvider = { id: "test-local", execution: "local", async analyze(input) {
    captured = JSON.stringify(input); assert.ok(Object.isFrozen(input)); return localStubProvider.analyze(input);
  } };
  await analyzeProject(project, provider);
  for (const secret of ["秘密案件名", "架空商店", "架空担当者", "owner@", "other@", "090-1234", "example.com", "confidential", "sk-testSecret", "秘密担当"]) {
    assert.ok(!captured.includes(secret), secret);
  }
  assert.ok(captured.includes("10万円"));
  assert.ok(captured.includes("除外"));
});

async function fixture(provider?: AnalysisProvider) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "awf-analysis-"));
  const dbPath = path.join(directory, "test.db");
  let db = createDatabase(dbPath);
  const listen = async () => {
    const server = createApp(db, { analysisProvider: provider }).listen(0, "127.0.0.1");
    await new Promise<void>(resolve => server.once("listening", resolve));
    return server;
  };
  let server = await listen();
  const stop = () => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return {
    get db() { return db; },
    async request(route: string, body?: object, method = "POST", origin?: string) {
      const port = (server.address() as AddressInfo).port;
      const response = await fetch(`http://127.0.0.1:${port}/api${route}`, {
        method, headers: { "Content-Type": "application/json", ...(origin ? { origin } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      });
      return { status: response.status, body: await response.json() };
    },
    async restart() { await stop(); db.close(); db = createDatabase(dbPath); server = await listen(); },
    async close() { await stop(); db.close(); fs.rmSync(directory, { recursive: true, force: true }); }
  };
}

test("分析・仕様書の保存、履歴、再分析、古い入力の拒否、再起動とPhase 1の互換性", async () => {
  const ctx = await fixture();
  try {
    const { body: created } = await ctx.request("/projects", inputProject);
    const route = `/projects/${created.id}`;
    assert.equal((await ctx.request(`${route}/specifications`, { analysisId: "absent" })).status, 409);
    assert.equal((await ctx.request(`${route}/analyses`, {}, "POST", "https://evil.example")).status, 403);
    assert.equal((await ctx.request(`${route}/specifications`, {}, "POST", "https://evil.example")).status, 403);
    assert.equal((await ctx.request("/projects/absent/analyses", {})).status, 404);
    assert.equal((await ctx.request("/projects/absent/specifications", { analysisId: "absent" })).status, 404);
    assert.equal((await ctx.request(`${route}/analyses`, { provider: "paid" })).status, 400);
    // Existing Phase 1 data remains readable and is never rewritten.
    ctx.db.prepare("INSERT INTO project_analyses (id, project_id, created_at) VALUES ('legacy', ?, '2020-01-01')").run(created.id);
    ctx.db.prepare("INSERT INTO project_specs (id, project_id, version, created_at, updated_at) VALUES ('legacy', ?, 1, '2020-01-01', '2020-01-01')").run(created.id);
    const analyzed = await ctx.request(`${route}/analyses`, {});
    assert.equal(analyzed.status, 201);
    let workspace = analyzed.body.analysisWorkspace;
    const analysisId = workspace.analyses[0].id;
    assert.equal(workspace.analyses[0].version, 1);
    assert.equal(workspace.externalTransmission, false);
    assert.equal(analyzed.body.project.status, "新規");
    assert.deepEqual(analyzed.body.approvals, []);
    assert.equal((await ctx.request(`${route}/specifications`, {})).status, 400);
    const generated = await ctx.request(`${route}/specifications`, { analysisId });
    assert.equal(generated.status, 201);
    const spec = generated.body.analysisWorkspace.specifications[0];
    assert.equal(spec.version, 2);
    assert.equal(spec.content.status, "draft");
    assert.deepEqual(spec.content.unresolved, workspace.analyses[0].result.missingInformation);
    assert.deepEqual(spec.content.confirmedRecommendations, []);
    assert.equal(spec.content.analysisId, analysisId);
    assert.equal(generated.body.project.status, "新規");
    assert.ok(generated.body.history.some((item: { event_type: string }) => item.event_type === "analysis_created"));
    assert.ok(generated.body.history.some((item: { event_type: string }) => item.event_type === "specification_created"));
    await ctx.restart();
    const restored = await ctx.request(route, undefined, "GET");
    assert.equal(restored.body.analysisWorkspace.analyses[0].id, analysisId);
    assert.deepEqual(restored.body.analysisWorkspace.specifications[0], spec);
    const edited = await ctx.request(route, { ...inputProject, purpose: "予約獲得" }, "PATCH");
    assert.equal(edited.body.analysisWorkspace.analyses[0].stale, true);
    assert.equal(edited.body.analysisWorkspace.specifications[0].stale, true);
    assert.equal((await ctx.request(`${route}/specifications`, { analysisId })).status, 409);
    workspace = (await ctx.request(`${route}/analyses`, {})).body.analysisWorkspace;
    assert.equal(workspace.analyses.length, 2);
    assert.equal(workspace.analyses[0].version, 2);
    assert.equal(workspace.analyses[0].stale, false);
    assert.equal((await ctx.request(`${route}/specifications`, { analysisId })).status, 409);
    assert.equal((await ctx.request(`${route}/specifications`, { analysisId: workspace.analyses[0].id })).status, 201);
    const other = await ctx.request("/projects", inputProject);
    assert.equal((await ctx.request(`/projects/${other.body.id}/specifications`, { analysisId: workspace.analyses[0].id })).status, 409);
    assert.equal((await ctx.request(`${route}/status`, { status: "制作中" })).status, 409);
    assert.deepEqual(ctx.db.prepare("SELECT raw_json FROM project_analyses WHERE id = 'legacy'").get(), { raw_json: "{}" });
  } finally { await ctx.close(); }
});

test("分析失敗では部分保存せず、再試行できる", async () => {
  let fail = true;
  const ctx = await fixture({ id: "invalid-local", execution: "local", async analyze(input) {
    if (fail) return { facts: [{ value: "作り話" }] };
    return localStubProvider.analyze(input);
  } });
  try {
    const { body: created } = await ctx.request("/projects", inputProject);
    const route = `/projects/${created.id}`;
    assert.equal((await ctx.request(`${route}/analyses`, {})).status, 502);
    const detail = (await ctx.request(route, undefined, "GET")).body;
    assert.equal(detail.analysisWorkspace.analyses.length, 0);
    assert.equal(detail.history.length, 1);
    assert.equal(detail.project.status, "新規");
    fail = false;
    assert.equal((await ctx.request(`${route}/analyses`, {})).status, 201);
  } finally { await ctx.close(); }
});

test("二重実行と分析中の案件編集を検出する", async () => {
  let release!: () => void;
  let entered!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  const ctx = await fixture({ id: "slow-local", execution: "local", async analyze(input) {
    entered(); await gate; return localStubProvider.analyze(input);
  } });
  try {
    const { body: created } = await ctx.request("/projects", inputProject);
    const route = `/projects/${created.id}`;
    const pending = ctx.request(`${route}/analyses`, {});
    await started;
    assert.equal((await ctx.request(`${route}/analyses`, {})).status, 409);
    await ctx.request(route, { ...inputProject, purpose: "変更" }, "PATCH");
    release();
    assert.equal((await pending).status, 409);
    const detail = (await ctx.request(route, undefined, "GET")).body;
    assert.equal(detail.analysisWorkspace.analyses.length, 0);
    assert.equal(detail.project.status, "新規");
    assert.equal((await ctx.request(`${route}/analyses`, {})).status, 201);
  } finally { release(); await ctx.close(); }
});
