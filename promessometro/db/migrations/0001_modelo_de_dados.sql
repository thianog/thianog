-- Promessômetro — modelo de dados inicial
--
-- Os princípios do briefing são garantidos aqui, no banco, e não só na
-- aplicação:
--   * Fonte obrigatória: documento exige URL oficial + hash; atualização de
--     status só pode ser aprovada com pelo menos uma evidência com link e data.
--   * Revisão humana: tudo nasce "pendente"; aprovar exige revisor e data.
--   * Histórico visível: atualização aprovada (e suas evidências) não pode ser
--     alterada nem apagada; correções entram como nova atualização.

-- gen_random_uuid() é nativo do PostgreSQL 13+; nenhuma extensão é necessária.

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------

create type cargo as enum ('presidente', 'governador', 'prefeito');

create type tipo_documento as enum ('plano_de_governo', 'discurso', 'entrevista');

create type status_promessa as enum (
  'nao_iniciada',
  'em_andamento',
  'cumprida',
  'cumprida_parcialmente',
  'modificada',
  'abandonada_revertida'
);

create type situacao_revisao as enum ('pendente', 'aprovada', 'descartada');

create type situacao_contestacao as enum ('recebida', 'em_analise', 'aceita', 'rejeitada');

-- Quem originou o registro: extração por IA, cadastro manual ou rotina de
-- monitoramento. Serve para auditoria; não muda as regras de publicação.
create type origem_registro as enum ('ia', 'manual', 'monitoramento');

-- ---------------------------------------------------------------------------
-- Funções auxiliares
-- ---------------------------------------------------------------------------

create function url_valida(u text) returns boolean
language sql immutable as $$
  select u ~ '^https?://[^\s/$.?#][^\s]*$'
$$;

create function tocar_atualizado_em() returns trigger
language plpgsql as $$
begin
  new.atualizado_em := now();
  return new;
end
$$;

-- ---------------------------------------------------------------------------
-- Tabelas de apoio
-- ---------------------------------------------------------------------------

create table tema (
  slug text primary key check (slug ~ '^[a-z][a-z_]*$'),
  nome text not null unique
);

insert into tema (slug, nome) values
  ('saude', 'Saúde'),
  ('educacao', 'Educação'),
  ('economia', 'Economia'),
  ('seguranca', 'Segurança'),
  ('infraestrutura', 'Infraestrutura'),
  ('mobilidade', 'Mobilidade e transporte'),
  ('habitacao', 'Habitação'),
  ('assistencia_social', 'Assistência social'),
  ('meio_ambiente', 'Meio ambiente'),
  ('agropecuaria', 'Agropecuária'),
  ('cultura', 'Cultura'),
  ('esporte', 'Esporte e lazer'),
  ('ciencia_tecnologia', 'Ciência e tecnologia'),
  ('direitos_humanos', 'Direitos humanos e cidadania'),
  ('gestao_publica', 'Gestão pública e transparência'),
  ('outros', 'Outros');

-- Pessoas que aprovam conteúdo. No Supabase, o login do painel será ligado a
-- esta tabela pelo e-mail (etapa 3).
create table revisor (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  email text not null unique,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Político
-- ---------------------------------------------------------------------------

create table politico (
  id uuid primary key default gen_random_uuid(),
  nome text not null,                 -- nome civil, como no TSE
  nome_urna text,                     -- nome de urna, como no TSE
  cargo cargo not null,
  uf char(2) check (uf ~ '^[A-Z]{2}$'),
  municipio text,                     -- só para prefeitos
  partido text not null,              -- sigla na eleição
  mandato_inicio date not null,
  mandato_fim date not null,
  foto_url text check (foto_url is null or url_valida(foto_url)),
  tse_url text not null check (url_valida(tse_url)),
  tse_sq_candidato text not null,     -- identificador do candidato no TSE
  ano_eleicao smallint not null check (ano_eleicao between 1990 and 2100),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),

  constraint politico_mandato_valido check (mandato_fim > mandato_inicio),
  constraint politico_uf_por_cargo check (
    (cargo = 'presidente' and uf is null and municipio is null)
    or (cargo = 'governador' and uf is not null and municipio is null)
    or (cargo = 'prefeito' and uf is not null and municipio is not null)
  ),
  constraint politico_tse_unico unique (ano_eleicao, tse_sq_candidato)
);

create index politico_cargo_uf_idx on politico (cargo, uf);

create trigger politico_atualizado_em before update on politico
  for each row execute function tocar_atualizado_em();

-- ---------------------------------------------------------------------------
-- Documento (fonte primária: plano de governo, discurso, entrevista)
-- ---------------------------------------------------------------------------

create table documento (
  id uuid primary key default gen_random_uuid(),
  politico_id uuid not null references politico (id) on delete restrict,
  tipo tipo_documento not null,
  titulo text,
  url_oficial text not null check (url_valida(url_oficial)),
  arquivo_path text not null,         -- cópia guardada (storage)
  hash_sha256 char(64) not null check (hash_sha256 ~ '^[0-9a-f]{64}$'),
  data_documento date,                -- data do próprio documento, se houver
  coletado_em timestamptz not null default now(),

  constraint documento_hash_unico unique (politico_id, hash_sha256)
);

create index documento_politico_idx on documento (politico_id);

-- ---------------------------------------------------------------------------
-- Promessa
-- ---------------------------------------------------------------------------

create table promessa (
  id uuid primary key default gen_random_uuid(),
  politico_id uuid not null references politico (id) on delete restrict,
  documento_id uuid not null references documento (id) on delete restrict,
  texto_literal text not null check (length(btrim(texto_literal)) > 0),
  resumo_neutro text not null check (length(btrim(resumo_neutro)) > 0),
  pagina integer check (pagina is null or pagina > 0),
  tema text not null references tema (slug),
  verificavel boolean not null,
  origem origem_registro not null default 'ia',
  situacao_revisao situacao_revisao not null default 'pendente',
  revisor_id uuid references revisor (id),
  revisado_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),

  constraint promessa_revisao_completa check (
    situacao_revisao = 'pendente'
    or (revisor_id is not null and revisado_em is not null)
  )
);

create index promessa_politico_idx on promessa (politico_id);
create index promessa_publicada_idx on promessa (politico_id, tema)
  where situacao_revisao = 'aprovada';

create trigger promessa_atualizado_em before update on promessa
  for each row execute function tocar_atualizado_em();

-- A promessa precisa vir de um documento do mesmo político; plano de governo
-- exige página (a citação tem que ser localizável no PDF).
create function promessa_validar_documento() returns trigger
language plpgsql as $$
declare
  doc documento%rowtype;
begin
  select * into doc from documento where id = new.documento_id;
  if doc.politico_id <> new.politico_id then
    raise exception 'A promessa e o documento pertencem a políticos diferentes'
      using errcode = 'check_violation';
  end if;
  if doc.tipo = 'plano_de_governo' and new.pagina is null then
    raise exception 'Promessa extraída de plano de governo precisa da página'
      using errcode = 'check_violation';
  end if;
  return new;
end
$$;

create trigger promessa_validar_documento
  before insert or update of politico_id, documento_id, pagina on promessa
  for each row execute function promessa_validar_documento();

-- ---------------------------------------------------------------------------
-- Atualização de status e evidências
-- ---------------------------------------------------------------------------

create table atualizacao_status (
  id uuid primary key default gen_random_uuid(),
  promessa_id uuid not null references promessa (id) on delete restrict,
  status status_promessa not null,
  data_referencia date not null,      -- data do fato que motiva o status
  descricao_neutra text not null check (length(btrim(descricao_neutra)) > 0),
  origem origem_registro not null default 'manual',
  situacao_revisao situacao_revisao not null default 'pendente',
  revisor_id uuid references revisor (id),
  aprovado_em timestamptz,
  criado_em timestamptz not null default now(),

  constraint atualizacao_aprovacao_completa check (
    situacao_revisao <> 'aprovada'
    or (revisor_id is not null and aprovado_em is not null)
  )
);

create index atualizacao_promessa_idx on atualizacao_status (promessa_id, data_referencia desc);

create table evidencia (
  id uuid primary key default gen_random_uuid(),
  atualizacao_id uuid not null references atualizacao_status (id) on delete cascade,
  url text not null check (url_valida(url)),
  data_evidencia date not null,
  fonte text not null,                -- ex.: "Diário Oficial da União"
  titulo text,
  arquivo_path text,                  -- cópia opcional da página/arquivo
  hash_sha256 char(64) check (hash_sha256 is null or hash_sha256 ~ '^[0-9a-f]{64}$'),
  criado_em timestamptz not null default now()
);

create index evidencia_atualizacao_idx on evidencia (atualizacao_id);

-- Regra: aprovação exige promessa aprovada e pelo menos uma evidência.
-- É um constraint trigger adiável para permitir inserir a atualização e as
-- evidências na mesma transação.
create function atualizacao_validar_aprovacao() returns trigger
language plpgsql as $$
begin
  if new.situacao_revisao <> 'aprovada' then
    return null;
  end if;
  if not exists (
    select 1 from promessa p
    where p.id = new.promessa_id and p.situacao_revisao = 'aprovada'
  ) then
    raise exception 'Só é possível aprovar status de promessa já aprovada'
      using errcode = 'check_violation';
  end if;
  if not exists (select 1 from evidencia e where e.atualizacao_id = new.id) then
    raise exception 'Atualização de status aprovada precisa de ao menos uma evidência com link e data'
      using errcode = 'check_violation';
  end if;
  return null;
end
$$;

create constraint trigger atualizacao_validar_aprovacao
  after insert or update on atualizacao_status
  deferrable initially deferred
  for each row execute function atualizacao_validar_aprovacao();

-- Histórico imutável: atualização aprovada não muda nem some.
create function atualizacao_proteger_aprovada() returns trigger
language plpgsql as $$
begin
  if old.situacao_revisao = 'aprovada' then
    raise exception 'Atualização aprovada faz parte do histórico público e não pode ser alterada; registre uma nova atualização'
      using errcode = 'restrict_violation';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$$;

create trigger atualizacao_proteger_aprovada
  before update or delete on atualizacao_status
  for each row execute function atualizacao_proteger_aprovada();

-- Evidência de atualização aprovada também é imutável.
create function evidencia_proteger_aprovada() returns trigger
language plpgsql as $$
begin
  if exists (
    select 1 from atualizacao_status a
    where a.id in (old.atualizacao_id, case when tg_op = 'UPDATE' then new.atualizacao_id end)
      and a.situacao_revisao = 'aprovada'
  ) then
    raise exception 'Evidência de atualização aprovada não pode ser alterada nem removida'
      using errcode = 'restrict_violation';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$$;

create trigger evidencia_proteger_aprovada
  before update or delete on evidencia
  for each row execute function evidencia_proteger_aprovada();

-- Nova evidência não pode ser anexada a atualização já aprovada.
create function evidencia_bloquear_insercao_em_aprovada() returns trigger
language plpgsql as $$
begin
  if exists (
    select 1 from atualizacao_status a
    where a.id = new.atualizacao_id and a.situacao_revisao = 'aprovada'
      -- permite anexar evidências na mesma transação em que a aprovação ocorreu
      and a.xmin <> pg_current_xact_id()::xid
  ) then
    raise exception 'Atualização já aprovada não recebe novas evidências; registre uma nova atualização'
      using errcode = 'restrict_violation';
  end if;
  return new;
end
$$;

create trigger evidencia_bloquear_insercao_em_aprovada
  before insert on evidencia
  for each row execute function evidencia_bloquear_insercao_em_aprovada();

-- ---------------------------------------------------------------------------
-- Contestação (direito de correção)
-- ---------------------------------------------------------------------------

create table contestacao (
  id uuid primary key default gen_random_uuid(),
  promessa_id uuid not null references promessa (id) on delete restrict,
  atualizacao_id uuid references atualizacao_status (id) on delete restrict,
  mensagem text not null check (length(btrim(mensagem)) > 0),
  link_fonte text not null check (url_valida(link_fonte)),
  nome_contato text,
  email_contato text,
  organizacao text,                   -- ex.: assessoria do político
  situacao situacao_contestacao not null default 'recebida',
  resposta text,
  revisor_id uuid references revisor (id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),

  constraint contestacao_resposta_completa check (
    situacao in ('recebida', 'em_analise')
    or (resposta is not null and revisor_id is not null)
  )
);

create index contestacao_situacao_idx on contestacao (situacao, criado_em);

create trigger contestacao_atualizado_em before update on contestacao
  for each row execute function tocar_atualizado_em();

-- ---------------------------------------------------------------------------
-- Visões públicas: só o que passou por revisão humana
-- ---------------------------------------------------------------------------

create view status_atual_publico with (security_invoker = true) as
select distinct on (a.promessa_id)
  a.promessa_id,
  a.id as atualizacao_id,
  a.status,
  a.data_referencia
from atualizacao_status a
where a.situacao_revisao = 'aprovada'
order by a.promessa_id, a.data_referencia desc, a.aprovado_em desc;

-- Sem atualização aprovada, a promessa aparece como "não iniciada"
-- (o político ainda não tomou nenhuma atitude oficial). Ver docs/METODOLOGIA.md.
create view promessa_publica with (security_invoker = true) as
select
  p.id,
  p.politico_id,
  p.documento_id,
  p.texto_literal,
  p.resumo_neutro,
  p.pagina,
  p.tema,
  t.nome as tema_nome,
  p.verificavel,
  coalesce(s.status, 'nao_iniciada') as status_atual,
  s.data_referencia as status_desde,
  d.url_oficial as documento_url,
  d.tipo as documento_tipo,
  d.hash_sha256 as documento_hash
from promessa p
join documento d on d.id = p.documento_id
join tema t on t.slug = p.tema
left join status_atual_publico s on s.promessa_id = p.id
where p.situacao_revisao = 'aprovada';

create view historico_status_publico with (security_invoker = true) as
select
  a.id,
  a.promessa_id,
  a.status,
  a.data_referencia,
  a.descricao_neutra,
  a.aprovado_em,
  coalesce(
    (select jsonb_agg(jsonb_build_object(
        'url', e.url,
        'data', e.data_evidencia,
        'fonte', e.fonte,
        'titulo', e.titulo
      ) order by e.data_evidencia)
     from evidencia e where e.atualizacao_id = a.id),
    '[]'::jsonb
  ) as evidencias
from atualizacao_status a
join promessa p on p.id = a.promessa_id and p.situacao_revisao = 'aprovada'
where a.situacao_revisao = 'aprovada';

create view placar_politico with (security_invoker = true) as
select
  pol.id as politico_id,
  count(pp.id) as total,
  count(pp.id) filter (where pp.status_atual = 'nao_iniciada') as nao_iniciada,
  count(pp.id) filter (where pp.status_atual = 'em_andamento') as em_andamento,
  count(pp.id) filter (where pp.status_atual = 'cumprida') as cumprida,
  count(pp.id) filter (where pp.status_atual = 'cumprida_parcialmente') as cumprida_parcialmente,
  count(pp.id) filter (where pp.status_atual = 'modificada') as modificada,
  count(pp.id) filter (where pp.status_atual = 'abandonada_revertida') as abandonada_revertida,
  count(pp.id) filter (where pp.verificavel) as verificaveis
from politico pol
left join promessa_publica pp on pp.politico_id = pol.id
group by pol.id;
