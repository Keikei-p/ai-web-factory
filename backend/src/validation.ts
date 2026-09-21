const SOURCES = ["manual", "website", "gmail", "line", "sns", "lancers", "coconala"] as const;
const PRIORITIES = ["低", "通常", "高", "最優先"] as const;

export type ProjectInput = {
  projectName: string;
  clientName: string;
  contactName: string;
  contact: string;
  source: string;
  requestDetails: string;
  siteType: string;
  purpose: string;
  target: string;
  requiredPages: string;
  designPreferences: string;
  referenceSites: string;
  requiredFeatures: string;
  assets: string;
  desiredDeadline: string;
  budget: string;
  priority: string;
};

function text(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

export function normalizeProjectInput(body: unknown): { value?: ProjectInput; error?: string } {
  if (!body || typeof body !== "object") {
    return { error: "入力内容が正しくありません。" };
  }

  const raw = body as Record<string, unknown>;
  const projectName = text(raw.projectName, 200);
  const requestDetails = text(raw.requestDetails, 20_000);
  const source = text(raw.source, 30) || "manual";
  const priority = text(raw.priority, 20) || "通常";
  const desiredDeadline = text(raw.desiredDeadline, 20);

  if (!projectName) return { error: "案件名は必須です。" };
  if (!requestDetails) return { error: "依頼内容は必須です。" };
  if (!SOURCES.includes(source as (typeof SOURCES)[number])) {
    return { error: "受付元が正しくありません。" };
  }
  if (!PRIORITIES.includes(priority as (typeof PRIORITIES)[number])) {
    return { error: "優先度が正しくありません。" };
  }
  if (desiredDeadline && !/^\d{4}-\d{2}-\d{2}$/.test(desiredDeadline)) {
    return { error: "希望納期の形式が正しくありません。" };
  }

  return {
    value: {
      projectName,
      clientName: text(raw.clientName, 300),
      contactName: text(raw.contactName, 200),
      contact: text(raw.contact, 500),
      source,
      requestDetails,
      siteType: text(raw.siteType, 300),
      purpose: text(raw.purpose, 5_000),
      target: text(raw.target, 5_000),
      requiredPages: text(raw.requiredPages, 10_000),
      designPreferences: text(raw.designPreferences, 10_000),
      referenceSites: text(raw.referenceSites, 10_000),
      requiredFeatures: text(raw.requiredFeatures, 10_000),
      assets: text(raw.assets, 10_000),
      desiredDeadline,
      budget: text(raw.budget, 500),
      priority
    }
  };
}

export const PROJECT_SOURCE_OPTIONS = [
  ["manual", "手動登録"],
  ["website", "自社サイト"],
  ["gmail", "Gmail"],
  ["line", "LINE"],
  ["sns", "SNS"],
  ["lancers", "Lancers"],
  ["coconala", "ココナラ"]
] as const;

export const PROJECT_PRIORITY_OPTIONS = PRIORITIES;
