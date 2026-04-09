# Arquitetura Object Detection System

Este documento centraliza as premissas arquiteturais deste projeto. Fornece como um modelo instrucional as convenções lidas pela IA (`Claude` / `Gemini`) responsáveis pelo roadmap técnico. 

## 1. Stack Tecnológico
- **Frontend (Client-side):**
  - **Framework:** React + TypeScript gerado pelo Vite.
  - **Estilização:** TailwindCSS (dark/light theme em conformidade).
  - **Gráficos:** Recharts com tooltips personalizados.
  - **State Management:** `zustand` (ex: `useCameraStore`).
  - **Build:** Transpilado no `/dist` via `npm run build`.

- **Proxy Reverso & Delivery:** 
  - Nginx conteinerizado em Alpine servindo a pasta `/dist` por HTTP e atuando de proxy (`proxy_pass http://localhost:8000`) para o backend e proxy WSS (`Upgrade $http_upgrade`).
  - Container do `ngrok` atuando em bridge para providenciar acesso web público em HTTPS, permitindo o engajamento da Webcam pelo usuário remoto (WebRTC necessita SSL/TLS).

- **Backend (API + Engine de Visão):**
  - **Framework Base:** FastAPI (Python 3.12, ambiente isolado `conda detection`).
  - **Orquestração e Workers:** Instanciado via PM2 (`ecosystem.config.cjs`) configurado com `--workers 4` para mitigar eventos I/O travantes baseando processamento assíncrono através do Uvicorn worker class. 
  - **Processamento Computacional (IA):**
    - `DeepFace` (Análises Emocionais).
    - `MediaPipe` (Landmarks para Sonolência).
    - `YOLO` custom weights (`yolov8n`) para objetos específicos (Celular, Arma, Cigarro).

- **Banco de Dados Relacional:**
  - **SGBD:** MySQL (Porta 3306), otimizando a latência contra transações e file locking se comparado ao arcaico SQLite.
  - **Driver:** `pymysql` implementado como string de conexão pelo SQLAlchemy (`models.py` / `database.py`) utilizando gerenciador de pooling seguro (pool size de 10).

## 2. Paradigmas e Diretrizes do Sistema
1. **Modelagem Otimizada em BD:** As instâncias de evento (`Detection`) são logadas de forma estrita, convertendo payloads robustos em metadados minimalistas limitados por colunas (`acknowledged BOOLEAN`, string `timestamp`).
2. **Distribuição Real-Time:** 
   1. Frontend consome WebSockets passivos ativamente pendurados na API que devolve atualizações rápidas codificadas por frames de tempo.
   2. Comunicações externas rodam paralelamente em threads não-bloqueantes (`threading.Thread`) enviando webhooks POST no padrão enterprise.
3. **Escalabilidade PM2:** A arquitetura nunca usa scripts em bloqueio central; o Uvicorn espalha o paralelismo dos 4 núcleos entre solicitações RESTful estáticas vs Inferências pesadas da câmera para não estrangular os painéis. 
4. **Fluxos de Alerta:**
   - Detecções pesadas/críticas (`armas`, `cigarros`) geram logs autônomos listados nos `/api/v1/reports`.
   - Modais visíveis garantem gestão humana operacional (Click and Reset). Efeitos baseados em alertas curtos são rodados localmente caso haja novidades alarmantes pelo WebSocket.

## 3. Comandos Centrais

### Migrações e DBs Seguros (Zero-Downtime)
Qualquer alteração na base `object_detection` precisa respeitar a Skill de Migração Segura(`.agent/skills/db-migration-skill/SKILL.md`) criando os esquemas preeminitivamente com RAW PyMySQL ou Alembic, evitando que a leitura concorrente do PM2 estoure código de erro `500`.

*Reiniciar backend (Carga de cache)*
```bash
pm2 restart obdet-backend --update-env
```

*Build da interface reactizada*
```bash
npm run build && podman restart obdet-nginx
```
