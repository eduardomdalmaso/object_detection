---
name: Fullstack Security Checklist
description: Avalia a resiliência de segurança para React e Python/FastAPI
---

# Fluxo Rápido de Verificação de Vulnerabilidades

Use as etapas abaixo para auditar rapidamente a segurança do projeto.

## 1. Auditoria Frontend (React)

### Dependências npm
Rode auditorias leves a moderadas. As ferramentas do Ecossistema React muitas vezes reportam alertas falsos; foque nos níveis altos (`high` ou `critical`).
```bash
cd frontend && npm audit --audit-level=high
```

### Checagem de Código Anti-Padrão
Verifica se `dangerouslySetInnerHTML` está sendo utilizado sem cuidado (retorne 1 caso encontre):
```bash
grep -rn "dangerouslySetInnerHTML" src/ || echo "👍 Nenhum uso direto de innerHTML encontrado"
```

## 2. Auditoria Backend (Python)

### CVE Checks via pip-audit
É essencial que o ambiente de `conda` seja o alvo das verificações.
```bash
conda run -n detection pip install pip-audit bandit -q
conda run -n detection pip-audit -r backend/requirements.txt
```

### Análise de Segurança Estática Sistêmica
Usa o `bandit` direcionado ao diretório `backend` ignorando severidades baixas (apenas erros críticos estruturais como senhas default ou evals dinâmicos).
```bash
conda run -n detection bandit -r backend/ -ll
```

> **Ação Recomendada em caso de falha**: Reporte a biblioteca desatualizada e abra procedimento para subida de versão no `requirements.txt` ou submetimento de PR.
