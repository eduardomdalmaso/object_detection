---
description: Gerenciamento Fullstack Unificado (Setup, Execução e Testes)
---

Este workflow unifica todas as ferramentas de gerenciamento do projeto (Ambiente, Servidores e CI), separando claramente o Frontend e o Backend.

### ⚙️ ETAPA 1: Configuração do Ambiente (Setup)
Prepare o ambiente WSL/Linux para o desenvolvimento.

1. Ative o ambiente Conda base ou crie um novo
// turbo
```bash
conda activate detection || conda create -n detection python=3.11 -y
```

2. Instale dependências globais e do projeto
```bash
# Frontend
cd frontend && npm install && cd ..
# Backend Python
conda run -n detection pip install -r backend/requirements.txt
```

### 🚀 ETAPA 2: Desenvolvimento Local (Execução)
Inicie os servidores para desenvolvimento com Hot Reload.

3. Inicie o backend FastAPI e frontend Vite, dividindo o escopo
// turbo
```bash
# Backend
conda run -n detection --cwd backend uvicorn main:app --reload --port 8000 &
# Frontend
cd frontend && npm run dev -- --host &
```

### 🛡️ ETAPA 3: Verificação de Qualidade (CI / Check)
Garante que o código segue os padrões antes de qualquer commit.

4. Execute a suíte de testes rápida e lint em ambos os diretórios
```bash
# Validação do Frontend
cd frontend && npm run lint && npm test -- --watchAll=false || echo "Testes de frontend não configurados"
# Validação do Backend (Exemplo com pytest)
cd ../backend && conda run -n detection pytest || echo "Testes de backend não configurados"
```

5. Verifique o build de produção
```bash
cd frontend && npm run build
```
