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
Texto público do status (revisto em D11): "o político ainda não tomou
nenhuma atitude oficial em relação a esta promessa".

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

## D11 — Texto público de "Não iniciada" (2026-11-15)

**Decisão (do responsável pelo projeto):** a definição exibida de **Não
iniciada** é "O político ainda não tomou nenhuma atitude oficial em relação a
esta promessa." Substitui a formulação "nenhuma ação oficial identificada".

**Consequência:** como o texto afirma que não houve atitude oficial (e não
apenas que ela não foi encontrada), a cobertura do monitoramento (etapa 5)
precisa ser ampla, e uma contestação com fonte que mostre ato oficial deve
gerar atualização de status com prioridade.

## D12 — Coleta só pelo Portal de Dados Abertos do TSE (2026-11-15)

**Decisão:** eleitos e propostas de governo vêm dos pacotes oficiais do
Portal de Dados Abertos (`dadosabertos.tse.jus.br`, arquivos em
`cdn.tse.jus.br`): `consulta_cand_<ano>.zip` e
`proposta_governo_<ano>_<UF>.zip`.

**Por quê:** o DivulgaCandContas recusa acesso automatizado ("Access Denied"
do próprio site). Não contornamos esse bloqueio; os dados abertos são o canal
oficial para uso automatizado e trazem os mesmos PDFs.

**Como identificamos o eleito:** `DS_CARGO` = PRESIDENTE/GOVERNADOR e
`DS_SIT_TOT_TURNO` = ELEITO. O coletor exige exatamente 1 presidente e 1
governador por UF; se não bater, para sem gravar nada.

**Como ligamos a proposta ao eleito:** o PDF no pacote se chama
`<UF>/<ano><UF><SQ_CANDIDATO>_<NN>.pdf`. Um candidato pode ter mais de um
arquivo (`_01`, `_02`...); todos viram documentos.

## D13 — Procedência registrada por versão do pacote (2026-11-15)

Cada pacote baixado vira uma linha em `coleta` (URL, SHA-256, tamanho,
`Last-Modified`). Político e documento apontam para a coleta de origem, e o
documento guarda o caminho do PDF dentro do pacote. Qualquer pessoa pode
baixar o mesmo pacote e conferir o hash. A cada execução também é gerado um
manifesto JSON em `dados/manifestos/`.

## D14 — Link do político no TSE = página do conjunto de dados (2026-11-15)

**Decisão:** `politico.tse_url` aponta para
`https://dadosabertos.tse.jus.br/dataset/candidatos-<ano>`, onde está o
registro de onde os dados saíram.

**Por quê:** a página individual do candidato no DivulgaCandContas não pode
ser verificada automaticamente (D12), e não publicamos link que não foi
conferido.

**Em aberto:** trocar pelo link da página do candidato no DivulgaCandContas
depois de conferência humana, no painel de revisão (etapa 3).

## D15 — Mandato calculado pela regra constitucional (2026-11-15)

A partir das eleições de 2026, posse do Presidente em 5 de janeiro e dos
Governadores em 6 de janeiro do ano seguinte, mandato de 4 anos (CF, arts. 28
e 82, redação da EC nº 111/2021). Prefeitos ainda não implementados (fase 2).

## D16 — Arquivos guardados fora do git (2026-11-15)

PDFs e pacotes ficam em `DADOS_DIR` (padrão `./dados`, ignorado pelo git);
`documento.arquivo_path` é relativo a essa pasta. Os pacotes ZIP são apagados
após a extração (`--manter-zips` para guardar). Armazenamento
permanente: ver D19.

## D17 — Político e documento não passam pela fila de revisão (2026-11-15)

São cópia mecânica de dados oficiais (sem IA, sem interpretação), conferidos
automaticamente (D12). A revisão humana obrigatória vale para o que envolve
interpretação: promessas extraídas e mudanças de status.

## D18 — Hospedagem na Render, sem Supabase e sem Vercel (2026-11-15)

Revê D2 e D8.

**Decisão:** site (Next.js) e banco (PostgreSQL 16) na Render, criados pelo
Blueprint `render.yaml` na raiz do repositório. Passo a passo em
`docs/DEPLOY-RENDER.md`.

**Por quê:** o responsável pelo projeto já tem conta na Render e quer um custo
pequeno e previsível. Um só provedor para site e banco.

**Consequências:**
- Site no plano gratuito enquanto não há público (dorme após 15 min sem
  acesso); banco no menor plano pago, porque o gratuito expira em 30 dias e
  apaga os dados.
- As migrações rodam no início de cada deploy (idempotentes).
- Em banco gerenciado o usuário pode não poder criar papéis; as migrações
  0002–0004 deixam o RLS ligado e só criam as políticas por papel quando
  possível. O site usa a conexão do dono e lê apenas as visões públicas (D4).
- Login do painel de revisão (etapa 3) será próprio do app, com a tabela
  `revisor`, em vez de Supabase Auth.

## D19 — PDFs guardados no próprio banco (2026-11-15)

Resolve o "em aberto" de D16.

**Decisão:** tabela `arquivo` (conteúdo `bytea` endereçado pelo SHA-256).
Um trigger recalcula o hash na gravação e recusa conteúdo que não bate.

**Por quê:** serviços gratuitos da Render não têm disco permanente, e um
serviço de armazenamento separado seria mais um custo. Os 36 PDFs de 2026
somam ~122 MB, o que cabe com folga num banco pequeno. Se o volume crescer
muito (fase 3), migrar para armazenamento de objetos.

## D20 — Coleta roda no GitHub Actions (2026-11-15)

O workflow manual `.github/workflows/promessometro-coleta-tse.yml` roda a
coleta e grava no banco de produção pela URL externa (segredo
`PROMESSOMETRO_DATABASE_URL`). Gratuito, e segue o briefing ("jobs
agendados: GitHub Actions"). O manifesto de cada execução fica salvo como
artefato da execução.

---

## Pendências conhecidas

- Fotos oficiais dos eleitos: o TSE publica pacotes por UF
  (`foto_cand<ano>_<UF>_div.zip`); falta coletar e definir onde hospedar.
- Trilha de auditoria para edição de promessas já aprovadas (hoje só o
  histórico de status é imutável).
