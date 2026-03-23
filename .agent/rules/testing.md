# Regras de Teste (Github Actions Style)

Sempre realize testes como se estivessem rodando em um CI.

## Regras de Execução
- **Antes de qualquer commit/push**: Rode a suíte de testes completa do componente alterado.
- **Isolamento**: Garanta que os testes não dependam de estado externo persistente (use transações de banco de dados ou mocks).
- **Padronização**:
  - React: `npm test` ou `vitest`
  - Python: `pytest`

## Verificação de Lint
- Execute ferramentas de lint (ESLint, Ruff/Flake8, Pylint) antes de dar a tarefa como concluída.
- Falhas de lint devem ser tratadas como falhas de teste.

## Simulação de CI
- Ao validar uma tarefa, descreva os passos de verificação de forma clara, similar a um log do Github Actions.
