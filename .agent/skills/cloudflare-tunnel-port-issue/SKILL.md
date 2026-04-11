---
name: Cloudflare Tunnel Nginx Port Issue
description: Guia de resolução do erro 502 Bad Gateway no acesso externo do Nginx usando Cloudflare
---

# Correção do 502 Bad Gateway Cloudflare 

Caso encontre um erro "502 Bad Gateway" através da URL gerada pelo Cloudflare na interface, verifique o roteamento local do container de túnel.

## O Problema
Na inicialização padrão ensinada pelo Cloudflare, usa-se a porta `80`:
`tunnel --url http://127.0.0.1:80`

Para o projeto atual, o Frontend Nginx (`obdet-nginx`) roda com `--network host` respondendo na porta **`8082`**. O tráfego do túnel batendo na porta fechada causa o erro \`502 Unable to reach origin\`.

## A Solução
Remova o container mal instanciado e o reimplemente escutando na porta correta (`8082`):

```bash
// turbo
podman rm -f cloudflare-tunnel
podman run -d --name cloudflare-tunnel-cadastros --network host docker.io/cloudflare/cloudflared:latest tunnel --url http://127.0.0.1:8082
```
