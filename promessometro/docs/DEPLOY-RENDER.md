# Publicando na Render

O Blueprint (`render.yaml`, na raiz do repositório) cria dois recursos:

| Recurso | Plano | Observação |
|---|---|---|
| Site `promessometro` | `free` | Dorme após 15 min sem acesso; a primeira visita depois disso demora. Trocar para `starter` no lançamento. |
| Banco `promessometro-db` (PostgreSQL 16) | `basic-256mb` (pago) | O banco gratuito da Render expira em 30 dias e apaga os dados; por isso não usamos. |

Confira os preços atuais em <https://render.com/pricing> antes de confirmar.

## 1. Criar site e banco

1. Na Render: **New > Blueprint**.
2. Conecte o GitHub e escolha o repositório `thianog/thianog`
   (e a branch onde o código está).
3. A Render lê o `render.yaml` e mostra os dois recursos. Revise os planos e
   clique em **Apply**.
4. No primeiro deploy o site aplica as migrações sozinho
   (`npm run db:migrar` antes de `npm start`).

Não há chave nem senha para configurar: o `DATABASE_URL` do site é ligado ao
banco automaticamente pela rede interna da Render.

## 2. Carregar os dados do TSE no banco

A coleta roda no GitHub Actions (gratuito), não na Render.

1. Na Render, abra o banco `promessometro-db` > **Connect** > copie a
   **External Database URL**.
2. No GitHub: repositório > **Settings > Secrets and variables > Actions >
   New repository secret**.
   - Nome: `PROMESSOMETRO_DATABASE_URL`
   - Valor: a URL copiada, com `?sslmode=require` no final.
3. Em **Actions**, escolha **Promessômetro — coleta TSE** > **Run workflow**.
   Leva poucos minutos; ao final, o manifesto da coleta fica disponível para
   download na própria execução.

Rodar de novo é seguro: nada é duplicado.

## 3. Conferir

- O site abre no endereço `https://promessometro-XXXX.onrender.com` mostrado
  pela Render.
- No banco (aba **Shell** ou qualquer cliente Postgres):
  `select cargo, count(*) from politico group by 1;` deve mostrar
  1 presidente e 27 governadores.

## Observações

- O workflow só aparece na aba Actions depois que o arquivo estiver na branch
  padrão do repositório (`main`).
- O banco aceita conexões externas protegidas por senha e SSL. Se quiser
  restringir, use **Access Control** no banco da Render; a coleta pelo GitHub
  Actions precisa de acesso externo.
