import fs from "node:fs";
import path from "node:path";
import type { Specification } from "./analysis-types.js";
import type { QualityCheckItem, QualityResult, SiteManifest, SiteOverrides } from "./production-types.js";

type ProjectRecord = Record<string, unknown> & { id: string };

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function fact(spec: Specification, field: string) {
  return spec.facts.find((item) => item.field === field)?.value?.trim() ?? "";
}

function splitPages(value: string) {
  return value.split(/[\n、,，/／]+/).map((item) => item.trim()).filter(Boolean).slice(0, 12);
}

function filenameFor(label: string, index: number) {
  const normalized = label.toLowerCase();
  if (/^(top|home|ホーム|トップ)$/.test(normalized)) return "index.html";
  if (/会社|company|about/.test(normalized)) return "company.html";
  if (/サービス|service|事業/.test(normalized)) return "services.html";
  if (/お問い合わせ|問い合わせ|contact/.test(normalized)) return "contact.html";
  if (/採用|recruit|career/.test(normalized)) return "recruit.html";
  if (/faq|よくある|質問/.test(normalized)) return "faq.html";
  if (/news|お知らせ|新着/.test(normalized)) return "news.html";
  return `page-${index + 1}.html`;
}

function normalizePages(requiredPages: string) {
  const labels = splitPages(requiredPages);
  const source = labels.length ? labels : ["TOP"];
  const pages = source.map((label, index) => ({ label, file: filenameFor(label, index) }));
  if (!pages.some((page) => page.file === "index.html")) pages.unshift({ label: "TOP", file: "index.html" });
  const used = new Set<string>();
  return pages.map((page, index) => {
    let file = page.file;
    while (used.has(file)) file = `page-${index + 1}-${used.size + 1}.html`;
    used.add(file);
    return { ...page, file };
  });
}

function safeColor(value: string | undefined) {
  return value && /^#[0-9a-f]{6}$/i.test(value) ? value : "#314eea";
}

function pageHtml(args: {
  project: ProjectRecord;
  spec: Specification;
  manifest: SiteManifest;
  page: { label: string; file: string };
}) {
  const { project, spec, manifest, page } = args;
  const brand = String(project.client_name ?? "").trim() || String(project.project_name ?? "Web Site");
  const purpose = fact(spec, "purpose");
  const target = fact(spec, "target");
  const request = fact(spec, "request_details");
  const features = fact(spec, "required_features");
  const design = fact(spec, "design_preferences");
  const title = manifest.overrides.heroTitle || brand;
  const description = manifest.overrides.heroDescription || purpose || request;
  const cta = manifest.overrides.ctaLabel || "お問い合わせ";
  const primary = safeColor(manifest.overrides.primaryColor);
  const compact = manifest.overrides.compactHero === true;
  const contactPage = manifest.pages.find((item) => /contact|お問い合わせ|問い合わせ/.test(item.file + item.label));
  const ctaHref = contactPage ? contactPage.file : "#contact";
  const nav = manifest.pages.map((item) =>
    `<a href="${escapeHtml(item.file)}"${item.file === page.file ? ' aria-current="page"' : ""}>${escapeHtml(item.label)}</a>`
  ).join("");

  const mainContent = page.file === "index.html"
    ? `
      <section class="hero ${compact ? "compact" : ""}">
        <div class="container">
          <p class="eyebrow">LOCAL PREVIEW</p>
          <h1>${escapeHtml(title)}</h1>
          <p class="lead">${escapeHtml(description || "要確認")}</p>
          <a class="cta" href="${escapeHtml(ctaHref)}">${escapeHtml(cta)}</a>
        </div>
      </section>
      <section class="section"><div class="container">
        <h2>このサイトの目的</h2><p>${escapeHtml(purpose || "要確認")}</p>
      </div></section>
      <section class="section alt"><div class="container">
        <h2>対象</h2><p>${escapeHtml(target || "要確認")}</p>
      </div></section>
      <section class="section"><div class="container">
        <h2>ご要望</h2><p>${escapeHtml(request || "要確認")}</p>
      </div></section>
      <section class="section alt"><div class="container">
        <h2>必要機能</h2><p>${escapeHtml(features || "要確認")}</p>
        <p class="note">希望デザイン: ${escapeHtml(design || "要確認")}</p>
      </div></section>
      <section class="section" id="contact"><div class="container">
        <h2>お問い合わせ</h2>
        <p>連絡方法・送信先は案件情報を確認して実装してください。このプレビューから外部送信は行いません。</p>
      </div></section>`
    : `
      <section class="hero compact"><div class="container">
        <p class="eyebrow">${escapeHtml(brand)}</p><h1>${escapeHtml(page.label)}</h1>
        <p class="lead">このページの掲載内容は承認済み仕様書の範囲で制作してください。</p>
      </div></section>
      <section class="section"><div class="container">
        <h2>掲載内容</h2>
        <p>案件入力には「${escapeHtml(page.label)}」ページが必要と記録されています。具体的な本文が未入力の場合、内容は推測せず要確認として扱います。</p>
      </div></section>`;

  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(page.label)} | ${escapeHtml(brand)}</title>
  <meta name="description" content="${escapeHtml((purpose || request || brand).slice(0, 140))}">
  <style>
    :root{--primary:${primary};--ink:#182033;--muted:#68758d;--bg:#f5f7fb;--surface:#fff}
    *{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--ink);background:var(--bg);line-height:1.7}
    a{color:inherit}.container{width:min(1080px,calc(100% - 32px));margin:auto}
    header{position:sticky;top:0;background:rgba(255,255,255,.96);border-bottom:1px solid #e4e8ef;z-index:10}
    header .container{display:flex;align-items:center;justify-content:space-between;gap:24px;min-height:68px}
    .brand{font-weight:800;text-decoration:none}.nav{display:flex;gap:16px;flex-wrap:wrap}.nav a{text-decoration:none;color:var(--muted)}.nav a[aria-current=page]{color:var(--primary);font-weight:800}
    .hero{padding:96px 0 84px;background:linear-gradient(180deg,#fff,#f4f6ff)}.hero.compact{padding:56px 0 48px}
    .eyebrow{font-size:12px;font-weight:800;letter-spacing:.16em;color:var(--primary)}h1{font-size:clamp(36px,7vw,68px);line-height:1.1;margin:.2em 0}
    .lead{font-size:clamp(17px,2vw,22px);max-width:780px;color:var(--muted)}.cta{display:inline-block;margin-top:20px;background:var(--primary);color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:800}
    .section{padding:64px 0;background:var(--surface)}.section.alt{background:#f8f9fc}.section h2{font-size:clamp(24px,4vw,36px);margin:0 0 12px}.note{color:var(--muted)}
    footer{padding:28px 0;color:var(--muted);font-size:13px}
    @media(max-width:720px){header .container{align-items:flex-start;flex-direction:column;padding:14px 0}.nav{gap:10px}.hero{padding:56px 0}.section{padding:44px 0}}
  </style>
</head>
<body>
<header><div class="container"><a class="brand" href="index.html">${escapeHtml(brand)}</a>
<nav class="nav" aria-label="メインナビゲーション">${nav}</nav></div></header>
<main>${mainContent}</main>
<footer><div class="container">ローカル生成プレビュー / 外部公開なし</div></footer>
</body>
</html>`;
}

export function buildSite(args: {
  project: ProjectRecord;
  spec: Specification;
  specificationId: string;
  specificationVersion: number;
  buildVersion: number;
  outputDirectory: string;
  overrides?: SiteOverrides;
}) {
  const pages = normalizePages(fact(args.spec, "required_pages"));
  const manifest: SiteManifest = {
    schemaVersion: 1,
    specificationId: args.specificationId,
    specificationVersion: args.specificationVersion,
    projectId: args.project.id,
    buildVersion: args.buildVersion,
    pages,
    overrides: args.overrides ?? {}
  };
  fs.rmSync(args.outputDirectory, { recursive: true, force: true });
  fs.mkdirSync(args.outputDirectory, { recursive: true });
  for (const page of pages) {
    fs.writeFileSync(path.join(args.outputDirectory, page.file), pageHtml({
      project: args.project, spec: args.spec, manifest, page
    }), "utf8");
  }
  fs.writeFileSync(path.join(args.outputDirectory, "site-manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
  return manifest;
}

function check(status: QualityCheckItem["status"], id: string, label: string, detail: string): QualityCheckItem {
  return { id, label, status, detail };
}

export function inspectSite(buildId: string, outputDirectory: string, manifest: SiteManifest): QualityResult {
  const checks: QualityCheckItem[] = [];
  const files = new Set(fs.existsSync(outputDirectory) ? fs.readdirSync(outputDirectory) : []);
  const htmlFiles = manifest.pages.map((page) => page.file);
  checks.push(check(files.has("index.html") ? "pass" : "fail", "index", "トップページ",
    files.has("index.html") ? "index.htmlがあります。" : "index.htmlがありません。"));
  const missingPages = htmlFiles.filter((file) => !files.has(file));
  checks.push(check(missingPages.length ? "fail" : "pass", "pages", "必須ページ",
    missingPages.length ? `不足: ${missingPages.join(", ")}` : "仕様書由来のページが生成されています。"));

  const brokenLinks: string[] = [];
  const missingImages: string[] = [];
  const htmlProblems: string[] = [];
  let responsive = true, seo = true, accessibility = true;

  for (const file of htmlFiles.filter((name) => files.has(name))) {
    const html = fs.readFileSync(path.join(outputDirectory, file), "utf8");
    if (!/<html\s[^>]*lang="ja"/i.test(html) || !/<meta\s+name="viewport"/i.test(html)) htmlProblems.push(file);
    if (!/<title>[^<]+<\/title>/i.test(html) || !/<meta\s+name="description"\s+content="[^"]+"/i.test(html)) seo = false;
    if (!/<h1>[^<]+<\/h1>/i.test(html) || !/<nav[^>]*aria-label=/i.test(html)) accessibility = false;
    if (!/@media\s*\(/i.test(html)) responsive = false;
    for (const match of html.matchAll(/href="([^"#][^"]*)"/gi)) {
      const href = match[1];
      if (!href) continue;
      if (!/^(?:https?:|mailto:|tel:)/i.test(href) && !files.has(href)) brokenLinks.push(`${file} → ${href}`);
    }
    for (const match of html.matchAll(/<img[^>]+src="([^"]+)"/gi)) {
      const src = match[1];
      if (!src) continue;
      if (!/^(?:https?:|data:)/i.test(src) && !files.has(src)) missingImages.push(`${file} → ${src}`);
    }
  }

  checks.push(check(htmlProblems.length ? "fail" : "pass", "html", "HTML基本構造",
    htmlProblems.length ? `基本タグ不足: ${htmlProblems.join(", ")}` : "lang・viewportを確認しました。"));
  checks.push(check(brokenLinks.length ? "fail" : "pass", "links", "内部リンク",
    brokenLinks.length ? brokenLinks.join(" / ") : "リンク切れは検出されませんでした。"));
  checks.push(check(missingImages.length ? "fail" : "pass", "images", "画像参照",
    missingImages.length ? missingImages.join(" / ") : "欠損したローカル画像参照はありません。"));
  checks.push(check(responsive ? "pass" : "fail", "responsive", "レスポンシブ基礎",
    responsive ? "viewportとメディアクエリを確認しました。" : "レスポンシブ設定が不足しています。"));
  checks.push(check(seo ? "pass" : "warn", "seo", "SEO基本",
    seo ? "titleとdescriptionを確認しました。" : "titleまたはdescriptionの確認が必要です。"));
  checks.push(check(accessibility ? "pass" : "warn", "a11y", "アクセシビリティ基礎",
    accessibility ? "h1とナビゲーションラベルを確認しました。" : "見出しまたはナビゲーションラベルを確認してください。"));
  checks.push(check("warn", "browser", "ブラウザ実行確認",
    "静的ファイル検査では実ブラウザのconsoleエラーまでは確認できません。最終確認で目視してください。"));

  const overall = checks.some((item) => item.status === "fail") ? "fail"
    : checks.some((item) => item.status === "warn") ? "warn" : "pass";
  return { schemaVersion: 1, buildId, overall, checkedAt: new Date().toISOString(), checks };
}
