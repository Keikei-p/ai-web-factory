import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  updateDoc,
  writeBatch
} from "firebase/firestore";
import { cloudMode, requireFirebase } from "./firebase";

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

function toIso(value: unknown): string | null {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return null;
}

function normalizeProject(id: string, raw: Record<string, unknown>) {
  return {
    id,
    ...raw,
    created_at: toIso(raw.created_at) ?? new Date(0).toISOString(),
    updated_at: toIso(raw.updated_at) ?? new Date(0).toISOString(),
    delivered_at: toIso(raw.delivered_at)
  };
}

function normalizeChild(id: string, raw: Record<string, unknown>) {
  return {
    id,
    ...raw,
    created_at: toIso(raw.created_at) ?? new Date(0).toISOString(),
    updated_at: toIso(raw.updated_at) ?? undefined
  };
}

async function localJson(route: string, options?: RequestInit) {
  const response = await fetch(route, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "処理に失敗しました。");
  return data;
}

function currentUserId() {
  const { auth } = requireFirebase();
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("ログインが必要です。");
  return uid;
}

async function cloudDetail(id: string) {
  const { db } = requireFirebase();
  const projectRef = doc(db, "projects", id);
  const projectSnapshot = await getDoc(projectRef);

  if (!projectSnapshot.exists()) {
    throw new Error("案件が見つかりません。");
  }

  const [approvalSnapshots, historySnapshots, analysisSnapshots, specSnapshots] = await Promise.all([
    getDocs(query(collection(projectRef, "approvals"), orderBy("created_at", "desc"))),
    getDocs(query(collection(projectRef, "history"), orderBy("created_at", "desc"))),
    getDocs(query(collection(projectRef, "analyses"), orderBy("created_at", "desc"))),
    getDocs(query(collection(projectRef, "specifications"), orderBy("version", "desc")))
  ]);

  const project = normalizeProject(projectSnapshot.id, projectSnapshot.data());
  const approvals = approvalSnapshots.docs.map((item) => normalizeChild(item.id, item.data()));
  const history = historySnapshots.docs.map((item) => normalizeChild(item.id, item.data()));

  const latestApproval = (type: string) =>
    approvals.find((item) => item.approval_type === type)?.decision;

  const nextActions = (TRANSITIONS[String(project.status)] ?? []).map((status) => {
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

  const analyses = analysisSnapshots.docs.flatMap((row) => {
    const data = row.data();
    try {
      const document = typeof data.raw_json === "string" ? JSON.parse(data.raw_json) : data.raw_json;
      return document?.schemaVersion === 1 && document?.result
        ? [{
            id: row.id,
            createdAt: toIso(data.created_at) ?? new Date(0).toISOString(),
            stale: false,
            ...document
          }]
        : [];
    } catch {
      return [];
    }
  });

  const specifications = specSnapshots.docs.flatMap((row) => {
    const data = row.data();
    try {
      const specification = typeof data.content_json === "string"
        ? JSON.parse(data.content_json)
        : data.content_json;
      return specification?.schemaVersion === 1
        ? [{
            id: row.id,
            version: data.version,
            status: data.status,
            createdAt: toIso(data.created_at) ?? new Date(0).toISOString(),
            stale: false,
            content: specification
          }]
        : [];
    } catch {
      return [];
    }
  });

  return {
    project,
    latestAnalysis: analyses[0] ?? null,
    latestSpec: specifications[0] ?? null,
    approvals,
    history,
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

    const { db } = requireFirebase();
    const snapshots = await getDocs(
      query(collection(db, "projects"), orderBy("updated_at", "desc"))
    );

    return snapshots.docs.map((item) => {
      const project = normalizeProject(item.id, item.data());
      return {
        id: project.id,
        project_code: project.project_code,
        project_name: project.project_name,
        client_name: project.client_name,
        source: project.source,
        status: project.status,
        priority: project.priority,
        desired_deadline: project.desired_deadline,
        created_at: project.created_at,
        updated_at: project.updated_at
      };
    });
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

    const { db } = requireFirebase();
    const uid = currentUserId();
    const projectRef = doc(collection(db, "projects"));
    const historyRef = doc(collection(projectRef, "history"));
    const batch = writeBatch(db);

    batch.set(projectRef, {
      id: projectRef.id,
      owner_id: uid,
      project_code: makeProjectCode(projectRef.id),
      ...projectPayload(form),
      status: "新規",
      assignee: "",
      preview_url: "",
      github_repository: "",
      final_confirmation: 0,
      delivered_at: null,
      workflow_approvals: {},
      created_at: serverTimestamp(),
      updated_at: serverTimestamp()
    });

    batch.set(historyRef, {
      owner_id: uid,
      event_type: "project_created",
      description: "案件を登録しました。",
      created_at: serverTimestamp()
    });

    await batch.commit();
    const created = await getDoc(projectRef);
    return normalizeProject(created.id, created.data() ?? {});
  },

  async updateProject(id: string, form: Record<string, string>) {
    if (!cloudMode) {
      return localJson(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
    }

    const { db } = requireFirebase();
    const uid = currentUserId();
    const projectRef = doc(db, "projects", id);
    const historyRef = doc(collection(projectRef, "history"));
    const batch = writeBatch(db);

    batch.update(projectRef, {
      ...projectPayload(form),
      updated_at: serverTimestamp()
    });

    batch.set(historyRef, {
      owner_id: uid,
      event_type: "project_updated",
      description: "案件情報を編集しました。",
      created_at: serverTimestamp()
    });

    await batch.commit();
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

    const { db } = requireFirebase();
    const uid = currentUserId();
    const projectRef = doc(db, "projects", id);

    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(projectRef);
      if (!snapshot.exists()) throw new Error("案件が見つかりません。");

      const current = snapshot.data();
      const currentStatus = String(current.status ?? "");
      const allowed = TRANSITIONS[currentStatus] ?? [];

      if (!allowed.includes(status)) {
        throw new Error("このステータスには直接変更できません。");
      }

      const approvals = (current.workflow_approvals ?? {}) as Record<string, string>;
      if (currentStatus === "制作待ち" && status === "制作中" && approvals.production_start !== "approved") {
        throw new Error("制作開始の明示承認が必要です。");
      }
      if (currentStatus === "最終確認" && status === "納品" && approvals.final_delivery !== "approved") {
        throw new Error("最終納品の明示承認が必要です。");
      }

      const update: Record<string, unknown> = {
        status,
        updated_at: serverTimestamp()
      };
      if (status === "納品") update.delivered_at = serverTimestamp();

      transaction.update(projectRef, update);
      transaction.set(doc(collection(projectRef, "history")), {
        owner_id: uid,
        event_type: "status_changed",
        description: `ステータスを「${currentStatus}」から「${status}」へ変更しました。`,
        created_at: serverTimestamp()
      });
    });

    return cloudDetail(id);
  },

  async recordApproval(
    id: string,
    approvalType: string,
    decision: "approved" | "rejected",
    note: string
  ) {
    if (!cloudMode) {
      return localJson(`/api/projects/${id}/approvals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approvalType, decision, note })
      });
    }

    const { db } = requireFirebase();
    const uid = currentUserId();
    const projectRef = doc(db, "projects", id);

    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(projectRef);
      if (!snapshot.exists()) throw new Error("案件が見つかりません。");

      const project = snapshot.data();
      const status = String(project.status ?? "");

      if (approvalType === "production_start" && status !== "制作待ち") {
        throw new Error("制作開始は「制作待ち」の時だけ承認できます。");
      }
      if (approvalType === "final_delivery" && status !== "最終確認") {
        throw new Error("最終納品は「最終確認」の時だけ承認できます。");
      }
      if (!["production_start", "final_delivery"].includes(approvalType)) {
        throw new Error("この承認はクラウド版ではまだ利用できません。");
      }

      const approvals = {
        ...((project.workflow_approvals ?? {}) as Record<string, string>),
        [approvalType]: decision
      };

      const projectUpdate: Record<string, unknown> = {
        workflow_approvals: approvals,
        updated_at: serverTimestamp()
      };

      if (approvalType === "final_delivery") {
        projectUpdate.final_confirmation = decision === "approved" ? 1 : 0;
      }

      transaction.update(projectRef, projectUpdate);

      transaction.set(doc(collection(projectRef, "approvals")), {
        owner_id: uid,
        approval_type: approvalType,
        decision,
        note: note.trim().slice(0, 2000),
        created_at: serverTimestamp()
      });

      transaction.set(doc(collection(projectRef, "history")), {
        owner_id: uid,
        event_type: "approval_recorded",
        description: `${APPROVALS[approvalType] ?? approvalType}を${decision === "approved" ? "承認" : "差し戻し"}しました。`,
        created_at: serverTimestamp()
      });
    });

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
    if (cloudMode) {
      throw new Error("クラウド版ではローカルDBバックアップは使用しません。");
    }

    return localJson("/api/backups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}"
    });
  }
};
