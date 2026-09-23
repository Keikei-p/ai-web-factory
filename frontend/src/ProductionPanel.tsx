import { useMemo, useState } from "react";
import type { SiteManifest, QualityResult } from "../../backend/src/production-types";
import type { AnalysisWorkspace } from "./AnalysisPanel";

export type ProductionWorkspace = {
  mode: string;
  externalTransmission: boolean;
  productionStartApproved: boolean;
  finalDeliveryApproved: boolean;
  revisionTypes: Record<string, string>;
  builds: Array<{
    id: string;
    version: number;
    specificationId: string;
    createdAt: string;
    manifest: SiteManifest;
    previewUrl: string;
    latestQuality: QualityResult | null;
  }>;
  revisions: Array<{
    id: string;
    fromBuildId: string;
    toBuildId: string;
    instructionType: string;
    valueJson: string;
    createdAt: string;
  }>;
};

type ActionArgs = {
  route: string;
  body?: object;
  message: string;
};

function qualityLabel(value: QualityResult["overall"]) {
  if (value === "pass") return "合格";
  if (value === "warn") return "要目視確認";
  return "要修正";
}

function qualityClass(value: QualityResult["overall"]) {
  if (value === "pass") return "quality-pass";
  if (value === "warn") return "quality-warn";
  return "quality-fail";
}

export function ProductionPanel({
  projectId,
  analysisWorkspace,
  workspace,
  busy,
  onAction
}: {
  projectId: string;
  analysisWorkspace: AnalysisWorkspace;
  workspace: ProductionWorkspace;
  busy: boolean;
  onAction: (args: ActionArgs) => void;
}) {
  const cloudManagement = workspace.mode === "cloud-management";
  const latestSpec = analysisWorkspace.specifications[0];
  const approvedLatestSpec =
    latestSpec && latestSpec.status === "approved" && !latestSpec.stale ? latestSpec : null;
  const latestBuild = workspace.builds[0];

  const [revisionType, setRevisionType] = useState("heroTitle");
  const [revisionValue, setRevisionValue] = useState("");
  const [compactHero, setCompactHero] = useState(true);

  const revisionOptions = useMemo(
    () => Object.entries(workspace.revisionTypes),
    [workspace.revisionTypes]
  );

  if (cloudManagement) {
    return (
      <section className="panel production-panel">
        <div className="panel-header">
          <div>
            <h3>Web制作</h3>
            <p>スマホ対応のクラウド版では、現在は案件管理と承認まで利用できます。</p>
          </div>
          <span className="approval-wait">次段階</span>
        </div>
        <div className="notice warning">
          サイト生成・プレビュー・品質チェック・納品ファイル生成は、まだクラウドへ移行していません。
          現在のローカル制作機能は保持されています。
        </div>
      </section>
    );
  }

  const runRevision = () => {
    if (!latestBuild) return;
    const value = revisionType === "compactHero" ? compactHero : revisionValue;
    onAction({
      route: `site-builds/${latestBuild.id}/revisions`,
      body: { type: revisionType, value },
      message: "修正内容を反映した新しいサイト版を生成しました。"
    });
    if (revisionType !== "compactHero") setRevisionValue("");
  };

  return (
    <section className="panel production-panel">
      <div className="panel-header">
        <div>
          <h3>ローカルWeb制作</h3>
          <p>承認済み仕様書から静的サイトをPC内に生成します。外部公開・外部送信はしません。</p>
        </div>
        <span className="safe-badge">ローカル生成</span>
      </div>

      {!approvedLatestSpec && (
        <div className="notice warning">
          最新の制作仕様書を承認すると、サイト生成の準備ができます。
        </div>
      )}
      {approvedLatestSpec && !workspace.productionStartApproved && (
        <div className="notice warning">
          サイト生成には、工程の「制作開始」をあなたが明示承認する必要があります。
        </div>
      )}

      <div className="production-actions">
        <button
          className="primary-button"
          disabled={busy || !approvedLatestSpec || !workspace.productionStartApproved}
          onClick={() => approvedLatestSpec && onAction({
            route: "site-builds",
            body: { specificationId: approvedLatestSpec.id },
            message: "承認済み仕様書からローカルサイトを生成しました。"
          })}
        >
          サイトを生成
        </button>

        {latestBuild && (
          <a
            className="secondary-button link-button"
            href={latestBuild.previewUrl}
            target="_blank"
            rel="noreferrer"
          >
            プレビューを開く
          </a>
        )}
      </div>

      {!latestBuild ? (
        <p className="muted">まだ生成サイトはありません。</p>
      ) : (
        <>
          <div className="build-summary">
            <div>
              <span>最新版</span>
              <strong>サイト v{latestBuild.version}</strong>
            </div>
            <div>
              <span>ページ数</span>
              <strong>{latestBuild.manifest.pages.length}</strong>
            </div>
            <div>
              <span>品質</span>
              <strong className={latestBuild.latestQuality ? qualityClass(latestBuild.latestQuality.overall) : ""}>
                {latestBuild.latestQuality ? qualityLabel(latestBuild.latestQuality.overall) : "未チェック"}
              </strong>
            </div>
          </div>

          <div className="generated-pages">
            <h4>生成ページ</h4>
            <div className="page-chips">
              {latestBuild.manifest.pages.map((page) => (
                <a
                  key={page.file}
                  href={`/preview/${latestBuild.id}/${page.file}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {page.label}
                </a>
              ))}
            </div>
          </div>

          <div className="quality-block">
            <div className="section-row">
              <div>
                <h4>自動品質チェック</h4>
                <p className="muted">ページ、内部リンク、画像参照、SEO基礎、レスポンシブ、アクセシビリティ基礎を確認します。</p>
              </div>
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() => onAction({
                  route: `site-builds/${latestBuild.id}/quality-checks`,
                  body: {},
                  message: "自動品質チェックを実行しました。"
                })}
              >
                品質チェックを実行
              </button>
            </div>

            {latestBuild.latestQuality && (
              <div className="quality-list">
                {latestBuild.latestQuality.checks.map((item) => (
                  <div key={item.id} className="quality-item">
                    <span className={`quality-dot ${item.status}`} />
                    <div>
                      <strong>{item.label}</strong>
                      <p>{item.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="revision-block">
            <h4>定型修正</h4>
            <p className="muted">
              外部AIなしのため、自由文を勝手に解釈せず、安全な修正項目だけを選んで反映します。
            </p>
            <div className="revision-grid">
              <label className="field">
                <span>修正する項目</span>
                <select value={revisionType} onChange={(event) => setRevisionType(event.target.value)}>
                  {revisionOptions.map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>

              {revisionType === "compactHero" ? (
                <label className="field checkbox-field">
                  <span>設定</span>
                  <span className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={compactHero}
                      onChange={(event) => setCompactHero(event.target.checked)}
                    />
                    ファーストビューをコンパクトにする
                  </span>
                </label>
              ) : (
                <label className="field">
                  <span>{revisionType === "primaryColor" ? "値（例 #314eea）" : "新しい内容"}</span>
                  <input
                    value={revisionValue}
                    onChange={(event) => setRevisionValue(event.target.value)}
                    placeholder={revisionType === "primaryColor" ? "#314eea" : "変更後の内容"}
                  />
                </label>
              )}
            </div>
            <button
              className="secondary-button"
              disabled={busy || (revisionType !== "compactHero" && !revisionValue.trim())}
              onClick={runRevision}
            >
              修正して新しい版を生成
            </button>
          </div>

          <div className="export-block">
            <h4>納品用フォルダ</h4>
            <p className="muted">
              品質チェックで失敗がなく、あなたが「最終納品」を明示承認した最新版だけ、PC内の納品用フォルダへ書き出せます。本番公開は行いません。
            </p>
            {!workspace.finalDeliveryApproved && (
              <p className="notice warning">現在は最終納品の承認待ちです。</p>
            )}
            <button
              className="primary-button"
              disabled={
                busy ||
                !workspace.finalDeliveryApproved ||
                !latestBuild.latestQuality ||
                latestBuild.latestQuality.overall === "fail"
              }
              onClick={() => onAction({
                route: `site-builds/${latestBuild.id}/export`,
                body: {},
                message: "納品用フォルダを書き出しました。"
              })}
            >
              納品用フォルダを書き出す
            </button>
          </div>

          {workspace.builds.length > 1 && (
            <details className="build-history">
              <summary>過去の生成版を見る（{workspace.builds.length}件）</summary>
              <div>
                {workspace.builds.map((build) => (
                  <a
                    key={build.id}
                    href={build.previewUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    サイト v{build.version} ・ {new Date(build.createdAt).toLocaleString("ja-JP")}
                  </a>
                ))}
              </div>
            </details>
          )}
        </>
      )}

      <p className="muted production-footnote">
        案件ID: {projectId} / 生成物は data/generated、納品用コピーは data/exports に保存されます。
      </p>
    </section>
  );
}
