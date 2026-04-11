# Resolução de Problema: 502 Bad Gateway via Cloudflare Tunnel

## O Incidente
Ao tentar acessar a URL pública temporária (gerada pelo podman `cloudflare-tunnel` / `cloudflare-tunnel-cadastros`), a aplicação respondia com a tela nativa do Cloudflare informando:
`502 Bad Gateway - Unable to reach the origin service. The service may be down or it may not be responding to traffic from cloudflared`

## Causa Raiz
O erro reside no parâmetro `--url` providenciado ao container do Cloudflared. O container tentava redirecionar todos os acessos externos para `http://127.0.0.1:80` (A porta HTTP padrão).
No entanto, dentro da topologia deste repositório, o serviço frontend servido pelo proxy Nginx (`obdet-nginx`) foi configurado no `nginx.conf` com a flag `listen 8082;`, rodando diretamente sobre a rede nativa da máquina local (`--network host`).
Sendo assim, não havendo escuta na porta 80, o Cloudflare perdia a conexão com o ambiente local.

## Como foi corrigido

1. Identificados os parâmetros incorretos do container anterior do tunel (que escutava na 80).
2. O container prévio foi deletado com `podman rm -f cloudflare-tunnel`.
3. Um novo container foi nomeado seguindo a convenção requerida (`cloudflare-tunnel-cadastros`) e atrelado forçosamente com `http://127.0.0.1:8082`:
   ```bash
   podman run -d --name cloudflare-tunnel-cadastros --network host \
          docker.io/cloudflare/cloudflared:latest tunnel \
          --url http://127.0.0.1:8082
   ```

A partir dessa alteração, o Cloudflare refaz o DNS relay permitindo ao ambiente local (Nginx 8082 -> Backend PM2 8005) responder com sucesso às navegações remotas sem perder a origem.
