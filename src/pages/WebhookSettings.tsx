import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bell, Plus, Trash2, TestTube, Loader2, Power, PowerOff,
  CheckCircle2, XCircle, Pencil, X, Save
} from 'lucide-react';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import { useCameraStore } from '@/store/useCameraStore';

const EVENT_OPTIONS = [
  { key: 'all',        label: 'Todos os Eventos' },
  { key: 'emocoes',    label: 'Emoções' },
  { key: 'sonolencia', label: 'Sonolência' },
  { key: 'celular',    label: 'Celular' },
  { key: 'cigarro',    label: 'Cigarro' },
  { key: 'arma',       label: 'Arma de Fogo' },
];

interface Webhook {
  id: number;
  url: string;
  secret: string;
  events: string[];
  cameras: string[];
  active: boolean;
  created_at: string | null;
}

const EMPTY_FORM = { url: '', secret: '', events: ['all'], cameras: ['all'], active: true };

export default function WebhookSettings() {
  useTranslation();
  const cameras = useCameraStore((s: any) => s.cameras);
  const fetchCameras = useCameraStore((s: any) => s.fetchCameras);

  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [testResults, setTestResults] = useState<Record<number, { status: string; code?: number } | null>>({});

  const fetchWebhooks = async () => {
    setIsLoading(true);
    try {
      const res = await api.get('/api/v1/webhooks');
      setWebhooks(res.data.data || []);
    } catch (e) {
      console.error('Failed to fetch webhooks:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchWebhooks();
    if (!cameras.length) fetchCameras().catch(() => {});
  }, []);

  const openCreateModal = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setShowModal(true);
  };

  const openEditModal = (wh: Webhook) => {
    setEditingId(wh.id);
    setForm({
      url: wh.url,
      secret: '',
      events: wh.events || ['all'],
      cameras: wh.cameras || ['all'],
      active: wh.active,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.url.trim()) return;
    setIsSaving(true);
    try {
      if (editingId) {
        await api.put(`/api/v1/webhooks/${editingId}`, form);
      } else {
        await api.post('/api/v1/webhooks', form);
      }
      setShowModal(false);
      fetchWebhooks();
    } catch (e) {
      alert('Erro ao salvar webhook.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Deseja remover este webhook?')) return;
    try {
      await api.delete(`/api/v1/webhooks/${id}`);
      fetchWebhooks();
    } catch (e) {
      alert('Erro ao remover webhook.');
    }
  };

  const handleTest = async (id: number) => {
    setTestResults((prev) => ({ ...prev, [id]: null }));
    try {
      const res = await api.post(`/api/v1/webhooks/${id}/test`);
      setTestResults((prev) => ({
        ...prev,
        [id]: { status: res.data.status, code: res.data.response_code },
      }));
    } catch (e) {
      setTestResults((prev) => ({ ...prev, [id]: { status: 'error' } }));
    }
    setTimeout(() => setTestResults((prev) => ({ ...prev, [id]: null })), 5000);
  };

  const handleToggle = async (wh: Webhook) => {
    try {
      await api.put(`/api/v1/webhooks/${wh.id}`, {
        url: wh.url,
        secret: '***',
        events: wh.events,
        cameras: wh.cameras,
        active: !wh.active,
      });
      fetchWebhooks();
    } catch (e) {
      alert('Erro ao alterar status.');
    }
  };

  const toggleEvent = (key: string) => {
    setForm((prev) => {
      if (key === 'all') return { ...prev, events: ['all'] };
      let next = prev.events.filter((e) => e !== 'all');
      if (next.includes(key)) {
        next = next.filter((e) => e !== key);
      } else {
        next.push(key);
      }
      return { ...prev, events: next.length ? next : ['all'] };
    });
  };

  const toggleCamera = (camId: string) => {
    setForm((prev) => {
      if (camId === 'all') return { ...prev, cameras: ['all'] };
      let next = prev.cameras.filter((c) => c !== 'all');
      if (next.includes(camId)) {
        next = next.filter((c) => c !== camId);
      } else {
        next.push(camId);
      }
      return { ...prev, cameras: next.length ? next : ['all'] };
    });
  };

  return (
    <div className="space-y-6 pb-12 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <Bell className="h-8 w-8 text-blue-600" />
            Webhooks
          </h1>
          <p className="text-muted-foreground mt-1">
            Receba notificações de detecções em tempo real via HTTP POST
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-lg transition-all"
        >
          <Plus className="h-4 w-4" />
          Adicionar Webhook
        </button>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center p-12">
            <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />
          </div>
        ) : webhooks.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-muted-foreground">
            <Bell className="h-12 w-12 mb-3 opacity-30" />
            <p className="font-medium">Nenhum webhook configurado</p>
            <p className="text-sm">Clique em "Adicionar Webhook" para começar.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800 border-b border-border">
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">URL</th>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Eventos</th>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Câmeras</th>
                  <th className="px-4 py-3 text-center font-semibold text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-center font-semibold text-muted-foreground">Ações</th>
                </tr>
              </thead>
              <tbody>
                {webhooks.map((wh) => {
                  const tr = testResults[wh.id];
                  return (
                    <tr key={wh.id} className="border-b border-border hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="px-4 py-3">
                        <code className="text-xs bg-secondary px-2 py-1 rounded font-mono break-all">
                          {wh.url.length > 60 ? wh.url.slice(0, 60) + '…' : wh.url}
                        </code>
                        {wh.secret && (
                          <span className="ml-2 text-[10px] bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-1.5 py-0.5 rounded font-medium">
                            HMAC
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1 flex-wrap">
                          {(wh.events || ['all']).map((e) => (
                            <span key={e} className="text-[10px] bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-1.5 py-0.5 rounded font-medium">
                              {EVENT_OPTIONS.find((o) => o.key === e)?.label || e}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1 flex-wrap">
                          {(wh.cameras || ['all']).map((c) => (
                            <span key={c} className="text-[10px] bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded font-medium">
                              {c === 'all' ? 'Todas' : (cameras.find((cam: any) => cam.id === c)?.name || c)}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => handleToggle(wh)}
                          className={cn(
                            'inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold transition-colors',
                            wh.active
                              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-200'
                              : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 hover:bg-red-200',
                          )}
                        >
                          {wh.active ? <Power className="h-3 w-3" /> : <PowerOff className="h-3 w-3" />}
                          {wh.active ? 'Ativo' : 'Inativo'}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleTest(wh.id)}
                            className="p-1.5 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-600 transition-colors"
                            title="Testar"
                          >
                            {tr ? (
                              tr.status === 'sent' && tr.code && tr.code < 400 ? (
                                <CheckCircle2 className="h-4 w-4 text-green-500" />
                              ) : (
                                <XCircle className="h-4 w-4 text-red-500" />
                              )
                            ) : (
                              <TestTube className="h-4 w-4" />
                            )}
                          </button>
                          <button
                            onClick={() => openEditModal(wh)}
                            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 transition-colors"
                            title="Editar"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(wh.id)}
                            className="p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 transition-colors"
                            title="Remover"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-lg rounded-2xl bg-card dark:bg-slate-900 shadow-2xl overflow-hidden">
            <div className="bg-slate-900 dark:bg-slate-950 px-6 py-4 flex items-center justify-between text-white">
              <h2 className="text-lg font-bold">
                {editingId ? 'Editar Webhook' : 'Novo Webhook'}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-white/10 rounded-full">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* URL */}
              <div>
                <label className="block text-xs font-bold text-muted-foreground uppercase mb-1">URL de Destino *</label>
                <input
                  type="url"
                  value={form.url}
                  onChange={(e) => setForm((p) => ({ ...p, url: e.target.value }))}
                  placeholder="https://exemplo.com/webhook"
                  className="w-full px-3 py-2.5 rounded-lg border border-border bg-secondary text-foreground text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Secret */}
              <div>
                <label className="block text-xs font-bold text-muted-foreground uppercase mb-1">
                  Secret (HMAC-SHA256) <span className="font-normal text-[10px]">— opcional</span>
                </label>
                <input
                  type="password"
                  value={form.secret}
                  onChange={(e) => setForm((p) => ({ ...p, secret: e.target.value }))}
                  placeholder={editingId ? '••• manter atual' : 'Chave secreta'}
                  className="w-full px-3 py-2.5 rounded-lg border border-border bg-secondary text-foreground text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Events filter */}
              <div>
                <label className="block text-xs font-bold text-muted-foreground uppercase mb-2">Filtrar Eventos</label>
                <div className="flex flex-wrap gap-2">
                  {EVENT_OPTIONS.map((opt) => (
                    <button
                      key={opt.key}
                      onClick={() => toggleEvent(opt.key)}
                      className={cn(
                        'px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
                        form.events.includes(opt.key)
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-secondary border-border text-muted-foreground hover:border-blue-400',
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Camera filter */}
              <div>
                <label className="block text-xs font-bold text-muted-foreground uppercase mb-2">Filtrar Câmeras</label>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => toggleCamera('all')}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
                      form.cameras.includes('all')
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-secondary border-border text-muted-foreground hover:border-blue-400',
                    )}
                  >
                    Todas
                  </button>
                  {cameras.map((c: any) => (
                    <button
                      key={c.id}
                      onClick={() => toggleCamera(String(c.id))}
                      className={cn(
                        'px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
                        form.cameras.includes(String(c.id))
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-secondary border-border text-muted-foreground hover:border-blue-400',
                      )}
                    >
                      {c.name || c.id}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="bg-slate-50 dark:bg-slate-800 px-6 py-4 flex items-center justify-end gap-3 border-t border-border">
              <button
                onClick={() => setShowModal(false)}
                className="px-5 py-2 rounded-xl font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving || !form.url.trim()}
                className="flex items-center gap-2 px-6 py-2 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-all shadow-lg"
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {editingId ? 'Atualizar' : 'Criar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
