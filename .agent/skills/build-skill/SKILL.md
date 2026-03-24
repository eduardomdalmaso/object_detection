---
name: Build & Chunk Optimization
description: Gera o /dist via `npm run build`, verifica erros de TypeScript/Vite e otimiza chunks automaticamente.
---

# Build & Chunk Optimization Skill

Sempre que for necessário gerar o build de produção do frontend, siga **exatamente** estes passos:

## 1. Executar o Build

```bash
cd /home/hades/projetos/object_detection
npm run build
```

O comando `npm run build` executa `tsc && vite build` conforme definido no `package.json`.

## 2. Analisar a Saída do Build

Após rodar o comando, analise a saída com atenção:

### Erros de TypeScript (`tsc`)
- Se houver erros `TS****`, corrija-os **antes** de continuar.
- Erros comuns:
  - **TS2307** (Module not found): Verifique imports e paths em `tsconfig.json`.
  - **TS2345** (Type mismatch): Corrija tipagens.
  - **TS6133** (Unused variable): Remova ou use a variável.
  - **TS18048** (Possibly undefined): Adicione optional chaining (`?.`) ou null check.

### Erros de Vite
- Se houver erros de resolução de módulo, verifique:
  - `vite.config.ts` (aliases, plugins)
  - `node_modules` (rode `npm install` se necessário)

## 3. Verificar Chunks Grandes

Após o build bem-sucedido, analise os tamanhos dos chunks na saída do Vite:

```
dist/assets/index-abc123.js   850.42 kB │ gzip: 250.10 kB
```

### Regras de Chunk
- ⚠️ **Warning** se qualquer chunk > 500 kB (gzip)
- 🔴 **Ação necessária** se qualquer chunk > 1 MB (gzip)

### Como Otimizar Chunks

Se os chunks estiverem grandes, aplique as seguintes estratégias em `vite.config.ts`:

#### a) Manual Chunks (Code Splitting)

```typescript
// vite.config.ts
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Separar vendor libs pesadas
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-charts': ['recharts'],
          'vendor-ui': ['framer-motion', 'lucide-react'],
          'vendor-i18n': ['i18next', 'react-i18next'],
          'vendor-state': ['zustand', 'axios'],
        },
      },
    },
  },
});
```

#### b) Lazy Loading de Páginas

Certifique-se que todas as páginas que não são críticas usam `React.lazy()`:

```typescript
const Reports = lazy(() => import('@/pages/Reports'));
const Cadastros = lazy(() => import('@/pages/Cadastros'));
```

#### c) Chunk Size Warning Limit

```typescript
// vite.config.ts
export default defineConfig({
  build: {
    chunkSizeWarningLimit: 600, // kB
  },
});
```

## 4. Verificar o Resultado Final

Após o build, confirme:

```bash
ls -lah /home/hades/projetos/object_detection/dist/
ls -lah /home/hades/projetos/object_detection/dist/assets/
```

Deve conter:
- `index.html` na raiz do `/dist`
- Arquivos `.js` e `.css` em `/dist/assets/`
- Nenhum arquivo vazio ou corrompido

## 5. Testar com Preview

```bash
npm run preview
```

Acessar `http://localhost:4173` e verificar se a aplicação carrega corretamente.

---

> [!IMPORTANT]
> **Esta skill deve ser executada sempre que houver mudanças significativas no frontend** (novos componentes, novas dependências, mudanças de rota) para garantir que o build de produção não está quebrado.
