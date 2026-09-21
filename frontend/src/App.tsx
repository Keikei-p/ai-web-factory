import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

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

type DetailResponse = {
  project: Project;
  latestAnalysis: unknown | null;
  latestSpec: unknown | null;
  approvals: Array<{ id: string; approval_type: string; decision: string; note: string; created_at: string }>;
  history: Array<{ id: string; event_type: string; description: string; created_at: string }>;
};

type View =
  | { screen: "dashboard" }
  | { screen: "new" }
  | { screen: "detail"; id: string };

const emptyForm = {
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

function formatDate(value: string) {
  if (!value) return "未設定";
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function sourceLabel(source: string) {
  const labels: Record<string, string> = {
    manual: "手動登録",
    website: "自社サイト",
    gmail: "Gmail",
    line: "LINE",
    sns: "SNS",
    lancers: "Lancers",
    coconala: "ココナラ"
  };
  return labels[source] ?? source;
}

function App() {
  const [view, setView] = useState<View>({ screen: "dashboard" });
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const loadProjects = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/projects");
      if (!response.ok) throw new Error("案件一覧を取得できませんでした。");
      setProjects(await response.json());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "通信エラーが発生しました。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    if (view.screen !== "detail") {
      setDetail(null);
      return;
    }

    let active = true;
    void (async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/projects/${view.id}`);
        if (!response.ok) throw new Error("案件詳細を取得できませんでした。");
        const data = (await response.json()) as DetailResponse;
        if (active) setDetail(data);
      } catch (error) {
        if (active) setMessage(error instanceof Error ? error.message : "通信エラーが発生しました。");
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [view]);

  const stats = useMemo(
    () => ({
      total: projects.length,
      newCount: projects.filter((project) => project.status === "新規").length,
      waiting: projects.filter((project) => project.status.includes("確認")).length,
      active: projects.filter((project) => ["制作待ち", "制作中", "修正中", "再チェック"].includes(project.status)).length
    }),
    [projects]
  );

  const goDashboard = () => {
    setMessage("");
    setView({ screen: "dashboard" });
    void loadProjects();
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
          <button className={view.screen === "dashboard" ? "nav-item active" : "nav-item"} onClick={goDashboard}>
            ダッシュボード
          </button>
          <button className={view.screen === "new" ? "nav-item active" : "nav-item"} onClick={() => setView({ screen: "new" })}>
            ＋ 新規案件
          </button>
        </nav>

        <div className="local-badge">
          <span className="dot" />
          PC内だけで稼働
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <p className="eyebrow">AI WEB FACTORY</p>
            <h1>{view.screen === "dashboard" ? "案件ダッシュボード" : view.screen === "new" ? "新規案件登録" : "案件詳細"}</h1>
          </div>
          {view.screen !== "new" && (
            <button className="primary-button" onClick={() => setView({ screen: "new" })}>
              ＋ 案件を登録
            </button>
          )}
        </header>

        {message && <div className="notice error">{message}</div>}

        {view.screen === "dashboard" && (
          <Dashboard
            projects={projects}
            loading={loading}
            stats={stats}
            onSelect={(id) => setView({ screen: "detail", id })}
            onCreate={() => setView({ screen: "new" })}
          />
        )}

        {view.screen === "new" && (
          <NewProject
            onCancel={goDashboard}
            onCreated={(id) => {
              void loadProjects();
              setView({ screen: "detail", id });
            }}
          />
        )}

        {view.screen === "detail" && (
          <ProjectDetail detail={detail} loading={loading} onBack={goDashboard} />
        )}
      </main>
    </div>
  );
}

function Dashboard({
  projects,
  loading,
  stats,
  onSelect,
  onCreate
}: {
  projects: ProjectSummary[];
  loading: boolean;
  stats: { total: number; newCount: number; waiting: number; active: number };
  onSelect: (id: string) => void;
  onCreate: () => void;
}) {
  return (
    <>
      <section className="stat-grid" aria-label="案件サマリー">
        <StatCard label="全案件" value={stats.total} />
        <StatCard label="新規" value={stats.newCount} />
        <StatCard label="確認待ち" value={stats.waiting} />
        <StatCard label="制作進行中" value={stats.active} />
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>案件一覧</h2>
            <p>受付から納品まで、すべての案件をここで管理します。</p>
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
        ) : (
          <div className="project-list">
            {projects.map((project) => (
              <button className="project-row" key={project.id} onClick={() => onSelect(project.id)}>
                <div className="project-main">
                  <span className="project-code">{project.project_code}</span>
                  <strong>{project.project_name}</strong>
                  <span>{project.client_name || "顧客名未設定"}</span>
                </div>
                <div className="project-meta">
                  <span className="status-pill">{project.status}</span>
                  <span>{sourceLabel(project.source)}</span>
                  <span>{formatDate(project.created_at)}</span>
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

function NewProject({
  onCancel,
  onCreated
}: {
  onCancel: () => void;
  onCreated: (id: string) => void;
}) {
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const update = (key: keyof typeof emptyForm, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setSaving(true);

    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "案件を登録できませんでした。");
      onCreated(data.id);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "登録に失敗しました。");
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
          <div><h2>基本情報</h2><p>案件を識別するための情報です。</p></div>
        </div>
        <div className="form-grid">
          <Field label="案件名 *" value={form.projectName} onChange={(v) => update("projectName", v)} placeholder="例：○○株式会社 コーポレートサイト制作" />
          <Field label="顧客名" value={form.clientName} onChange={(v) => update("clientName", v)} placeholder="会社名・屋号など" />
          <Field label="担当者名" value={form.contactName} onChange={(v) => update("contactName", v)} placeholder="顧客側の担当者" />
          <Field label="連絡先" value={form.contact} onChange={(v) => update("contact", v)} placeholder="メール・電話など" />
          <SelectField label="受付元" value={form.source} onChange={(v) => update("source", v)} options={[
            ["manual", "手動登録"], ["website", "自社サイト"], ["gmail", "Gmail"], ["line", "LINE"], ["sns", "SNS"], ["lancers", "Lancers"], ["coconala", "ココナラ"]
          ]} />
          <SelectField label="優先度" value={form.priority} onChange={(v) => update("priority", v)} options={[
            ["低", "低"], ["通常", "通常"], ["高", "高"], ["最優先", "最優先"]
          ]} />
        </div>
      </section>

      <section className="panel form-section">
        <div className="section-title">
          <span>02</span>
          <div><h2>制作内容</h2><p>分からない項目は空欄のままで構いません。AIが勝手に補完しない設計にします。</p></div>
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
        <button className="primary-button" disabled={saving}>{saving ? "登録中..." : "案件を登録"}</button>
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
      <input type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
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
      <textarea value={value} placeholder={placeholder} rows={4} onChange={(event) => onChange(event.target.value)} />
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
  options: Array<[string, string]>;
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
  onBack
}: {
  detail: DetailResponse | null;
  loading: boolean;
  onBack: () => void;
}) {
  if (loading || !detail) return <div className="panel empty-state">読み込み中...</div>;

  const { project, latestAnalysis, latestSpec, history } = detail;

  return (
    <div className="detail-stack">
      <div className="detail-toolbar">
        <button className="secondary-button" onClick={onBack}>← 一覧へ戻る</button>
        <span className="status-pill">{project.status}</span>
      </div>

      <section className="panel project-hero">
        <div>
          <span className="project-code">{project.project_code}</span>
          <h2>{project.project_name}</h2>
          <p>{project.client_name || "顧客名未設定"} ・ {sourceLabel(project.source)}</p>
        </div>
        <div className="hero-side">
          <span>優先度</span>
          <strong>{project.priority}</strong>
        </div>
      </section>

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

      <div className="phase-grid">
        <section className="panel phase-card">
          <div className="phase-number">AI 01</div>
          <h3>AI案件分析</h3>
          <p>{latestAnalysis ? "分析データがあります。" : "次の開発段階でAI分析機能を接続します。"}</p>
          <button className="disabled-button" disabled>未実装</button>
        </section>
        <section className="panel phase-card">
          <div className="phase-number">AI 02</div>
          <h3>制作仕様書</h3>
          <p>{latestSpec ? "仕様書データがあります。" : "AI分析結果から制作仕様書を生成する予定です。"}</p>
          <button className="disabled-button" disabled>未実装</button>
        </section>
        <section className="panel phase-card">
          <div className="phase-number">HUMAN</div>
          <h3>承認</h3>
          <p>制作開始などの重要操作は、必ず人間の明示承認を通します。</p>
          <button className="disabled-button" disabled>未実装</button>
        </section>
      </div>

      <section className="panel">
        <h3>履歴</h3>
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
