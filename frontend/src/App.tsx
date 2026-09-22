import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { AnalysisPanel, type AnalysisWorkspace } from "./AnalysisPanel";
import { ProductionPanel, type ProductionWorkspace } from "./ProductionPanel";

type ProjectSummary = {
  id: string;
  project_code: string;
  project_name: string;
  client_name: string;
  source: string;
  status: string;
  priority: string;
  desired_deadline: string;
  created_at: string;
  updated_at: string;
};

type Project = ProjectSummary & {
  contact_name: string;
  contact: string;
  request_details: string;
  site_type: string;
  purpose: string;
  target: string;
  required_pages: string;
  design_preferences: string;
  reference_sites: string;
  required_features: string;
  assets: string;
  budget: string;
  assignee: string;
  preview_url: string;
  github_repository: string;
  final_confirmation: number;
  delivered_at: string | null;
};

type Approval = {
  id: string;
  approval_type: string;
  decision: "approved" | "rejected";
  note: string;
  created_at: string;
};

type HistoryItem = {
  id: string;
  event_type: string;
  description: string;
  created_at: string;
};

type NextAction = {
  status: string;
  approvalType: string | null;
  approvalLabel: string | null;
  approvalSatisfied: boolean;
};

type DetailResponse = {
  project: Project;
  latestAnalysis: unknown | null;
  latestSpec: unknown | null;
  approvals: Approval[];
  history: HistoryItem[];
  nextActions: NextAction[];
  analysisWorkspace: AnalysisWorkspace;
  productionWorkspace: ProductionWorkspace;
};

type MetaResponse = {
  statuses: string[];
  sources: Array<[string, string]>;
  priorities: string[];
  approvalTypes: Record<string, string>;
};

type Notice = {
  kind: "success" | "error";
  text: string;
};

type View =
  | { screen: "dashboard" }
  | { screen: "new" }
  | { screen: "detail"; id: string }
  | { screen: "edit"; project: Project };

type ProjectFormState = {
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

const defaultMeta: MetaResponse = {
  statuses: [
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
  ],
  sources: [
    ["manual", "手動登録"],
    ["website", "自社サイト"],
    ["gmail", "Gmail"],
    ["line", "LINE"],
    ["sns", "SNS"],
    ["lancers", "Lancers"],
    ["coconala", "ココナラ"]
  ],
  priorities: ["低", "通常", "高", "最優先"],
  approvalTypes: {}
};

const emptyForm: ProjectFormState = {
  projectName: "",
  clientName: "",
  contactName: "",
  contact: "",
  source: "manual",
  requestDetails: "",
  siteType: "",
  purpose: "",
  target: "",
  requiredPages: "",
  designPreferences: "",
  referenceSites: "",
  requiredFeatures: "",
  assets: "",
  desiredDeadline: "",
  budget: "",
  priority: "通常"
};

function projectToForm(project: Project): ProjectFormState {
  return {
    projectName: project.project_name,
    clientName: project.client_name,
    contactName: project.contact_name,
    contact: project.contact,
    source: project.source,
    requestDetails: project.request_details,
    siteType: project.site_type,
    purpose: project.purpose,
    target: project.target,
    requiredPages: project.required_pages,
    designPreferences: project.design_preferences,
    referenceSites: project.reference_sites,
    requiredFeatures: project.required_features,
    assets: project.assets,
    desiredDeadline: project.desired_deadline,
    budget: project.budget,
    priority: project.priority
  };
}

function formatDate(value: string | null | undefined) {
  if (!value) return "未設定";
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function sourceLabel(source: string, meta: MetaResponse) {
  return meta.sources.find(([value]) => value === source)?.[1] ?? source;
}

async function readJson(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "処理に失敗しました。");
  }
  return data;
}

function App() {
  const [view, setView] = useState<View>({ screen: "dashboard" });
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [meta, setMeta] = useState<MetaResponse>(defaultMeta);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [backupBusy, setBackupBusy] = useState(false);

  const loadProjects = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/projects");
      setProjects(await readJson(response));
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "案件一覧を取得できませんでした。"
      });
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/projects/${id}`);
      const data = (await readJson(response)) as DetailResponse;
      setDetail(data);
      return data;
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "案件詳細を取得できませんでした。"
      });
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProjects();
    void (async () => {
      try {
        const response = await fetch("/api/meta");
        setMeta(await readJson(response));
      } catch {
        // 初期値で動作可能。API起動直後などは次回表示時に再取得される。
      }
    })();
  }, [loadProjects]);

  useEffect(() => {
    if (view.screen === "detail") {
      void loadDetail(view.id);
    }
  }, [view, loadDetail]);

  const goDashboard = () => {
    setDetail(null);
    setNotice(null);
    setView({ screen: "dashboard" });
    void loadProjects();
  };

  const backupNow = async () => {
    setBackupBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/backups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}"
      });
      const data = await readJson(response);
      setNotice({ kind: "success", text: `バックアップを作成しました: ${data.filename}` });
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "バックアップに失敗しました。"
      });
    } finally {
      setBackupBusy(false);
    }
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <div className="brand-mark">AW</div>
          <div className="brand-copy">
            <strong>AI Web Factory</strong>
            <span>Local workspace</span>
          </div>
        </div>

        <nav aria-label="メインメニュー">
          <button
            className={view.screen === "dashboard" ? "nav-item active" : "nav-item"}
            onClick={goDashboard}
          >
            ダッシュボード
          </button>
          <button
            className={view.screen === "new" ? "nav-item active" : "nav-item"}
            onClick={() => setView({ screen: "new" })}
          >
            ＋ 新規案件
          </button>
        </nav>

        <div className="sidebar-footer">
          <button className="backup-link" onClick={backupNow} disabled={backupBusy}>
            {backupBusy ? "保存中..." : "DBバックアップ"}
          </button>
          <div className="local-badge">
            <span className="dot" />
            PC内だけで稼働
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <p className="eyebrow">AI WEB FACTORY</p>
            <h1>
              {view.screen === "dashboard"
                ? "案件ダッシュボード"
                : view.screen === "new"
                  ? "新規案件登録"
                  : view.screen === "edit"
                    ? "案件編集"
                    : "案件詳細"}
            </h1>
          </div>
          <div className="topbar-actions">
            <button className="secondary-button desktop-only" onClick={backupNow} disabled={backupBusy}>
              {backupBusy ? "保存中..." : "バックアップ"}
            </button>
            {view.screen !== "new" && (
              <button className="primary-button" onClick={() => setView({ screen: "new" })}>
                ＋ 案件を登録
              </button>
            )}
          </div>
        </header>

        {notice && <div className={`notice ${notice.kind}`}>{notice.text}</div>}

        {view.screen === "dashboard" && (
          <Dashboard
            projects={projects}
            loading={loading}
            meta={meta}
            onSelect={(id) => setView({ screen: "detail", id })}
            onCreate={() => setView({ screen: "new" })}
          />
        )}

        {view.screen === "new" && (
          <ProjectEditor
            mode="create"
            initial={emptyForm}
            meta={meta}
            onCancel={goDashboard}
            onSaved={(id) => {
              void loadProjects();
              setNotice({ kind: "success", text: "案件を登録しました。" });
              setView({ screen: "detail", id });
            }}
          />
        )}

        {view.screen === "edit" && (
          <ProjectEditor
            mode="edit"
            projectId={view.project.id}
            initial={projectToForm(view.project)}
            meta={meta}
            onCancel={() => setView({ screen: "detail", id: view.project.id })}
            onSaved={(id) => {
              void loadProjects();
              setNotice({ kind: "success", text: "案件情報を更新しました。" });
              setView({ screen: "detail", id });
            }}
          />
        )}

        {view.screen === "detail" && (
          <ProjectDetail
            detail={detail}
            loading={loading}
            meta={meta}
            onBack={goDashboard}
            onEdit={(project) => setView({ screen: "edit", project })}
            onChanged={(nextDetail, message) => {
              setDetail(nextDetail);
              setNotice({ kind: "success", text: message });
              void loadProjects();
            }}
          />
        )}
      </main>
    </div>
  );
}

function Dashboard({
  projects,
  loading,
  meta,
  onSelect,
  onCreate
}: {
  projects: ProjectSummary[];
  loading: boolean;
  meta: MetaResponse;
  onSelect: (id: string) => void;
  onCreate: () => void;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");

  const stats = useMemo(
    () => ({
      total: projects.length,
      newCount: projects.filter((project) => project.status === "新規").length,
      waiting: projects.filter((project) => project.status.includes("確認")).length,
      active: projects.filter((project) =>
        ["制作待ち", "制作中", "AI品質チェック", "修正中", "再チェック"].includes(project.status)
      ).length
    }),
    [projects]
  );

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return projects.filter((project) => {
      const matchesStatus = status === "all" || project.status === status;
      const matchesText =
        !normalized ||
        [project.project_code, project.project_name, project.client_name]
          .join(" ")
          .toLowerCase()
          .includes(normalized);
      return matchesStatus && matchesText;
    });
  }, [projects, query, status]);

  return (
    <>
      <section className="stat-grid" aria-label="案件サマリー">
        <StatCard label="全案件" value={stats.total} />
        <StatCard label="新規" value={stats.newCount} />
        <StatCard label="確認待ち" value={stats.waiting} />
        <StatCard label="制作進行中" value={stats.active} />
      </section>

      <section className="panel">
        <div className="panel-header dashboard-header">
          <div>
            <h2>案件一覧</h2>
            <p>受付から納品まで、すべての案件をここで管理します。</p>
          </div>
          <div className="filters">
            <input
              aria-label="案件を検索"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="案件名・顧客名・案件IDで検索"
            />
            <select
              aria-label="ステータスで絞り込み"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="all">全ステータス</option>
              {meta.statuses.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="empty-state">読み込み中...</div>
        ) : projects.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">＋</div>
            <h3>まだ案件がありません</h3>
            <p>最初の案件を手動登録して、AI Web Factoryを動かし始めましょう。</p>
            <button className="primary-button" onClick={onCreate}>最初の案件を登録</button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <h3>条件に合う案件がありません</h3>
            <p>検索文字またはステータスを変更してください。</p>
          </div>
        ) : (
          <div className="project-list">
            {filtered.map((project) => (
              <button className="project-row" key={project.id} onClick={() => onSelect(project.id)}>
                <div className="project-main">
                  <span className="project-code">{project.project_code}</span>
                  <strong>{project.project_name}</strong>
                  <span>{project.client_name || "顧客名未設定"}</span>
                </div>
                <div className="project-meta">
                  <span className="status-pill">{project.status}</span>
                  <span>{sourceLabel(project.source, meta)}</span>
                  <span>更新 {formatDate(project.updated_at)}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ProjectEditor({
  mode,
  projectId,
  initial,
  meta,
  onCancel,
  onSaved
}: {
  mode: "create" | "edit";
  projectId?: string;
  initial: ProjectFormState;
  meta: MetaResponse;
  onCancel: () => void;
  onSaved: (id: string) => void;
}) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const update = (key: keyof ProjectFormState, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setSaving(true);

    try {
      const url = mode === "create" ? "/api/projects" : `/api/projects/${projectId}`;
      const response = await fetch(url, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      const data = await readJson(response);
      const id = mode === "create" ? data.id : data.project.id;
      onSaved(id);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "保存に失敗しました。");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="form-stack" onSubmit={submit}>
      {error && <div className="notice error">{error}</div>}

      <section className="panel form-section">
        <div className="section-title">
          <span>01</span>
          <div>
            <h2>基本情報</h2>
            <p>案件を識別するための情報です。</p>
          </div>
        </div>
        <div className="form-grid">
          <Field label="案件名 *" value={form.projectName} onChange={(v) => update("projectName", v)} placeholder="例：○○株式会社 コーポレートサイト制作" />
          <Field label="顧客名" value={form.clientName} onChange={(v) => update("clientName", v)} placeholder="会社名・屋号など" />
          <Field label="担当者名" value={form.contactName} onChange={(v) => update("contactName", v)} placeholder="顧客側の担当者" />
          <Field label="連絡先" value={form.contact} onChange={(v) => update("contact", v)} placeholder="メール・電話など" />
          <SelectField
            label="受付元"
            value={form.source}
            onChange={(v) => update("source", v)}
            options={meta.sources}
          />
          <SelectField
            label="優先度"
            value={form.priority}
            onChange={(v) => update("priority", v)}
            options={meta.priorities.map((value) => [value, value])}
          />
        </div>
      </section>

      <section className="panel form-section">
        <div className="section-title">
          <span>02</span>
          <div>
            <h2>制作内容</h2>
            <p>分からない項目は空欄のままでOKです。AIが事実を勝手に補完しない前提です。</p>
          </div>
        </div>
        <div className="form-grid">
          <TextArea label="依頼内容 *" value={form.requestDetails} onChange={(v) => update("requestDetails", v)} placeholder="顧客から聞いた内容を、そのまま入力してください。" wide />
          <Field label="サイト種類" value={form.siteType} onChange={(v) => update("siteType", v)} placeholder="LP / コーポレート / 採用 / EC など" />
          <Field label="制作目的" value={form.purpose} onChange={(v) => update("purpose", v)} placeholder="問い合わせ増加、採用強化など" />
          <Field label="ターゲット" value={form.target} onChange={(v) => update("target", v)} placeholder="想定ユーザー" />
          <Field label="希望納期" type="date" value={form.desiredDeadline} onChange={(v) => update("desiredDeadline", v)} />
          <Field label="予算" value={form.budget} onChange={(v) => update("budget", v)} placeholder="例：30万円前後 / 未定" />
          <TextArea label="必要ページ" value={form.requiredPages} onChange={(v) => update("requiredPages", v)} placeholder="TOP、会社概要、サービス、お問い合わせ..." />
          <TextArea label="必要機能" value={form.requiredFeatures} onChange={(v) => update("requiredFeatures", v)} placeholder="フォーム、予約、CMSなど" />
          <TextArea label="希望デザイン" value={form.designPreferences} onChange={(v) => update("designPreferences", v)} placeholder="雰囲気、色、テイストなど" />
          <TextArea label="参考サイト" value={form.referenceSites} onChange={(v) => update("referenceSites", v)} placeholder="URLと参考にしたいポイント" />
          <TextArea label="掲載素材" value={form.assets} onChange={(v) => update("assets", v)} placeholder="ロゴ、写真、文章の有無など" wide />
        </div>
      </section>

      <div className="form-actions">
        <button type="button" className="secondary-button" onClick={onCancel}>キャンセル</button>
        <button className="primary-button" disabled={saving}>
          {saving ? "保存中..." : mode === "create" ? "案件を登録" : "変更を保存"}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text"
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
  placeholder,
  wide = false
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  wide?: boolean;
}) {
  return (
    <label className={wide ? "field field-wide" : "field"}>
      <span>{label}</span>
      <textarea
        value={value}
        placeholder={placeholder}
        rows={4}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<readonly [string, string]>;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>{optionLabel}</option>
        ))}
      </select>
    </label>
  );
}

function ProjectDetail({
  detail,
  loading,
  meta,
  onBack,
  onEdit,
  onChanged
}: {
  detail: DetailResponse | null;
  loading: boolean;
  meta: MetaResponse;
  onBack: () => void;
  onEdit: (project: Project) => void;
  onChanged: (detail: DetailResponse, message: string) => void;
}) {
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [approvalNote, setApprovalNote] = useState("");

  if (loading || !detail) {
    return <div className="panel empty-state">読み込み中...</div>;
  }

  const { project, history, approvals, nextActions } = detail;

  const runProjectAction = async (route: string, body: object, message: string) => {
    setActionBusy(true);
    setActionError("");
    try {
      const response = await fetch(`/api/projects/${project.id}/${route}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = await readJson(response);
      if (data?.project && data?.analysisWorkspace) {
        onChanged(data as DetailResponse, message);
      } else {
        const refreshed = await fetch(`/api/projects/${project.id}`);
        onChanged(await readJson(refreshed) as DetailResponse, message);
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "処理に失敗しました。再実行してください。");
    } finally {
      setActionBusy(false);
    }
  };

  const changeStatus = async (status: string) => {
    setActionBusy(true);
    setActionError("");
    try {
      const response = await fetch(`/api/projects/${project.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      });
      const next = (await readJson(response)) as DetailResponse;
      onChanged(next, `ステータスを「${status}」に変更しました。`);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "ステータス変更に失敗しました。");
    } finally {
      setActionBusy(false);
    }
  };

  const recordApproval = async (approvalType: string, decision: "approved" | "rejected") => {
    setActionBusy(true);
    setActionError("");
    try {
      const response = await fetch(`/api/projects/${project.id}/approvals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approvalType, decision, note: approvalNote })
      });
      const next = (await readJson(response)) as DetailResponse;
      setApprovalNote("");
      onChanged(
        next,
        `${meta.approvalTypes[approvalType] ?? "操作"}を${decision === "approved" ? "承認" : "差し戻し"}しました。`
      );
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "承認記録に失敗しました。");
    } finally {
      setActionBusy(false);
    }
  };

  const requiredApprovals = nextActions.filter((action) => action.approvalType);

  return (
    <div className="detail-stack">
      <div className="detail-toolbar">
        <button className="secondary-button" onClick={onBack}>← 一覧へ戻る</button>
        <div className="toolbar-actions">
          <button className="secondary-button" onClick={() => onEdit(project)}>案件を編集</button>
          <span className="status-pill">{project.status}</span>
        </div>
      </div>

      {actionError && <div className="notice error">{actionError}</div>}

      <section className="panel project-hero">
        <div>
          <span className="project-code">{project.project_code}</span>
          <h2>{project.project_name}</h2>
          <p>{project.client_name || "顧客名未設定"} ・ {sourceLabel(project.source, meta)}</p>
          <small className="muted">最終更新 {formatDate(project.updated_at)}</small>
        </div>
        <div className="hero-side">
          <span>優先度</span>
          <strong>{project.priority}</strong>
        </div>
      </section>

      <section className="panel workflow-panel">
        <div className="panel-header">
          <div>
            <h3>工程を進める</h3>
            <p>工程は順番にのみ進められます。重要操作は承認がないと進みません。</p>
          </div>
        </div>
        {nextActions.length === 0 ? (
          <div className="completion-box">この案件のワークフローは完了しています。</div>
        ) : (
          <div className="next-actions">
            {nextActions.map((action) => (
              <button
                key={action.status}
                className="primary-button"
                disabled={actionBusy || (Boolean(action.approvalType) && !action.approvalSatisfied)}
                onClick={() => void changeStatus(action.status)}
                title={
                  action.approvalType && !action.approvalSatisfied
                    ? `${action.approvalLabel}の承認が必要です`
                    : undefined
                }
              >
                → {action.status}
              </button>
            ))}
          </div>
        )}
      </section>

      {requiredApprovals.length > 0 && (
        <section className="panel approval-panel">
          <div>
            <h3>人間の承認</h3>
            <p className="muted">ここはAIが自動決定しません。あなたの明示操作を履歴に残します。</p>
          </div>
          <label className="field approval-note">
            <span>承認メモ（任意）</span>
            <input
              value={approvalNote}
              onChange={(event) => setApprovalNote(event.target.value)}
              placeholder="判断理由や確認内容を残せます"
            />
          </label>
          <div className="approval-actions">
            {requiredApprovals.map((action) => (
              <div className="approval-action" key={action.approvalType}>
                <div>
                  <strong>{action.approvalLabel}</strong>
                  <span className={action.approvalSatisfied ? "approval-ok" : "approval-wait"}>
                    {action.approvalSatisfied ? "承認済み" : "承認待ち"}
                  </span>
                </div>
                <div>
                  <button
                    className="secondary-button"
                    disabled={actionBusy}
                    onClick={() => void recordApproval(action.approvalType!, "rejected")}
                  >
                    差し戻す
                  </button>
                  <button
                    className="primary-button"
                    disabled={actionBusy}
                    onClick={() => void recordApproval(action.approvalType!, "approved")}
                  >
                    承認する
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="detail-grid">
        <section className="panel">
          <h3>案件情報</h3>
          <dl className="info-list">
            <Info label="担当者" value={project.contact_name} />
            <Info label="連絡先" value={project.contact} />
            <Info label="サイト種類" value={project.site_type} />
            <Info label="制作目的" value={project.purpose} />
            <Info label="ターゲット" value={project.target} />
            <Info label="希望納期" value={project.desired_deadline} />
            <Info label="予算" value={project.budget} />
          </dl>
        </section>

        <section className="panel">
          <h3>依頼内容</h3>
          <LongInfo label="依頼内容" value={project.request_details} />
          <LongInfo label="必要ページ" value={project.required_pages} />
          <LongInfo label="必要機能" value={project.required_features} />
          <LongInfo label="希望デザイン" value={project.design_preferences} />
          <LongInfo label="参考サイト" value={project.reference_sites} />
          <LongInfo label="掲載素材" value={project.assets} />
        </section>
      </div>

      <AnalysisPanel
        key={project.id}
        workspace={detail.analysisWorkspace}
        busy={actionBusy}
        onAnalyze={() => void runProjectAction("analyses", {}, "ローカル分析を保存しました。")}
        onGenerate={(analysisId) =>
          void runProjectAction("specifications", { analysisId }, "仕様書の下書きを保存しました。")
        }
        onDecision={(specId, decision, note) =>
          void runProjectAction(
            `specifications/${specId}/decision`,
            { decision, note },
            `制作仕様書を${decision === "approved" ? "承認" : "差し戻し"}しました。`
          )
        }
      />

      <ProductionPanel
        projectId={project.id}
        analysisWorkspace={detail.analysisWorkspace}
        workspace={detail.productionWorkspace}
        busy={actionBusy}
        onAction={({ route, body = {}, message }) =>
          void runProjectAction(route, body, message)
        }
      />

      <div className="detail-grid">
        <section className="panel">
          <h3>承認履歴</h3>
          {approvals.length === 0 ? (
            <p className="muted">承認履歴はまだありません。</p>
          ) : (
            <div className="approval-history">
              {approvals.map((item) => (
                <div key={item.id}>
                  <strong>{
                    item.approval_type === "specification_approval"
                      ? "制作仕様書"
                      : (meta.approvalTypes[item.approval_type] ?? item.approval_type)
                  }</strong>
                  <span className={item.decision === "approved" ? "approval-ok" : "approval-rejected"}>
                    {item.decision === "approved" ? "承認" : "差し戻し"}
                  </span>
                  <small>{formatDate(item.created_at)}</small>
                  {item.note && <p>{item.note}</p>}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="panel">
          <h3>変更・操作履歴</h3>
          {history.length === 0 ? (
            <p className="muted">履歴はまだありません。</p>
          ) : (
            <div className="timeline">
              {history.map((item) => (
                <div key={item.id} className="timeline-item">
                  <span />
                  <div>
                    <strong>{item.description}</strong>
                    <small>{formatDate(item.created_at)}</small>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value || "未設定"}</dd>
    </div>
  );
}

function LongInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="long-info">
      <span>{label}</span>
      <p>{value || "未設定"}</p>
    </div>
  );
}

export default App;
