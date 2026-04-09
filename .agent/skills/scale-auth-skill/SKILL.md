---
name: Scale Auth Skill
description: Regras e diretrizes para gerenciar autenticação (Sessões/Tokens) em ambientes com concorrência e múltiplos workers (PM2 / Uvicorn).
---

# Scale Auth Skill (Sessões e Multiprocessamento)

## ❌ O Problema (Anti-Pattern)

Ao escalar aplicações backend em Python (como FastAPI via Uvicorn ou PM2) para múltiplos processos paralelos (ex: `--workers 4`), **nunca utilize variáveis de memória global** para armazenar estados transitórios importantes, como tokens de autenticação ou sessões.

### Exemplo Incorreto:
```python
# NÃO FAÇA ISSO EM MÚLTIPLOS WORKERS
SESSIONS = {}

@app.post("/login")
def login():
    token = "xyz..."
    SESSIONS[token] = user.id  # Fica salvo apenas na memória RAM do Worker 1
    return response
```
Quando o usuário fizer uma requisição logo após o login, o balanceador de carga (ou o OS) poderá enviá-lo para o **Worker 2**, que não terá o `token` na sua variável local `SESSIONS`, resultando num erro silencioso de **401 Unauthorized** (loop infinito de "Loga e Desloga").

## ✅ A Solução (Best Practices & Rules)

Para escalar aplicações garantindo confiabilidade:

1. **Persistência Centralizada**: Toda a validação de token deve apontar para uma fonte de dados persistente e centralizada, compartilhada entre todos os processos e réplicas da aplicação. As fontes ideais são:
   - **Banco de Dados Relacional**: Criar uma coluna `session_token` no MySQL/PostgreSQL para cada usuário.
   - **Banco em Memória Multiprocesso**: Utilizar Redis para alta resiliência e tempo de vida de transações efêmeras.
   - **Stateless Tokens**: Mudar a arquitetura para JSON Web Tokens (JWT) devidamente assinados.

2. **Database First**: Na ausência de configuração Redis ou para fluxos monolíticos velozes, opte pela persistência direta no database (`session_token` na tabela `users`).

### Exemplo Correto:
```python
# FAÇA ISSO
def _get_session_user(request: Request, db: Session):
    token = request.cookies.get("session_token")
    if not token:
         return None
    # Todos os workers buscam a fonte universal (Banco de Dados)
    return db.query(User).filter(User.session_token == token).first()

@app.post("/login")
def login(db: Session = Depends(get_db)):
    token = secrets.token_hex(32)
    user.session_token = token
    db.commit() # Dispara imediatamente para o MySQL transacional
    return response
```

## 🛠️ Regras Automáticas 

Ao criar, refatorar ou auditar sistemas de autenticação, o agente/IA sempre deve:
- Validar se há configurações de `--workers > 1` no projeto.
- Impedir ou alertar imediatamente sobre o uso de dicionários puros (`dict()`, `{}`) definidos em escopo global que retenham estados de usuário vivos.
- Auditar transações via Websockets, que também sofrem de conexões presas a processos singulares e precisam de Pub/Sub caso escalados.
