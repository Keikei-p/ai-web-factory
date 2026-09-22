import { createHash } from "node:crypto";

import { analysisFields, type Field, type AnalysisInput, type Fact, type Missing, type Question, type AnalysisResult, type AnalysisDocument, type Specification, type Recommendation } from "./analysis-types.js";
export type { AnalysisDocument } from "./analysis-types.js";

// No HTTP client, API key, environment-based provider selection, or external adapter.
// An external provider requires a separate, explicitly approved implementation.
export interface AnalysisProvider {
  readonly id: string;
  readonly execution: "local" | "external";
  analyze(input: Readonly<AnalysisInput>): Promise<unknown>;
}

export class AnalysisError extends Error {
  constructor(message: string, public readonly status = 409) { super(message); }
}

export function sourceHash(project: Record<string, unknown>) {
  const fields = [...Object.keys(analysisFields), "client_name", "contact_name", "contact"];
  return createHash("sha256").update(JSON.stringify(fields.map(key => project[key] ?? ""))).digest("hex");
}

export function prepareAnalysisInput(project: Record<string, unknown>): AnalysisInput {
  const privateValues = ["client_name", "contact_name", "contact"]
    .map(key => String(project[key] ?? "").trim()).filter(Boolean).sort((a, b) => b.length - a.length);
  return Object.fromEntries(Object.keys(analysisFields).map(key => {
    let value = String(project[key] ?? "").trim();
    for (const secret of privateValues) value = value.split(secret).join("[除外]");
    // A secret-bearing field is withheld entirely; regex is not a guarantee that arbitrary
    // personal names/addresses can be detected. External transmission remains disabled.
    if (/(?:password|passwd|api[ _-]?key|secret|token|パスワード|秘密鍵|認証情報)\s*[:=：]|\bsk-[\w-]+|-----BEGIN .*PRIVATE KEY-----/i.test(value)) {
      value = "[秘密情報を含むため除外]";
    } else {
      value = value
        .replace(/https?:\/\/[^\s<>「」]+/gi, "[URL除外]")
        .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[メール除外]")
        .replace(/(?:\+\d{1,3}[ -]?)?\b0\d{1,4}[- ()]*\d{1,4}[- ()]*\d{3,4}\b/g, "[電話除外]");
    }
    return [key, value];
  })) as AnalysisInput;
}

function needsConfirmation(value: string) {
  return !value || /不明|未定|未確認|要確認|未確定|わからない|分からない|相談|検討中|TBD|unknown|除外/i.test(value);
}

function groundedContent(input: Readonly<AnalysisInput>) {
  const facts: Fact[] = [];
  const missingInformation: Missing[] = [];
  const customerQuestions: Question[] = [];
  for (const field of Object.keys(analysisFields) as Field[]) {
    const label = analysisFields[field];
    const value = input[field];
    // A verbatim input is evidence of the request, never evidence of real-world truth.
    if (value) facts.push({ field, label, value, source: "project_input" });
    if (needsConfirmation(value)) {
      missingInformation.push({ field, label, reason: value ? "未確定または除外された情報があります。" : "入力がありません。" });
      customerQuestions.push({ field, question: `${label}について、確定した内容を教えてください。不要な場合は「不要」と明記してください。` });
    }
  }
  return { facts, missingInformation, customerQuestions };
}

const productionNotes = [
  "入力内容を整理した下書きです。記載された情報の正しさは人間が確認してください。",
  "依頼文の意味解析は行いません。各入力欄を確認・補完して再分析してください。",
  "納期・予算の実現可能性、SEOの検索需要は未検証です。",
  "参考サイトの文章・デザインをコピーしません。制作開始・顧客連絡は実行しません。"
];

export const localStubProvider: AnalysisProvider = {
  id: "local-stub-v1", execution: "local",
  async analyze(input) {
    return {
      schemaVersion: 1, ...groundedContent(input),
      recommendations: [
        { title: "スマートフォンでの表示確認", rationale: "画面幅に応じた読みやすさを制作時に検討します。", status: "proposed" },
        { title: "操作性・アクセシビリティの確認", rationale: "キーボード操作、ラベル、文字の読みやすさを検討します。", status: "proposed" }
      ],
      productionNotes
    } satisfies AnalysisResult;
  }
};

// Provider output is untrusted. Facts, gaps and questions must match the input-derived
// structure exactly; invented facts or omitted unknowns are rejected before persistence.
export function validateAnalysis(value: unknown, input: Readonly<AnalysisInput>): AnalysisResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new AnalysisError("分析結果の形式が不正です。", 502);
  const raw = value as Record<string, unknown>;
  const expected = groundedContent(input);
  if (raw.schemaVersion !== 1 || Object.keys(raw).sort().join() !==
      ["schemaVersion", "facts", "missingInformation", "customerQuestions", "recommendations", "productionNotes"].sort().join()) {
    throw new AnalysisError("分析結果の形式が不正です。", 502);
  }
  for (const key of ["facts", "missingInformation", "customerQuestions"] as const) {
    if (JSON.stringify(raw[key]) !== JSON.stringify(expected[key])) throw new AnalysisError("入力に根拠のない分析結果を拒否しました。", 502);
  }
  if (!Array.isArray(raw.recommendations) || raw.recommendations.length > 20 ||
      !raw.recommendations.every(item => item && typeof item === "object" &&
        Object.keys(item).sort().join() === "rationale,status,title" && item.status === "proposed" &&
        typeof item.title === "string" && item.title.length > 0 && item.title.length <= 200 &&
        typeof item.rationale === "string" && item.rationale.length > 0 && item.rationale.length <= 2000) ||
      JSON.stringify(raw.productionNotes) !== JSON.stringify(productionNotes)) {
    throw new AnalysisError("提案または注意事項の形式が不正です。", 502);
  }
  return structuredClone(value) as AnalysisResult;
}

export async function analyzeProject(project: Record<string, unknown>, provider: AnalysisProvider = localStubProvider) {
  if (provider.execution !== "local") throw new AnalysisError("外部AIへの送信は無効です。", 403);
  const input = Object.freeze(prepareAnalysisInput(project));
  const result = validateAnalysis(await provider.analyze(input), input);
  return { schemaVersion: 1 as const, provider: provider.id, mode: "local" as const,
    sourceHash: sourceHash(project), result };
}


export function buildSpecification(analysisId: string, analysis: AnalysisDocument): Specification {
  return {
    schemaVersion: 1 as const, analysisId, analysisVersion: analysis.version,
    sourceHash: analysis.sourceHash, status: "draft" as const,
    facts: analysis.result.facts,
    unresolved: analysis.result.missingInformation,
    customerQuestions: analysis.result.customerQuestions,
    proposedRecommendations: analysis.result.recommendations,
    confirmedRecommendations: [] as Recommendation[],
    productionNotes: analysis.result.productionNotes,
    restrictions: ["未確定事項を推測で補完しない", "提案は採用未承認", "制作開始・納品・顧客連絡の承認を代行しない"]
  };
}
