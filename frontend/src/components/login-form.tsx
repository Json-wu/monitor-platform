"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { loginAdmin } from "@/lib/api";
import { getToken, setToken } from "@/lib/auth";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  /** 仅挂载时：有有效会话再进控制台；勿依赖 router，避免与无效 token 的跳转打架 */
  useEffect(() => {
    if (getToken()) {
      router.replace("/dashboard");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const result = await loginAdmin(email, password);
      setToken(result.access_token);
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="card w-full max-w-md p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">人工智能工具包管理后台</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          登录以管理应用、用户、积分、定价与审计日志。
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="mb-2 block text-sm text-muted-foreground">邮箱</label>
          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="username"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm text-muted-foreground">密码</label>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </div>
      </div>

      {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}

      <button className="btn btn-primary mt-6 w-full" disabled={submitting} type="submit">
        {submitting ? "登录中…" : "登录"}
      </button>
    </form>
  );
}
