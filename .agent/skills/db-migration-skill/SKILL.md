---
name: Zero-Downtime Database Migration
description: Define o fluxo seguro para alterar schemas MySQL garantindo ausência de erros 500 decorrentes de timing durante deploy em ambiente PM2 (Backend FastAPI ativo)
---

# Fluxo de Segurança para Migração de Banco de Dados

## O Problema a ser Evitado (Erro de Timing)
Quando alteramos o banco de dados e o script do backend ao mesmo tempo, um "Erro de Timing" pode ocorrer. Isso acontece quando o PM2 lê e compila o código backend novo (que exige uma coluna específica) **antes** que o script de banco de dados tenha tempo de inserir a dita coluna. O resultado são consultas SQLAlchemy falhando e devolvendo *HTTP 500 Internal Server Error* no Frontend.

## Regras e Workflow Obrigado

**Para implementar qualquer alteração de Banco (MySQL/SQLite) onde haja `PM2` ativo:**

1. **Passo 1: Alteração do Schema PRIMEIRO**
   Toda injeção de SQL via `ALTER TABLE` ou SQLAlchemy Alembic deve ser feita antes de injetar e salvar o código novo do backend (`main.py` / `models.py`). 
   - Sempre certifique-se de usar o ambiente python correto (ex: `conda run -n detection python migration.py`) para evitar problemas de dependência (`ModuleNotFoundError`).

2. **Passo 2: Confirmação da Alteração**
   Verifique no banco de dados se a coluna realmente subiu:
   ```bash
   conda run -n detection python -c "import pymysql; conn=pymysql.connect(host='127.0.0.1', port=3306, user='obdet', password='obdet2024', database='object_detection'); c=conn.cursor(); c.execute('DESCRIBE detections;'); print([r[0] for r in c.fetchall()])"
   ```

3. **Passo 3: Escrita de Código**
   Agora aplique as mudanças com os mapeamentos ORM em `models.py` e crie as chaves lógicas na lógica do controller/`main.py`.

4. **Passo 4: Reinicialização Segura**
   Com a coluna existente validada e o script FastAPI devidamente modelado, você deve executar instantaneamente um Hot Reload.
   ```bash
   pm2 restart obdet-backend --update-env
   ```
   *Nota: O comando `pm2 restart` aplica imediatamente na memória. Se o build de interface React estiver em andamento, deixe em uma aba do terminal concorrente para nunca atrasar a inicialização do node central*

Siga **RIGOROSAMENTE** esta pipeline para mitigar falhas de indisponibilidade de tabela durante manutenção preventiva.
