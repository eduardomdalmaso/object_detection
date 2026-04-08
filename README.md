# 🎯 Object Detection System

Sistema de detecção de objetos em tempo real com dashboard web, suporte a múltiplas câmeras (RTSP/RTMP/HTTP/Webcam) e notificações via webhook. Otimizado para alta concorrência utilizando arquitetura de micro-workers e banco de dados relacional.

## 📋 Requisitos

- **Linux** (Testado em Ubuntu/Debian)
- **Python 3.12+** (recomendado via Conda)
- **Node.js 18+** e **npm**
- **PM2** (`npm install -g pm2`)
- **Podman/Docker** (para Nginx e MySQL)
- **MySQL 8.0+** (Recomendado via container)

## 🚀 Instalação e Execução

### 1. Clone e ambiente Python

```bash
git clone <repo-url>
cd object_detection

# Criar e ativar ambiente Conda
conda create -n detection python=3.12 -y
conda activate detection

# Instalar dependências Python
pip install -r backend/requirements.txt
pip install pymysql cryptography
```

### 2. Banco de Dados (MySQL)

O sistema requer um banco de dados MySQL para suportar alto paralelismo. Com o banco rodando (por exemplo, via container), configure as seguintes variáveis de ambiente no sistema ou no `ecosystem.config.cjs`:

- `DB_HOST`: Host do MySQL (ex: 127.0.0.1)
- `DB_PORT`: Porta (ex: 3306)
- `DB_USER`: Usuário (ex: obdet)
- `DB_PASS`: Senha
- `DB_NAME`: Nome do banco (ex: object_detection)

### 3. Frontend (Build de Produção)

```bash
npm install
npm run build
```

### 4. Nginx (Servidor Web)

O frontend é servido via Nginx, que também atua como proxy reverso para o backend.

```bash
podman run -d --name obdet-nginx --network host \
  -v $(pwd)/dist:/usr/share/nginx/html:ro \
  -v $(pwd)/nginx-podman/nginx.conf:/etc/nginx/nginx.conf:ro \
  nginx:alpine
```

### 5. Iniciar Backend com PM2

```bash
pm2 start ecosystem.config.cjs
```
O backend rodará usando Uvicorn com **4 workers**, garantindo que as requisições web nunca bloqueiem as análises de vídeo.

### 🌐 Acessando

- **Local/IP**: `http://<SEU-IP>:8082`
- **Nota sobre Webcams**: O acesso remoto a webcams exige **HTTPS**. Recomenda-se utilizar o [Ngrok](https://ngrok.com/) (`podman run -d --name obdet-ngrok --net=host -e NGROK_AUTHTOKEN=<TOKEN> ngrok/ngrok http 8082`) ou configurar um certificado SSL reverso.

**Login padrão:** `admin` / `admin`

## 🏗️ Arquitetura

```
object_detection/
├── backend/
│   ├── main.py          # FastAPI + pipelines de detecção
│   ├── models.py        # SQLAlchemy models com MySQL VARCHAR restrictions
│   └── database.py      # Pool de conexão MySQL (PyMySQL)
├── src/                 # Frontend React + Vite + TypeScript
│   ├── pages/
│   │   ├── Dashboard.tsx
│   │   ├── Reports.tsx
│   │   ├── WebhookSettings.tsx
│   │   ├── ApiDocs.tsx
│   │   └── Cameras.tsx
│   └── components/
├── nginx-podman/        # Configurações do Nginx
│   └── nginx.conf
└── ecosystem.config.cjs # Configuração do PM2 (4 workers, timeout otimizado)
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
| WEBCAM | `0` (índice local ou via WebSocket do Browser) |

## 🔔 Webhooks

O sistema envia notificações HTTP **POST** contendo um payload JSON em tempo real para cada detecção registrada.

### Configuração

1. Acesse `http://<SEU-HOST>:8082/webhooks`
2. Clique em **Adicionar Webhook**
3. Preencha a URL de destino e (opcionalmente) um secret HMAC
4. Filtre por tipo de evento e/ou câmera
5. Use o botão **Testar** para validar a comunicação (`POST` instantâneo na URL cadastrada)

### Payload (JSON POST)

Cada detecção envia um `POST` para a URL configurada nos padrões:

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
`X-Webhook-Signature: <hmac-sha256 do payload com o secret>`

### Retry

- **3 tentativas** com backoff exponencial (1s, 2s, 4s)
- Timeout de 5 segundos por tentativa
- Não bloqueia o pipeline de detecção (executa com paralelismo)

## 📊 Relatórios

- **PDF**: Gerado no frontend via jsPDF (relatório formatado com título, metadados e tabela)
- **CSV**: Gerado no frontend com BOM UTF-8 (compatível com Excel)

## ⚙️ Comandos Úteis

```bash
# Reiniciar backend e limpar cache
pm2 restart obdet-backend --update-env

# Ver logs de backend em tempo real
pm2 logs obdet-backend

# Reiniciar o Nginx (Frontend)
podman restart obdet-nginx

# Recompilar a interface React
npm run build
```

## 📖 API Docs

Documentação interativa e completa dos endpoints está disponível diretamente na plataforma, pela rota lateral **API Docs**.
