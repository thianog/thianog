-- Promessômetro — procedência da coleta
--
-- Cada arquivo baixado de fonte oficial vira uma linha em "coleta", com URL,
-- hash e data de publicação informada pelo servidor. Político e documento
-- apontam para a coleta que os originou: qualquer pessoa pode baixar o mesmo
-- pacote e conferir o hash.

create table coleta (
  id uuid primary key default gen_random_uuid(),
  fonte_url text not null check (url_valida(fonte_url)),
  hash_sha256 char(64) not null check (hash_sha256 ~ '^[0-9a-f]{64}$'),
  tamanho_bytes bigint not null check (tamanho_bytes > 0),
  publicado_em timestamptz,           -- cabeçalho Last-Modified da fonte
  coletado_em timestamptz not null default now(),

  constraint coleta_versao_unica unique (fonte_url, hash_sha256)
);

alter table politico add column coleta_id uuid references coleta (id);

alter table documento add column coleta_id uuid references coleta (id);
-- Quando a URL oficial é um pacote (ZIP), caminho do arquivo dentro dele.
alter table documento add column caminho_no_pacote text;

alter table coleta enable row level security;
grant select on coleta to anon, authenticated;
create policy coleta_leitura on coleta for select to anon, authenticated using (true);
