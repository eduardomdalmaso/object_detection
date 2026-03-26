import { useState } from 'react';
import { Code, Terminal, Copy, CheckCircle2, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';

const endpoints = [
  {
    method: 'POST',
    path: '/api/auth/login',
    category: 'Autenticação',
    description: 'Autentica o usuário e retorna cookie de sessão.',
    body: `{ "username": "admin", "password": "admin" }`,
    response: `{ "user": { "id": 1, "name": "Admin", "role": "admin" } }`,
  },
  {
    method: 'GET',
    path: '/api/auth/me',
    category: 'Autenticação',
    description: 'Retorna o usuário autenticado (requer cookie de sessão).',
    response: `{ "user": { "id": 1, "name": "Admin", "role": "admin" } }`,
  },
  {
    method: 'GET',
    path: '/api/v1/cameras',
    category: 'Câmeras',
    description: 'Lista todas as câmeras cadastradas com seus modos de detecção.',
    response: `{
  "platforms": [
    {
      "id": "cam1",
      "name": "Câmera Entrada",
      "url": "rtsp://...",
      "camera_type": "RTSP",
      "status": "online",
      "detection_modes": ["emotion", "phone"]
    }
  ],
  "total": 1
}`,
  },
  {
    method: 'POST',
    path: '/api/v1/add_camera',
    category: 'Câmeras',
    description: 'Cadastra nova câmera (requer admin).',
    body: `{
  "platform": "cam1",
  "name": "Câmera Entrada",
  "url": "rtsp://admin:pass@host/stream",
  "camera_type": "RTSP"
}`,
    response: `{ "message": "Camera created", "id": "cam1" }`,
  },
  {
    method: 'POST',
    path: '/api/v1/set_modes',
    category: 'Detecções',
    description: 'Define quais detecções estarão ativas em uma câmera (multi-select).',
    body: `{
  "camera_id": "cam1",
  "modes": ["emotion", "phone", "cigarette"]
}`,
    response: `{ "status": "success", "camera_id": "cam1", "modes": ["emotion", "phone", "cigarette"] }`,
  },
  {
    method: 'GET',
    path: '/video_feed?plat={camera_id}',
    category: 'Streaming',
    description: 'Stream MJPEG da câmera com detecções visuais em tempo real.',
  },
  {
    method: 'GET',
    path: '/api/v1/stats/{camera_id}',
    category: 'Estatísticas',
    description: 'Retorna estatísticas de detecção em tempo real da câmera.',
    response: `{
  "camera_id": "cam1",
  "detection_mode": "emotion",
  "total_detections": 42,
  "fps": 15.2,
  "uptime_seconds": 3600
}`,
  },
  {
    method: 'GET',
    path: '/api/v1/reports',
    category: 'Relatórios',
    description: 'Lista detecções registradas com filtros opcionais.',
    body: `Query params: ?camera=cam1&object=emocoes&start=2026-01-01&end=2026-03-24`,
    response: `{
  "data": [
    {
      "id": 1,
      "timestamp": "2026-03-24 10:30:00",
      "camera_id": "cam1",
      "camera_name": "Câmera Entrada",
      "object_type": "emocoes",
      "confidence": 92.5
    }
  ],
  "total": 1
}`,
  },
  {
    method: 'GET',
    path: '/api/v1/charts/{chart_key}',
    category: 'Gráficos',
    description: 'Dados para gráficos do dashboard (chart_key: all-day, all-week, etc).',
    response: `{
  "labels": ["08:00", "09:00", "10:00"],
  "series": {
    "emocoes": [5, 8, 3],
    "celular": [2, 1, 4]
  }
}`,
  },
  {
    method: 'WEBHOOK',
    path: 'GET /sua-url-configurada?event=detection&timestamp=2026-03-24T11:40:00Z...',
    category: 'Webhooks',
    description: 'Os eventos são enviados via GET usando query parameters. Configurado na aba Webhooks.',
    body: `?event=detection
&timestamp=2026-03-24T11:40:00Z
&camera_id=cam1
&camera_name=C\u00e2mera+Entrada
&object_type=celular
&confidence=0.92`,
  },
];

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400',
  POST: 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400',
  PUT: 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400',
  DELETE: 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-400',
  WEBHOOK: 'bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-400',
};

export default function ApiDocs() {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const copyToClipboard = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 1500);
  };

  const categories = [...new Set(endpoints.map((e) => e.category))];

  return (
    <div className="space-y-6 pb-12 max-w-5xl mx-auto">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Documentação da API
        </h1>
        <p className="text-muted-foreground">
          Referência completa dos endpoints do Object Detection System
        </p>
      </div>

      {/* Overview */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="rounded-lg bg-indigo-100 dark:bg-indigo-900/30 p-2 text-indigo-600 dark:text-indigo-400">
            <Terminal className="h-5 w-5" />
          </div>
          <h3 className="font-semibold text-foreground">Consumo REST (Axios)</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          A API usa autenticação por cookie de sessão. Todas as requisições devem incluir <code className="text-xs bg-secondary px-1 py-0.5 rounded">withCredentials: true</code>.
        </p>
        <div className="bg-slate-900 rounded-lg p-4 font-mono text-xs text-blue-300 overflow-x-auto">
          <span className="text-slate-500">// Configuração Axios</span><br />
          {`const api = axios.create({`}<br />
          {`  baseURL: 'http://localhost:8000',`}<br />
          {`  withCredentials: true,`}<br />
          {`  headers: { 'Content-Type': 'application/json' }`}<br />
          {`});`}
        </div>
        <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-900/30">
          <p className="text-xs text-blue-700 dark:text-blue-400">
            <span className="font-bold">Nota:</span> Faça login em <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">POST /api/auth/login</code> antes de acessar rotas protegidas.
          </p>
        </div>
      </div>

      {/* Endpoints by category */}
      {categories.map((cat) => (
        <div key={cat} className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-green-100 dark:bg-green-900/30 p-2 text-green-600 dark:text-green-400">
              <Code className="h-5 w-5" />
            </div>
            <h3 className="font-semibold text-foreground text-lg">{cat}</h3>
          </div>

          {endpoints
            .filter((e) => e.category === cat)
            .map((ep) => {
              const globalIdx = endpoints.indexOf(ep);
              return (
                <div
                  key={globalIdx}
                  className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-3"
                >
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          'px-2 py-0.5 rounded text-xs font-bold font-mono',
                          METHOD_COLORS[ep.method] || 'bg-gray-100 text-gray-600',
                        )}
                      >
                        {ep.method}
                      </span>
                      <code className="text-sm font-mono text-foreground">{ep.path}</code>
                      <button
                        onClick={() => copyToClipboard(ep.path, globalIdx)}
                        className="p-1 hover:bg-muted rounded transition-colors text-muted-foreground"
                        title="Copiar endpoint"
                      >
                        {copiedIdx === globalIdx ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">{ep.description}</p>

                  {ep.body && (
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        {ep.method === 'GET' ? 'Parâmetros' : 'Corpo da Requisição'}
                      </span>
                      <pre className="mt-1 bg-slate-900 text-emerald-300 p-3 rounded-lg text-[11px] font-mono overflow-x-auto">
                        {ep.body}
                      </pre>
                    </div>
                  )}

                  {ep.response && (
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        Resposta
                      </span>
                      <pre className="mt-1 bg-secondary/50 dark:bg-slate-800/50 p-3 rounded-lg border border-border text-[11px] font-mono text-foreground overflow-x-auto">
                        {ep.response}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      ))}

      {/* Deployment */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-card p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="rounded-lg bg-slate-200 dark:bg-slate-800 p-2 text-slate-600 dark:text-slate-400">
            <Layers className="h-5 w-5" />
          </div>
          <h3 className="font-semibold text-foreground">Deploy & Produção</h3>
        </div>
        <div className="space-y-3 text-sm text-muted-foreground">
          <p>O sistema usa PM2 para gerenciar os processos:</p>
          <div className="bg-slate-900 rounded-lg p-3 font-mono text-xs text-green-300">
            pm2 start ecosystem.config.cjs<br />
            pm2 restart all --update-env
          </div>
          <ul className="list-disc list-inside space-y-1 ml-2 text-xs">
            <li><strong>Backend:</strong> FastAPI + Uvicorn na porta 8000</li>
            <li><strong>Frontend:</strong> Vite Dev Server na porta 5173 (proxy → 8000)</li>
            <li><strong>Banco:</strong> SQLite em <code className="bg-secondary px-1 rounded">backend/app.db</code></li>
          </ul>
          <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-100 dark:border-amber-800">
            <p className="text-xs text-amber-700 dark:text-amber-400">
              <strong>Modos de detecção:</strong> emotion, sleeping, phone, cigarette, handsup
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
