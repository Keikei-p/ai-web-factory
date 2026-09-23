import { cloudMode, requireSupabase } from "./supabase";

const STATUSES = [
  "新規", "AI分析中", "情報不足", "確認待ち", "制作待ち", "制作中",
  "AI品質チェック", "ユーザー確認", "修正中", "再チェック", "最終確認", "納品", "完了"
] as const;

const TRANSITIONS: Record<string, string[]> = {
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

const APPROVALS: Record<string, string> = {
  production_start: "制作開始",
  customer_contact: "顧客への連絡",
  paid_service: "有料サービス契約",
  billing: "課金",
  domain_purchase: "ドメイン購入",
  dns_change: "DNS変更",
  production_publish: "本番公開",
  final_delivery: "最終納品"
};

const META = {
  statuses: STATUSES,
  sources: [
    ["manual", "手動登録"], ["website", "自社サイト"], ["gmail", "Gmail"],
    ["line", "LINE"], ["sns", "SNS"], ["lancers", "Lancers"], ["coconala", "ココナラ"]
  ],
  priorities: ["低", "通常", "高", "最優先"],
  approvalTypes: APPROVALS
};

function projectPayload(form: Record<string, string>) {
  return {
    project_name: form.projectName,
    client_name: form.clientName,
    contact_name: form.contactName,
    contact: form.contact,
    source: form.source,
    request_details: form.requestDetails,
    site_type: form.siteType,
    purpose: form.purpose,
    target: form.target,
    required_pages: form.requiredPages,
    design_preferences: form.designPreferences,
    reference_sites: form.referenceSites,
    required_features: form.requiredFeatures,
    assets: form.assets,
    desired_deadline: form.desiredDeadline,
    budget: form.budget,
    priority: form.priority
  };
}

function makeProjectCode(id: string) {
  const stamp = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `AWF-${stamp}-${id.slice(0, 4).toUpperCase()}`;
}

async function localJson(route: string, options?: RequestInit) {
  const response = await fetch(route, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "処理に失敗しました。");
  return data;
}

async function cloudHistory(projectId: string, eventType: string, description: string) {
  const client = requireSupabase();
  const { error } = await client.from("project_history").insert({
    project_id: projectId,
    event_type: eventType,
    description
  });
  if (error) throw error;
}

async function cloudDetail(id: string) {
  const client = requireSupabase();
  const [projectResult, approvalsResult, historyResult, analysesResult, specsResult] = await Promise.all([
    client.from("projects").select("*").eq("id", id).single(),
    client.from("project_approvals").select("*").eq("project_id", id).order("created_at", { ascending: false }),
    client.from("project_history").select("*").eq("project_id", id).order("created_at", { ascending: false }),
    client.from("project_analyses").select("*").eq("project_id", id).order("created_at", { ascending: false }),
    client.from("project_specs").select("*").eq("project_id", id).order("version", { ascending: false })
  ]);

  if (projectResult.error) throw projectResult.error;
  if (approvalsResult.error) throw approvalsResult.error;
  if (historyResult.error) throw historyResult.error;
  if (analysesResult.error) throw analysesResult.error;
  if (specsResult.error) throw specsResult.error;

  const project = projectResult.data;
  const approvals = approvalsResult.data ?? [];
  const latestApproval = (type: string) => approvals.find((item) => item.approval_type === type)?.decision;

  const nextActions = (TRANSITIONS[project.status] ?? []).map((status) => {
    const approvalType =
      project.status === "制作待ち" && status === "制作中" ? "production_start" :
      project.status === "最終確認" && status === "納品" ? "final_delivery" : null;
    return {
      status,
      approvalType,
      approvalLabel: approvalType ? APPROVALS[approvalType] : null,
      approvalSatisfied: !approvalType || latestApproval(approvalType) === "approved"
    };
  });

  const analyses = (analysesResult.data ?? []).flatMap((row) => {
    try {
      const document = JSON.parse(row.raw_json ?? "{}");
      return document?.schemaVersion === 1 && document?.result
        ? [{ id: row.id, createdAt: row.created_at, stale: false, ...document }]
        : [];
    } catch {
      return [];
    }
  });

  const specifications = (specsResult.data ?? []).flatMap((row) => {
    try {
      const content = JSON.parse(row.content_json ?? "{}");
      return content?.schemaVersion === 1
        ? [{ id: row.id, version: row.version, status: row.status, createdAt: row.created_at, stale: false, content }]
        : [];
    } catch {
      return [];
    }
  });

  return {
    project,
    latestAnalysis: analysesResult.data?.[0] ?? null,
    latestSpec: specsResult.data?.[0] ?? null,
    approvals,
    history: historyResult.data ?? [],
    nextActions,
    analysisWorkspace: {
      mode: "cloud-management",
      externalTransmission: false,
      analyses,
      specifications
    },
    productionWorkspace: {
      mode: "cloud-management",
      externalTransmission: false,
      productionStartApproved: latestApproval("production_start") === "approved",
      finalDeliveryApproved: latestApproval("final_delivery") === "approved",
      revisionTypes: {},
      builds: [],
      revisions: []
    }
  };
}

export const appApi = {
  mode: cloudMode ? "cloud" as const : "local" as const,

  async meta() {
    if (cloudMode) return META;
    return localJson("/api/meta");
  },

  async listProjects() {
    if (!cloudMode) return localJson("/api/projects");
    const client = requireSupabase();
    const { data, error } = await client
      .from("projects")
      .select("id,project_code,project_name,client_name,source,status,priority,desired_deadline,created_at,updated_at")
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  async detail(id: string) {
    if (!cloudMode) return localJson(`/api/projects/${id}`);
    return cloudDetail(id);
  },

  async createProject(form: Record<string, string>) {
    if (!cloudMode) {
      return localJson("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
    }

    const client = requireSupabase();
    const id = crypto.randomUUID();
    const { data, error } = await client.from("projects").insert({
      id,
      project_code: makeProjectCode(id),
      ...projectPayload(form)
    }).select("*").single();
    if (error) throw error;
    await cloudHistory(id, "project_created", "案件を登録しました。");
    return data;
  },

  async updateProject(id: string, form: Record<string, string>) {
    if (!cloudMode) {
      return localJson(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
    }

    const client = requireSupabase();
    const { error } = await client.from("projects").update(projectPayload(form)).eq("id", id);
    if (error) throw error;
    await cloudHistory(id, "project_updated", "案件情報を編集しました。");
    return cloudDetail(id);
  },

  async changeStatus(id: string, status: string) {
    if (!cloudMode) {
      return localJson(`/api/projects/${id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      });
    }
    const client = requireSupabase();
    const { error } = await client.rpc("change_project_status", {
      p_project_id: id,
      p_status: status
    });
    if (error) throw error;
    return cloudDetail(id);
  },

  async recordApproval(id: string, approvalType: string, decision: "approved" | "rejected", note: string) {
    if (!cloudMode) {
      return localJson(`/api/projects/${id}/approvals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approvalType, decision, note })
      });
    }
    const client = requireSupabase();
    const { error } = await client.rpc("record_project_approval", {
      p_project_id: id,
      p_approval_type: approvalType,
      p_decision: decision,
      p_note: note
    });
    if (error) throw error;
    return cloudDetail(id);
  },

  async projectAction(id: string, route: string, body: object) {
    if (cloudMode) {
      throw new Error("分析・サイト生成は現在PC版で実行してください。スマホ版は案件管理・承認に対応しています。");
    }
    return localJson(`/api/projects/${id}/${route}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  },

  async backup() {
    if (cloudMode) throw new Error("クラウド版ではローカルDBバックアップは使用しません。");
    return localJson("/api/backups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}"
    });
  }
};
