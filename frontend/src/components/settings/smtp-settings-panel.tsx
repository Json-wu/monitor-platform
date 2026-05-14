"use client";

import { useCallback, useEffect, useState } from "react";
import { Mail } from "lucide-react";
import { apiGet, apiPatch } from "@/lib/api";
import { SectionCard } from "@/components/section-card";
import { FormField } from "@/components/ui/form-field";

type SmtpSettings = {
  enabled: boolean;
  host: string;
  port: number;
  user: string;
  from: string;
  passSet: boolean;
  tlsRejectUnauthorized: boolean;
};

type SmtpSettingsPanelProps = {
  appId: string;
  variant?: "page" | "dialog";
  onSaved?: () => void;
};

export function SmtpSettingsPanel({
  appId,
  variant = "page",
  onSaved,
}: SmtpSettingsPanelProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const [enabled, setEnabled] = useState(true);
  const [host, setHost] = useState("");
  const [port, setPort] = useState(587);
  const [user, setUser] = useState("");
  const [from, setFrom] = useState("");
  const [passNew, setPassNew] = useState("");
  const [passSet, setPassSet] = useState(false);
  const [tlsRejectUnauthorized, setTlsRejectUnauthorized] = useState(true);

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const s = await apiGet<SmtpSettings>(`/apps/${appId}/smtp-settings`);
      setEnabled(s.enabled !== false);
      setHost(s.host || "");
      setPort(typeof s.port === "number" && s.port > 0 ? s.port : 587);
      setUser(s.user || "");
      setFrom(s.from || "");
      setPassSet(s.passSet);
      setTlsRejectUnauthorized(s.tlsRejectUnauthorized !== false);
      setPassNew("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [appId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const body: Record<string, unknown> = {
        enabled,
        host: host.trim(),
        port: Number(port) || 587,
        user: user.trim(),
        from: from.trim(),
        tlsRejectUnauthorized,
      };
      if (passNew.trim() !== "") {
        body.pass = passNew.trim();
      }
      await apiPatch(`/apps/${appId}/smtp-settings`, body);
      setPassNew("");
      setSaved(true);
      await load();
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="text-sm text-muted-foreground">加载中…</div>;
  }

  return (
    <div className="space-y-6">
      {variant === "page" ? (
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">发信 SMTP</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            全站共用一套发信配置，用于验证码、通知等；凭据仅存服务端。
          </p>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}
      {saved ? (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          已保存。
        </div>
      ) : null}

      <SectionCard
        title="SMTP 服务器"
        description="与常见邮件服务商（SendGrid、企业邮箱等）配置一致。"
      >
        <form onSubmit={handleSave} className="max-w-xl space-y-4">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="rounded border-border"
            />
            启用 SMTP 发信
          </label>
          <FormField label="主机" hint="如 smtp.example.com">
            <input
              className="input w-full font-mono text-xs"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              autoComplete="off"
            />
          </FormField>
          <FormField label="端口" hint="常用 587（STARTTLS）或 465（SSL）">
            <input
              className="input w-full max-w-[120px] font-mono text-xs"
              type="number"
              min={1}
              max={65535}
              value={port}
              onChange={(e) => setPort(Number(e.target.value))}
            />
          </FormField>
          <FormField label="用户名">
            <input
              className="input w-full font-mono text-xs"
              value={user}
              onChange={(e) => setUser(e.target.value)}
              autoComplete="off"
            />
          </FormField>
          <FormField
            label="密码"
            hint={
              passSet
                ? "已保存密码。填写新值将覆盖；留空则不改。"
                : "发信认证密码。"
            }
          >
            <input
              className="input w-full font-mono text-xs"
              type="password"
              value={passNew}
              onChange={(e) => setPassNew(e.target.value)}
              autoComplete="new-password"
              placeholder={passSet ? "（留空则保持原密码）" : ""}
            />
          </FormField>
          <FormField label="发件人（From）" hint="可空，默认使用用户名；支持 Name &lt;addr@&gt; 格式">
            <input
              className="input w-full text-xs"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              autoComplete="off"
            />
          </FormField>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={tlsRejectUnauthorized}
              onChange={(e) => setTlsRejectUnauthorized(e.target.checked)}
              className="rounded border-border"
            />
            TLS 校验服务端证书
          </label>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "保存中…" : "保存"}
          </button>
        </form>
      </SectionCard>

      {variant === "page" ? (
        <SectionCard title="说明" description="通知模板、验证码邮件均依赖此处配置。">
          <div className="flex items-start gap-2 text-sm text-muted-foreground">
            <Mail className="mt-0.5 h-4 w-4 shrink-0" />
            <p>关闭「启用 SMTP」后，生产环境发信将失败；开发环境可能仅打日志。</p>
          </div>
        </SectionCard>
      ) : null}
    </div>
  );
}
