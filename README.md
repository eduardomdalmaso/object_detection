# 🎯 Object Detection System

Sistema de detecção de objetos em tempo real com dashboard web, suporte a múltiplas câmeras (RTSP/RTMP/HTTP/Webcam) e notificações via webhook.

## 📋 Requisitos

- **Python 3.12+** (recomendado via Conda)
- **Node.js 18+** e **npm**
- **PM2** (`npm install -g pm2`)

## 🚀 Instalação

### 1. Clone e ambiente Python

```bash
git clone <repo-url>
cd object_detection

# Criar ambiente Conda
conda create -n detection python=3.12 -y
conda activate detection

# Instalar dependências Python
pip install -r backend/requirements.txt
```

### 2. Frontend

```bash
npm install
```

### 3. Iniciar com PM2

```bash
pm2 start ecosystem.config.cjs
```

| Serviço | Porta | Descrição |
|---------|-------|-----------|
| Backend | `8000` | FastAPI + Uvicorn |
| Frontend | `5173` | Vite Dev Server (proxy → 8000) |

Acesse: **http://localhost:5173**
Login padrão: `admin` / `admin`

## 🏗️ Arquitetura

```
object_detection/
├── backend/
│   ├── main.py          # FastAPI + pipelines de detecção
│   ├── models.py         # SQLAlchemy models (Camera, Detection, WebhookConfig)
│   ├── database.py       # SQLite config
│   └── app.db            # Banco de dados
├── src/                  # Frontend React + Vite + TypeScript
│   ├── pages/
│   │   ├── Dashboard.tsx
│   │   ├── Reports.tsx
│   │   ├── WebhookSettings.tsx
│   │   ├── ApiDocs.tsx
│   │   └── Cameras.tsx
│   └── components/
│       └── dashboard/
│           ├── PlatformGrid.tsx
│           ├── DetectionConfigModal.tsx
│           └── DashboardCharts.tsx
└── ecosystem.config.cjs  # PM2 config
```

## 📷 Modos de Detecção

Cada câmera suporta **múltiplas detecções simultâneas**:

| Modo | Chave | Descrição |
|------|-------|-----------|
| 😄 Emoções | `emotion` | Análise facial de emoções (DeepFace) |
| 😴 Sonolência | `sleeping` | Detecção de sonolência (MediaPipe) |
| 📱 Celular | `phone` | Uso de celular (YOLO) |
| 🚬 Cigarro | `cigarette` | Detecção de cigarro (YOLO) |
| 🎯 Arma de Fogo | `firearm` | Detecção de arma (YOLO) |

Configure via Dashboard → **Configurar Detecções** na câmera.

## 📷 Tipos de Câmera

| Tipo | URL de exemplo |
|------|---------------|
| RTSP | `rtsp://user:pass@192.168.1.100:554/stream` |
| RTMP | `rtmp://host/live/stream` |
| HTTP | `http://host/video.mjpeg` |
| ONVIF | `rtsp://...` (via descoberta ONVIF) |
| WEBCAM | `0` (índice do dispositivo local) |

## 🔔 Webhooks

O sistema envia notificações HTTP POST em tempo real para cada detecção registrada.

### Configuração

1. Acesse **http://localhost:5173/webhooks**
2. Clique em **Adicionar Webhook**
3. Preencha a URL de destino e (opcionalmente) um secret HMAC
4. Filtre por tipo de evento e/ou câmera
5. Use o botão **Testar** para validar

### Payload

Cada detecção envia um `POST` para a URL configurada:

```json
{
  "event": "detection",
  "timestamp": "2026-03-24T11:40:00Z",
  "camera_id": "cam1",
  "camera_name": "Câmera Entrada",
  "object_type": "celular",
  "confidence": 0.92
}
```

### Segurança (HMAC-SHA256)

Se um **secret** for configurado, o header `X-Webhook-Signature` será incluído:

```
X-Webhook-Signature: <hmac-sha256 do payload com o secret>
```

Verificação no receptor (exemplo Python):

```python
import hmac, hashlib

def verify_signature(payload: bytes, secret: str, received_sig: str) -> bool:
    expected = hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, received_sig)
```

### Retry

- **3 tentativas** com backoff exponencial (1s, 2s, 4s)
- Timeout de 5 segundos por tentativa
- Não bloqueia o pipeline de detecção (executa em thread separada)

### API REST

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| `GET` | `/api/v1/webhooks` | Lista webhooks |
| `POST` | `/api/v1/webhooks` | Cria webhook |
| `PUT` | `/api/v1/webhooks/{id}` | Atualiza webhook |
| `DELETE` | `/api/v1/webhooks/{id}` | Remove webhook |
| `POST` | `/api/v1/webhooks/{id}/test` | Envia evento de teste |

#### Exemplo: criar webhook via cURL

```bash
curl -X POST http://localhost:8000/api/v1/webhooks \
  -H "Content-Type: application/json" \
  -b "session_token=<token>" \
  -d '{
    "url": "https://exemplo.com/webhook",
    "secret": "minha-chave-secreta",
    "events": ["celular", "arma"],
    "cameras": ["all"],
    "active": true
  }'
```

## 📊 Relatórios

- **PDF**: Gerado no frontend via jsPDF (relatório formatado com título, metadados e tabela)
- **CSV**: Gerado no frontend com BOM UTF-8 (compatível com Excel)

Acesse via menu **Relatórios**.

## ⚙️ Comandos Úteis

```bash
# Status dos processos
pm2 status

# Reiniciar tudo
pm2 restart all --update-env

# Logs em tempo real
pm2 logs

# Build de produção
npm run build

# Parar tudo
pm2 stop all
```

## 📖 API Docs

Documentação completa dos endpoints disponível em **http://localhost:5173/api-docs**.
