"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Power, Send, Trash2 } from "lucide-react";
import { apiGetScoped, apiPostScoped, apiPut, apiDelete, apiPost } from "@/lib/api";
import { useCurrentApp } from "@/lib/app-context";
import { SectionCard } from "@/components/section-card";
import { Modal } from "@/components/ui/modal";
import { FormField } from "@/components/ui/form-field";
import { Tips } from "@/components/ui/tips";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Pagination } from "@/components/ui/pagination";
import { useShowApiError } from "@/lib/show-api-error";

interface Template {
  id: string;
  name: string;
  slug: string;
  channel: string;
  subject: string | null;
  body: string;
  isActive: boolean;
  triggerEvent: string | null;
  webhookUrl: string | null;
  variables: unknown;
  createdAt: string;
}

interface LogEntry {
  id: string;
  channel: string;
  status: string;
  recipient: string;
  subject: string | null;
  body: string;
  sentAt: string | null;
  createdAt: string;
  template?: { name: string } | null;
}

const channels = [
  { value: "email", label: "邮件" },
  { value: "wecom", label: "企业微信" },
  { value: "webhook", label: "Webhook" },
  { value: "in_app", label: "应用内" },
];

const triggerEvents = [
  { value: "", label: "手动（无自动触发）" },
  { value: "manual", label: "手动" },
  { value: "order_paid", label: "订单已支付" },
  { value: "order_refunded", label: "订单已退款" },
  { value: "user_registered", label: "新用户注册" },
  { value: "verification_code", label: "邮箱验证码（注册）" },
  { value: "credits_low", label: "积分不足" },
  { value: "credits_granted", label: "积分已发放" },
];

const emptyForm = {
  name: "",
  slug: "",
  channel: "email",
  subject: "",
  body: "",
  triggerEvent: "",
  webhookUrl: "",
};

type Tab = "templates" | "logs";

const logChannelLabel: Record<string, string> = {
  email: "邮件",
  wecom: "企业微信",
  webhook: "Webhook",
  in_app: "应用内",
};

const logStatusLabel: Record<string, string> = {
  sent: "已发送",
  failed: "失败",
  pending: "待发送",
  queued: "排队中",
};

export default function NotificationsPage() {
  const app = useCurrentApp();
  const [tab, setTab] = useState<Tab>("templates");

  const [templates, setTemplates] = useState<Template[]>([]);
  const [tplTotal, setTplTotal] = useState(0);
  const [tplPage, setTplPage] = useState(1);

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logTotal, setLogTotal] = useState(0);
  const [logPage, setLogPage] = useState(1);

  const showApiError = useShowApiError();

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTpl, setEditingTpl] = useState<Template | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Template | null>(null);

  const [testModal, setTestModal] = useState(false);
  const [testTpl, setTestTpl] = useState<Template | null>(null);
  const [testResult, setTestResult] = useState("");

  const [limit, setLimit] = useState(10);

  const loadTemplates = useCallback(async () => {
    try {
      const res = await apiGetScoped<{ data: Template[]; total: number }>(
        `/notifications/templates?page=${tplPage}&limit=${limit}`, app.id
      );
      setTemplates(res.data ?? []);
      setTplTotal(res.total);
    } catch (err) {
      showApiError(err);
    }
  }, [app.id, tplPage, limit, showApiError]);

  const loadLogs = useCallback(async () => {
    try {
      const res = await apiGetScoped<{ data: LogEntry[]; total: number }>(
        `/notifications/logs?page=${logPage}&limit=${limit}`, app.id
      );
      setLogs(res.data ?? []);
      setLogTotal(res.total);
    } catch (err) {
      showApiError(err);
    }
  }, [app.id, logPage, limit, showApiError]);

  useEffect(() => {
    if (tab === "templates") loadTemplates();
    else loadLogs();
  }, [tab, loadTemplates, loadLogs]);

  function openCreate() {
    setEditingTpl(null);
    setForm(emptyForm);
    setEditorOpen(true);
  }

  function openEdit(t: Template) {
    setEditingTpl(t);
    setForm({
      name: t.name,
      slug: t.slug,
      channel: t.channel,
      subject: t.subject ?? "",
      body: t.body,
      triggerEvent: t.triggerEvent ?? "",
      webhookUrl: t.webhookUrl ?? "",
    });
    setEditorOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: form.name,
        channel: form.channel,
        subject: form.subject || undefined,
        body: form.body,
        triggerEvent: form.triggerEvent || undefined,
        webhookUrl: form.webhookUrl || undefined,
      };
      if (editingTpl) {
        await apiPut(`/notifications/templates/${editingTpl.id}`, body);
      } else {
        await apiPostScoped("/notifications/templates", { ...body, slug: form.slug }, app.id);
      }
      setEditorOpen(false);
      await loadTemplates();
    } catch (err) {
      showApiError(err);
    } finally {
      setSaving(false);
    }
  }

  async function toggleTemplate(t: Template) {
    try {
      await apiPut(`/notifications/templates/${t.id}`, { isActive: !t.isActive });
      await loadTemplates();
    } catch (err) {
      showApiError(err);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await apiDelete(`/notifications/templates/${deleteTarget.id}`);
      setDeleteTarget(null);
      await loadTemplates();
    } catch (err) {
      showApiError(err);
    }
  }

  async function sendTest() {
    if (!testTpl) return;
    setSaving(true);
    setTestResult("");
    try {
      const result = await apiPost<{ sent: number; status?: string }>("/notifications/broadcast", {
        appId: app.id,
        templateId: testTpl.id,
        channel: testTpl.channel,
        body: testTpl.body,
        subject: testTpl.subject,
        webhookUrl: testTpl.webhookUrl,
      });
      setTestResult(`已发送：${result.sent}，状态：${result.status ?? "sent"}`);
    } catch (err) {
      showApiError(err);
    } finally {
      setSaving(false);
    }
  }

  const showWebhookUrl = form.channel === "wecom" || form.channel === "webhook";
  const showSubject = form.channel === "email";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">通知</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            管理「{app.name}」的通知模板与发送记录。
          </p>
          <Tips className="mt-2">
            <strong className="text-foreground">注册验证码邮件</strong>：模板请使用 Channel=Email、Slug=
            <code className="rounded bg-muted px-1">register_email_verification</code>
            ，正文占位符{" "}
            <code className="rounded bg-muted px-1">{"{{code}} {{email}} {{appName}} {{expiryMinutes}}"}</code>
            。发信 SMTP 在「集成」页配置，全站共用（表 global_integration_setting，name=smtp；非环境变量）；本页不再提供 Integrations 表单入口。
          </Tips>
        </div>
      </div>

      <div className="flex gap-2">
        {(["templates", "logs"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              tab === t ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "templates" ? "模板" : "发送记录"}
          </button>
        ))}
      </div>

      {tab === "templates" ? (
        <SectionCard title="模板" description={`共 ${tplTotal} 个`}>
          <div className="mb-4 flex justify-end">
            <button type="button" className="btn btn-primary btn-sm gap-2" onClick={openCreate}>
              <Plus className="h-3.5 w-3.5" /> 新建模板
            </button>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>名称</th>
                  <th>渠道</th>
                  <th>触发</th>
                  <th>启用</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {templates.length === 0 ? (
                  <tr><td colSpan={5} className="text-center text-muted-foreground">暂无模板</td></tr>
                ) : templates.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <div className="font-medium">{t.name}</div>
                      <div className="text-xs text-muted-foreground">{t.slug}</div>
                    </td>
                    <td>
                      <span className={`badge ${t.channel === "wecom" ? "badge-success" : ""}`}>
                        {channels.find((c) => c.value === t.channel)?.label ?? t.channel}
                      </span>
                    </td>
                    <td>
                      {t.triggerEvent ? (
                        <span className="badge">{triggerEvents.find((e) => e.value === t.triggerEvent)?.label ?? t.triggerEvent}</span>
                      ) : <span className="text-muted-foreground">-</span>}
                    </td>
                    <td>
                      <span className={`badge ${t.isActive ? "badge-success" : "badge-warn"}`}>
                        {t.isActive ? "是" : "否"}
                      </span>
                    </td>
                    <td>
                      <div className="flex gap-1">
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => openEdit(t)}><Pencil className="h-3.5 w-3.5" /></button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => toggleTemplate(t)}><Power className="h-3.5 w-3.5" /></button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setTestTpl(t); setTestModal(true); setTestResult(""); }}><Send className="h-3.5 w-3.5" /></button>
                        <button type="button" className="btn btn-ghost btn-sm text-red-400" onClick={() => setDeleteTarget(t)}><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={tplPage}
            limit={limit}
            total={tplTotal}
            onChange={setTplPage}
            onLimitChange={(n) => {
              setLimit(n);
              setTplPage(1);
              setLogPage(1);
            }}
          />
        </SectionCard>
      ) : (
        <SectionCard title="发送记录" description={`共 ${logTotal} 条`}>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>收件人</th><th>渠道</th><th>主题</th><th>状态</th><th>模板</th><th>发送时间</th></tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr><td colSpan={6} className="text-center text-muted-foreground">暂无记录</td></tr>
                ) : logs.map((l) => (
                  <tr key={l.id}>
                    <td className="max-w-[200px] truncate">{l.recipient}</td>
                    <td><span className="badge">{logChannelLabel[l.channel] ?? l.channel}</span></td>
                    <td>{l.subject ?? "-"}</td>
                    <td><span className={`badge ${l.status === "sent" ? "badge-success" : l.status === "failed" ? "badge-error" : ""}`}>{logStatusLabel[l.status] ?? l.status}</span></td>
                    <td>{l.template?.name ?? "-"}</td>
                    <td className="text-xs text-muted-foreground">{l.sentAt ? new Date(l.sentAt).toLocaleString() : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={logPage}
            limit={limit}
            total={logTotal}
            onChange={setLogPage}
            onLimitChange={(n) => {
              setLimit(n);
              setTplPage(1);
              setLogPage(1);
            }}
          />
        </SectionCard>
      )}

      {/* Template Editor Modal */}
      <Modal open={editorOpen} onClose={() => setEditorOpen(false)} title={editingTpl ? `编辑：${editingTpl.name}` : "新建模板"} wide>
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Left: Form */}
          <div className="space-y-4">
            <FormField label="名称">
              <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="欢迎通知" />
            </FormField>
            {!editingTpl ? (
              <FormField label="标识" hint="唯一标识">
                <input className="input" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="welcome" />
              </FormField>
            ) : null}
            <div className="grid grid-cols-2 gap-4">
              <FormField label="渠道">
                <select className="input" value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })}>
                  {channels.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </FormField>
              <FormField label="触发事件">
                <select className="input" value={form.triggerEvent} onChange={(e) => setForm({ ...form, triggerEvent: e.target.value })}>
                  {triggerEvents.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
                </select>
              </FormField>
            </div>
            {showWebhookUrl ? (
              <FormField label="Webhook URL" hint={form.channel === "wecom" ? "企业微信群机器人 Webhook" : "目标 Webhook 地址"}>
                <input className="input" value={form.webhookUrl} onChange={(e) => setForm({ ...form, webhookUrl: e.target.value })} placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=..." />
              </FormField>
            ) : null}
            {showSubject ? (
              <FormField label="主题">
                <input className="input" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="邮件主题" />
              </FormField>
            ) : null}
            <FormField
              label="正文"
              hint="占位符：{{userName}}、{{appName}}、{{amount}}；注册验证码模板使用 {{code}}、{{email}}、{{appName}}、{{expiryMinutes}}"
            >
              <textarea className="input" rows={6} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder="您好 {{userName}}，订单已确认。" />
            </FormField>
          </div>

          {/* Right: Preview */}
          <div>
            <h3 className="mb-3 text-sm font-semibold text-muted-foreground">预览</h3>
            <div className="rounded-xl border border-border bg-muted/30 p-4">
              {form.channel === "wecom" ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="rounded bg-green-600/20 px-1.5 py-0.5 text-green-400">WeCom Bot</span>
                    群消息
                  </div>
                  <div className="rounded-lg bg-[#2c2c2c] p-3 text-sm">
                    {form.subject ? <div className="mb-2 font-bold text-green-400">### {form.subject}</div> : null}
                    <div className="whitespace-pre-wrap text-zinc-300">{form.body || "消息内容…"}</div>
                  </div>
                </div>
              ) : form.channel === "email" ? (
                <div className="space-y-2">
                  <div className="rounded-t-lg border border-border bg-card/80 px-4 py-2 text-xs">
                    <div><span className="text-muted-foreground">收件人：</span> user@example.com</div>
                    <div><span className="text-muted-foreground">主题：</span> {form.subject || "（无主题）"}</div>
                  </div>
                  <div className="rounded-b-lg border border-t-0 border-border bg-white/5 p-4 text-sm">
                    <div className="whitespace-pre-wrap">{form.body || "邮件正文…"}</div>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground">
                    {form.channel === "webhook" ? "Webhook 负载" : "应用内通知"}
                  </div>
                  <pre className="overflow-auto rounded-lg bg-black/30 p-3 text-xs text-zinc-400">
                    {JSON.stringify({ channel: form.channel, subject: form.subject, body: form.body }, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditorOpen(false)}>取消</button>
          <button type="button" className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving || !form.name || !form.body}>
            {saving ? "保存中…" : editingTpl ? "更新" : "创建"}
          </button>
        </div>
      </Modal>

      {/* Send Test Modal */}
      <Modal open={testModal} onClose={() => setTestModal(false)} title={`测试发送 — ${testTpl?.name ?? ""}`}>
        <p className="mb-4 text-sm text-muted-foreground">
          使用此模板发送测试通知，目标为
          {testTpl?.channel === "wecom" || testTpl?.channel === "webhook" ? "已配置的 Webhook" : "全部活跃用户"}
          。
        </p>
        {testResult ? (
          <div className="card mb-4 p-3 text-sm text-green-400">
            {testResult}
          </div>
        ) : null}
        <div className="flex justify-end gap-3">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setTestModal(false)}>关闭</button>
          <button type="button" className="btn btn-primary btn-sm gap-2" onClick={sendTest} disabled={saving}>
            <Send className="h-3.5 w-3.5" /> {saving ? "发送中…" : "发送测试"}
          </button>
        </div>
      </Modal>

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="删除模板"
        message={`确定删除「${deleteTarget?.name}」？相关发送记录也将被移除。`}
        confirmLabel="删除"
        danger
      />
    </div>
  );
}
