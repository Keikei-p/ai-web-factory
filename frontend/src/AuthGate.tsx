import { FormEvent, useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { User } from "firebase/auth";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { auth, cloudMode, firebaseConfigured, requireFirebase } from "./firebase";

export function AuthGate({
  children
}: {
  children: (args: { email: string; signOut: () => Promise<void> }) => ReactNode;
}) {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(cloudMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!cloudMode || !auth) {
      setChecking(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(
      auth,
      (nextUser) => {
        setUser(nextUser);
        setChecking(false);
      },
      (authError) => {
        setError(authError.message);
        setChecking(false);
      }
    );

    return unsubscribe;
  }, []);

  if (!cloudMode) {
    return children({ email: "", signOut: async () => {} });
  }

  if (!firebaseConfigured) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <div className="brand-mark">AW</div>
          <p className="eyebrow">AI WEB FACTORY CLOUD</p>
          <h1>Firebase設定が必要です</h1>
          <p>Firebase Web Appの設定値を環境変数へ登録すると、ログイン式で利用できます。</p>
          <p className="muted">設定前でも従来のローカル版には影響しません。</p>
        </section>
      </main>
    );
  }

  if (checking) {
    return <main className="auth-shell"><section className="auth-card">ログイン状態を確認中...</section></main>;
  }

  if (user) {
    return children({
      email: user.email ?? "ログイン中",
      signOut: async () => {
        const { auth: firebaseAuth } = requireFirebase();
        await signOut(firebaseAuth);
      }
    });
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      const { auth: firebaseAuth } = requireFirebase();
      await signInWithEmailAndPassword(firebaseAuth, email.trim(), password);
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
            minLength={6}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>

        <button className="primary-button auth-submit" disabled={busy}>
          {busy ? "ログイン中..." : "ログイン"}
        </button>

        <p className="muted auth-note">
          最初のユーザーはFirebase Authentication側で作成します。画面からの自由な新規登録は開放しません。
        </p>
      </form>
    </main>
  );
}
