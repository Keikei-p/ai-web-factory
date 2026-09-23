import { FormEvent, useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { cloudMode, requireSupabase, supabase, supabaseConfigured } from "./supabase";

export function AuthGate({
  children
}: {
  children: (args: { email: string; signOut: () => Promise<void> }) => ReactNode;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(cloudMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!cloudMode || !supabase) {
      setChecking(false);
      return;
    }

    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (sessionError) setError(sessionError.message);
      setSession(data.session);
      setChecking(false);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  if (!cloudMode) {
    return children({ email: "", signOut: async () => {} });
  }

  if (!supabaseConfigured) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <div className="brand-mark">AW</div>
          <p className="eyebrow">AI WEB FACTORY CLOUD</p>
          <h1>クラウド設定が必要です</h1>
          <p>SupabaseのURLとPublishable Keyを環境変数へ設定すると、ログイン式で利用できます。</p>
          <p className="muted">設定前はローカル版のデータや動作には影響しません。</p>
        </section>
      </main>
    );
  }

  if (checking) {
    return <main className="auth-shell"><section className="auth-card">ログイン状態を確認中...</section></main>;
  }

  if (session) {
    return children({
      email: session.user.email ?? "ログイン中",
      signOut: async () => {
        const client = requireSupabase();
        const { error: signOutError } = await client.auth.signOut();
        if (signOutError) throw signOutError;
      }
    });
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const client = requireSupabase();
      const { error: loginError } = await client.auth.signInWithPassword({
        email: email.trim(),
        password
      });
      if (loginError) throw loginError;
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "ログインできませんでした。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-shell">
      <form className="auth-card" onSubmit={submit}>
        <div className="brand-mark">AW</div>
        <p className="eyebrow">AI WEB FACTORY CLOUD</p>
        <h1>ログイン</h1>
        <p>PCとスマホで同じ案件を管理できます。</p>
        {error && <div className="notice error">{error}</div>}
        <label className="field">
          <span>メールアドレス</span>
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label className="field">
          <span>パスワード</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <button className="primary-button auth-submit" disabled={busy}>
          {busy ? "ログイン中..." : "ログイン"}
        </button>
        <p className="muted auth-note">
          新規ユーザー登録は画面から開放しません。最初のアカウントはSupabase側で作成します。
        </p>
      </form>
    </main>
  );
}
