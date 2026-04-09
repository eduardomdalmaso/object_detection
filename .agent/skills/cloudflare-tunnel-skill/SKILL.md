---
name: Cloudflare Tunnel Helper
description: Ajuda com o proxy TLS, incluindo como recuperar a URL que muda após reinícios e lidar com o cloudflare-tunnel-cadastros
---

# k-Monitor Security OMS - Acesso Cloudflare Tunnel

Este projeto utiliza um proxy TLS temporário com o Cloudflare Tunnel para testes/desenvolvimento.

**Lembretes Importantes:**
- ⚠️ A URL muda toda vez que o túnel reinicia.
- ⚠️ Para produção, recomenda-se comprar um domínio próprio e usar um túnel nomeado configurado corretamente no Cloudflare em vez da URL temporária do `trycloudflare.com`.

## Comandos Úteis

### 1. Obter a URL atual
Depois de rodar/reiniciar o túnel, você pode descobrir a URL atual rodando o seguinte comando:

```bash
// turbo
podman logs cloudflare-tunnel-cadastros 2>&1 | grep -oP 'https://[a-z-]+\.trycloudflare\.com'
```
*(O terminal mostrará na tela a nova URL)*

### 2. Reiniciar o túnel
Se for necessário gerar uma nova URL ou caso esteja travado:

```bash
// turbo
podman restart cloudflare-tunnel-cadastros
```

### 3. Verificar o status do container
Verifica se o container está em execução:

```bash
// turbo
podman ps | grep cloudflare-tunnel-cadastros
```

## Como usar na aplicação
Se a URL do túnel for atualizada, certifique-se de registrar/atualizar os endpoints nas configurações de Integração, Webhook e/ou URLs de Frontend conforme a necessidade do sistema.
