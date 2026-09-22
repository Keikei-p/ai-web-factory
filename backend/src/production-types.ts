export type SiteOverrides = {
  primaryColor?: string;
  heroTitle?: string;
  heroDescription?: string;
  ctaLabel?: string;
  compactHero?: boolean;
};

export type SiteManifest = {
  schemaVersion: 1;
  specificationId: string;
  specificationVersion: number;
  projectId: string;
  buildVersion: number;
  pages: Array<{ label: string; file: string }>;
  overrides: SiteOverrides;
};

export type QualityCheckItem = {
  id: string;
  label: string;
  status: "pass" | "warn" | "fail";
  detail: string;
};

export type QualityResult = {
  schemaVersion: 1;
  buildId: string;
  overall: "pass" | "warn" | "fail";
  checkedAt: string;
  checks: QualityCheckItem[];
};

export const REVISION_TYPES = {
  primaryColor: "メインカラー",
  heroTitle: "ヒーロー見出し",
  heroDescription: "ヒーロー説明文",
  ctaLabel: "CTAボタン文言",
  compactHero: "ファーストビューをコンパクトに"
} as const;

export type RevisionType = keyof typeof REVISION_TYPES;
