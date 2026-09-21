export const PROJECT_STATUSES = [
  "新規",
  "AI分析中",
  "情報不足",
  "確認待ち",
  "制作待ち",
  "制作中",
  "AI品質チェック",
  "ユーザー確認",
  "修正中",
  "再チェック",
  "最終確認",
  "納品",
  "完了"
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const STATUS_TRANSITIONS: Record<ProjectStatus, readonly ProjectStatus[]> = {
  新規: ["AI分析中"],
  AI分析中: ["情報不足", "確認待ち"],
  情報不足: ["AI分析中", "確認待ち"],
  確認待ち: ["制作待ち"],
  制作待ち: ["制作中"],
  制作中: ["AI品質チェック"],
  AI品質チェック: ["ユーザー確認", "修正中"],
  ユーザー確認: ["修正中", "最終確認"],
  修正中: ["再チェック"],
  再チェック: ["ユーザー確認", "修正中", "最終確認"],
  最終確認: ["納品"],
  納品: ["完了"],
  完了: []
};

export const APPROVAL_TYPES = {
  production_start: "制作開始",
  customer_contact: "顧客への連絡",
  paid_service: "有料サービス契約",
  billing: "課金",
  domain_purchase: "ドメイン購入",
  dns_change: "DNS変更",
  production_publish: "本番公開",
  final_delivery: "最終納品"
} as const;

export type ApprovalType = keyof typeof APPROVAL_TYPES;

const TRANSITION_APPROVALS: Partial<Record<`${ProjectStatus}->${ProjectStatus}`, ApprovalType>> = {
  "制作待ち->制作中": "production_start",
  "最終確認->納品": "final_delivery"
};

export function isProjectStatus(value: unknown): value is ProjectStatus {
  return typeof value === "string" && PROJECT_STATUSES.includes(value as ProjectStatus);
}

export function isApprovalType(value: unknown): value is ApprovalType {
  return typeof value === "string" && value in APPROVAL_TYPES;
}

export function getAllowedNextStatuses(status: ProjectStatus): readonly ProjectStatus[] {
  return STATUS_TRANSITIONS[status];
}

export function getRequiredApproval(from: ProjectStatus, to: ProjectStatus): ApprovalType | null {
  return TRANSITION_APPROVALS[`${from}->${to}`] ?? null;
}
