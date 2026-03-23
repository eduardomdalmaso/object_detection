# Regras de Segurança (Vulnerability Testing)

Este documento define os requisitos de segurança e práticas de auditoria contínua esperadas para o ambiente Fullstack deste repositório.

## 1. Segurança em React (Frontend)
- **Vulnerabilidades de XSS**: Proibido o uso de `dangerouslySetInnerHTML` sem sanitização estrita (ex. usando `dompurify`).
- **Exposição de Segredos**: Nunca colocar chaves de API sensíveis, senhas ou tokens que não sejam chaves públicas no `.env` do frontend (ex. variáveis com prefixo `VITE_`).
- **Dependencies**: Toda nova dependência adicionada via `npm` deve passar por `npm audit` para evitar pacotes maliciosos ou vulneráveis conhecidos.

## 2. Segurança em FastAPI/Python (Backend)
- **Injeção de Códigos e SQLi**: Todos os inputs expostos via rede devem ser estritamente tipados e validados usando `Pydantic`. Queries diretas sem ORM/parâmetros tipificados são estritamente proíbidas.
- **Autenticação**: Rotas privadas dependem obrigatoriamente de middlewares ou `Depends` validando tokens de sessão fortes.
- **Auditoria de Ambientes**: Requer uso regular do `pip-audit` para checar Common Vulnerabilities and Exposures (CVE) nas dependências (ver `security-skill`).
- **Análise Estática**: O código Python não deve ser submetido contendo quebras detectadas pelo `bandit`.

## 3. Segurança Base/Infra
- **CORS**: O frontend do Vite (localhost:5173/IP de rede local) não deve ser proxy aberto para outros domínios não fidedignos. O FastAPI em produção não deve permitir rotas CORS generalizadas (`*`) nas rotas sensíveis.
