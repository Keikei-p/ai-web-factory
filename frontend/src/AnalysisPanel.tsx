import { useState } from "react";
import type { AnalysisResult, AnalysisDocument, Specification } from "../../backend/src/analysis-types";

export type AnalysisWorkspace = {
  mode: string;
  externalTransmission: boolean;
  analyses: Array<AnalysisDocument & { id: string; createdAt: string; stale: boolean }>;
  specifications: Array<{
    id: string;
    version: number;
    status: "draft" | "approved" | "rejected" | string;
    createdAt: string;
    stale: boolean;
    content: Specification;
  }>;
};

function ResultContent({ result }: { result: AnalysisResult }) {
  return (
    <div className="analysis-result">
      <h4>入力された事実・顧客要望</h4>
      <p className="muted">出典は案件の各入力欄です。情報の正しさや実現可能性は未検証です。</p>
      <dl className="info-list">
        {result.facts.map((fact) => (
          <div key={fact.field}>
            <dt>{fact.label}<small>案件入力</small></dt>
            <dd>{fact.value}</dd>
          </div>
        ))}
      </dl>

      <h4>不足情報・未確定事項</h4>
      {result.missingInformation.length ? (
        <ul>
          {result.missingInformation.map((item) => (
            <li key={item.field}><strong>{item.label}</strong>：{item.reason}</li>
          ))}
        </ul>
      ) : (
        <p>入力欄の不足は検出されませんでした。内容の確認は必要です。</p>
      )}

      <h4>顧客への確認事項（送信されません）</h4>
      {result.customerQuestions.length ? (
        <ol>
          {result.customerQuestions.map((item) => (
            <li key={item.field}>{item.question}</li>
          ))}
        </ol>
      ) : (
        <p>自動抽出された確認事項はありません。</p>
      )}

      <h4>推奨案（未採用・未承認）</h4>
      <ul>
        {result.recommendations.map((item, index) => (
          <li key={index}><strong>{item.title}</strong>：{item.rationale}</li>
        ))}
      </ul>

      <h4>制作上の注意</h4>
      <ul>{result.productionNotes.map((note, index) => <li key={index}>{note}</li>)}</ul>
    </div>
  );
}

function specStatusLabel(status: string) {
  if (status === "approved") return "承認済み";
  if (status === "rejected") return "差し戻し";
  return "下書き";
}

export function AnalysisPanel({
  workspace,
  busy,
  onAnalyze,
  onGenerate,
  onDecision
}: {
  workspace: AnalysisWorkspace;
  busy: boolean;
  onAnalyze: () => void;
  onGenerate: (id: string) => void;
  onDecision: (specId: string, decision: "approved" | "rejected", note: string) => void;
}) {
  const [analysisId, setAnalysisId] = useState("");
  const [specId, setSpecId] = useState("");
  const [decisionNote, setDecisionNote] = useState("");

  const latest = workspace.analyses[0];
  const analysis = workspace.analyses.find((item) => item.id === analysisId) ?? latest;
  const spec = workspace.specifications.find((item) => item.id === specId) ?? workspace.specifications[0];

  return (
    <section className="panel analysis-panel">
      <div className="panel-header">
        <div>
          <h3>案件分析 → 制作仕様書</h3>
          <p>ローカルスタブ・外部送信なし・API料金なし</p>
        </div>
        <span className="safe-badge">下書き生成</span>
      </div>

      <p>入力欄をもとに不足情報を整理します。依頼文の意味解析は行いません。不足内容は「案件を編集」で補完して再分析してください。</p>
      <p className="muted">顧客名・担当者・連絡先は分析対象外です。入力文内の一部の連絡先・秘密情報も除外します。自動除外は完全ではありませんが、外部には送信しません。</p>

      <div className="analysis-actions">
        <button
          className="primary-button"
          disabled={busy}
          onClick={() => { setAnalysisId(""); onAnalyze(); }}
        >
          {busy ? "処理中…" : latest ? "ローカルで再分析" : "ローカル分析を実行"}
        </button>
        <button
          className="secondary-button"
          disabled={busy || !latest || latest.stale}
          onClick={() => { if (latest) { setSpecId(""); onGenerate(latest.id); } }}
        >
          最新分析から仕様書の下書きを生成
        </button>
      </div>

      {latest?.stale && (
        <p role="status" className="notice error">
          案件が編集されています。仕様書生成の前に再分析してください。
        </p>
      )}

      {!analysis && (
        <p className="muted">まだ分析結果はありません。工程と承認状態は自動変更されません。</p>
      )}

      {analysis && (
        <div className="analysis-section">
          <label className="field">
            <span>分析履歴</span>
            <select value={analysis.id} onChange={(event) => setAnalysisId(event.target.value)}>
              {workspace.analyses.map((item) => (
                <option key={item.id} value={item.id}>
                  v{item.version} ・ {new Date(item.createdAt).toLocaleString("ja-JP")}
                  {item.stale ? " ・ 入力更新あり" : ""}
                </option>
              ))}
            </select>
          </label>
          <p className="muted">ローカル分析 v{analysis.version}{analysis.id !== latest?.id ? "（過去の分析）" : "（最新）"}</p>
          {analysis.stale && <p className="notice error">この分析は現在の案件内容と異なります。</p>}
          <ResultContent result={analysis.result} />
        </div>
      )}

      {spec && (
        <div className="analysis-section">
          <div className="section-row">
            <div>
              <h3>制作仕様書</h3>
              <p className="muted">承認した仕様書だけがローカルサイト生成に使えます。</p>
            </div>
            <span className={spec.status === "approved" ? "approval-ok" : spec.status === "rejected" ? "approval-rejected" : "approval-wait"}>
              {specStatusLabel(spec.status)}
            </span>
          </div>

          <label className="field">
            <span>仕様書履歴</span>
            <select value={spec.id} onChange={(event) => setSpecId(event.target.value)}>
              {workspace.specifications.map((item) => (
                <option key={item.id} value={item.id}>
                  v{item.version} ・ {specStatusLabel(item.status)} ・ {new Date(item.createdAt).toLocaleString("ja-JP")}
                </option>
              ))}
            </select>
          </label>

          <p>仕様書 v{spec.version} ／ 元の分析 v{spec.content.analysisVersion}</p>
          {spec.stale && (
            <p className="notice error">
              案件または分析が更新されています。最新分析から下書きを生成し直してください。
            </p>
          )}

          <ResultContent
            result={{
              schemaVersion: 1,
              facts: spec.content.facts,
              missingInformation: spec.content.unresolved,
              customerQuestions: spec.content.customerQuestions,
              recommendations: spec.content.proposedRecommendations,
              productionNotes: spec.content.productionNotes
            }}
          />

          <h4>禁止事項・承認条件</h4>
          <ul>{spec.content.restrictions.map((item) => <li key={item}>{item}</li>)}</ul>

          <div className="spec-approval-box">
            <label className="field">
              <span>承認メモ（任意）</span>
              <input
                value={decisionNote}
                onChange={(event) => setDecisionNote(event.target.value)}
                placeholder="確認内容や差し戻し理由"
              />
            </label>
            {spec.content.unresolved.length > 0 && (
              <p className="notice warning">
                未確定事項が {spec.content.unresolved.length} 件あります。承認前に案件情報を補完して再分析してください。
              </p>
            )}
            <div className="approval-actions-inline">
              <button
                className="secondary-button"
                disabled={busy || spec.stale}
                onClick={() => {
                  onDecision(spec.id, "rejected", decisionNote);
                  setDecisionNote("");
                }}
              >
                仕様書を差し戻す
              </button>
              <button
                className="primary-button"
                disabled={busy || spec.stale || spec.content.unresolved.length > 0}
                onClick={() => {
                  onDecision(spec.id, "approved", decisionNote);
                  setDecisionNote("");
                }}
              >
                仕様書を承認する
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
