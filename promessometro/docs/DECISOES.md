# Registro de decisões

Decisões de projeto, em ordem cronológica. Cada entrada diz o que foi decidido,
por quê, e o que fica em aberto. Decisões novas entram no fim; decisões
revistas ganham uma nova entrada que aponta para a anterior.

---

## D1 — App numa pasta `promessometro/` do repositório atual (2026-11-15)

**Decisão:** o código vive em `promessometro/` dentro do repositório
`thianog/thianog`.

**Por quê:** era o repositório disponível na sessão. A pasta isolada permite
mover o projeto para um repositório próprio (ex.: `promessometro`) mantendo o
histórico, com `git subtree split --prefix=promessometro`.

**Em aberto:** criar o repositório definitivo antes do lançamento.

## D2 — Stack conforme o briefing (2026-11-15)

Next.js (App Router) + TypeScript, PostgreSQL compatível com Supabase, Claude
API para extração, GitHub Actions para jobs, hospedagem na Vercel.

## D3 — Migrações em SQL puro, sem ORM (2026-11-15)

**Decisão:** o esquema fica em `db/migrations/*.sql`, aplicado por
`npm run db:migrar` (runner próprio, tabela `_migracoes`). Acesso ao banco via
biblioteca `postgres` com SQL escrito à mão.

**Por quê:** as regras mais importantes do projeto (fonte obrigatória, revisão
humana, histórico imutável) são garantidas por constraints e triggers do
banco, que um ORM esconderia. SQL puro roda igual no Postgres local, no CI e
no Supabase.

## D4 — Princípios garantidos no banco, não só no app (2026-11-15)

| Princípio | Como o banco garante |
|---|---|
| Fonte obrigatória | `documento` exige URL http(s) e hash SHA-256; promessa exige documento; promessa de plano de governo exige página |
| Evidência em toda mudança de status | atualização só é aprovada com ≥ 1 `evidencia` (link + data + fonte) — trigger adiável, verificado no commit |
| Revisão humana | tudo nasce `pendente`; aprovar exige `revisor_id` e data; status só é aprovado para promessa aprovada |
| Histórico visível | atualização aprovada e suas evidências não podem ser editadas nem apagadas; correção = nova atualização |
| Publicação | o site lê só as visões `promessa_publica`, `historico_status_publico`, `placar_politico`, que filtram o aprovado |

Tudo isso tem teste em `tests/db/modelo.test.ts`.

## D5 — Promessa aprovada sem atualização = "Não iniciada" (2026-11-15)

**Decisão:** quando uma promessa aprovada ainda não tem atualização de status
aprovada, ela aparece como **Não iniciada**.

**Por quê:** é a definição do briefing ("nenhuma ação oficial identificada")
e é o estado inicial, não uma mudança de status. Por isso não exige evidência.
A página de metodologia deve deixar claro que "não iniciada" significa "não
encontramos ação oficial", e não "o político não fez nada".

## D6 — Status atual = atualização aprovada com a data de referência mais recente (2026-11-15)

Ordenação por `data_referencia` (data do fato) e, em empate, por `aprovado_em`.
Assim, aprovar hoje uma evidência antiga não sobrescreve um fato mais recente.

## D7 — Acesso público com RLS no padrão Supabase (2026-11-15)

Papel `anon` lê político, documento e somente promessas/atualizações/evidências
aprovadas; pode **inserir** contestação (apenas colunas de conteúdo, sempre como
`recebida`) mas não lê contestações. A migração cria os papéis `anon` e
`authenticated` quando não existem, para testar as mesmas regras fora do
Supabase. A escrita de conteúdo é feita pelo backend com a conexão de serviço.

## D8 — Revisores numa tabela própria (2026-11-15)

**Decisão:** tabela `revisor` (nome, e-mail). O login do painel (etapa 3) será
ligado a ela pelo e-mail.

**Em aberto:** escolher entre Supabase Auth e outro provedor na etapa 3.

## D9 — Temas como tabela de referência (2026-11-15)

Lista inicial de 16 temas (inclui `outros`). Tabela em vez de enum para poder
ajustar a lista sem migração de tipo. Mudanças na lista são decisões
metodológicas e devem ser registradas aqui.

## D10 — Cargos começam em presidente, governador e prefeito (2026-11-15)

Cobre as fases 1 e 2 do roteiro. Outros cargos (fase 3) entram com
`alter type cargo add value`.

---

## Pendências conhecidas

- **Rede do ambiente de desenvolvimento:** os servidores do TSE
  (`dadosabertos.tse.jus.br`, `cdn.tse.jus.br`, `divulgacandcontas.tse.jus.br`)
  estão bloqueados no ambiente atual. A etapa 2 (coleta) precisa desses hosts
  liberados para ser escrita e testada contra os arquivos reais.
- Trilha de auditoria para edição de promessas já aprovadas (hoje só o
  histórico de status é imutável).
