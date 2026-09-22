export const analysisFields = {
  request_details: "依頼内容", site_type: "サイト種類", purpose: "制作目的",
  target: "ターゲット", required_pages: "必要ページ", required_features: "必要機能",
  design_preferences: "希望デザイン", reference_sites: "参考サイト", assets: "掲載素材",
  desired_deadline: "希望納期", budget: "予算"
} as const;
export type Field = keyof typeof analysisFields;
export type AnalysisInput = Record<Field, string>;
export type Fact = { field: Field; label: string; value: string; source: "project_input" };
export type Missing = { field: Field; label: string; reason: string };
export type Question = { field: Field; question: string };
export type Recommendation = { title: string; rationale: string; status: "proposed" };
export type AnalysisResult = {
  schemaVersion: 1;
  facts: Fact[];
  missingInformation: Missing[];
  customerQuestions: Question[];
  recommendations: Recommendation[];
  productionNotes: string[];
};

export type AnalysisDocument = {
  schemaVersion: 1; provider: string; mode: "local"; sourceHash: string; result: AnalysisResult; version: number;
};
export type Specification = {
  schemaVersion: 1; analysisId: string; analysisVersion: number; sourceHash: string; status: "draft";
  facts: Fact[]; unresolved: Missing[]; customerQuestions: Question[];
  proposedRecommendations: Recommendation[]; confirmedRecommendations: Recommendation[];
  productionNotes: string[]; restrictions: string[];
};
