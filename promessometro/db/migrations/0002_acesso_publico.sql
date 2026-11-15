-- Promessômetro — acesso público (Row Level Security)
--
-- Segue as convenções do Supabase: o papel "anon" é o visitante sem login e
-- "authenticated" é quem fez login. Fora do Supabase (ex.: Postgres local),
-- os papéis são criados aqui para que as mesmas regras possam ser testadas.
--
-- Regra geral: o público lê apenas o que foi aprovado por um revisor e pode
-- apenas ENVIAR contestações. Escrita de conteúdo é feita pelo backend com a
-- conexão de serviço (que ignora RLS), após revisão humana.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end
$$;

alter table tema enable row level security;
alter table revisor enable row level security;
alter table politico enable row level security;
alter table documento enable row level security;
alter table promessa enable row level security;
alter table atualizacao_status enable row level security;
alter table evidencia enable row level security;
alter table contestacao enable row level security;

grant usage on schema public to anon, authenticated;

-- Leitura pública ----------------------------------------------------------

grant select on tema, politico, documento to anon, authenticated;
grant select on promessa, atualizacao_status, evidencia to anon, authenticated;
grant select on status_atual_publico, promessa_publica, historico_status_publico,
  placar_politico to anon, authenticated;

create policy tema_leitura on tema for select to anon, authenticated using (true);
create policy politico_leitura on politico for select to anon, authenticated using (true);
create policy documento_leitura on documento for select to anon, authenticated using (true);

create policy promessa_leitura_aprovada on promessa
  for select to anon, authenticated
  using (situacao_revisao = 'aprovada');

create policy atualizacao_leitura_aprovada on atualizacao_status
  for select to anon, authenticated
  using (
    situacao_revisao = 'aprovada'
    and exists (
      select 1 from promessa p
      where p.id = promessa_id and p.situacao_revisao = 'aprovada'
    )
  );

create policy evidencia_leitura_aprovada on evidencia
  for select to anon, authenticated
  using (exists (
    select 1 from atualizacao_status a
    where a.id = atualizacao_id and a.situacao_revisao = 'aprovada'
  ));

-- Contestação: qualquer pessoa envia; ninguém de fora lê -------------------

grant insert (promessa_id, atualizacao_id, mensagem, link_fonte, nome_contato,
  email_contato, organizacao) on contestacao to anon, authenticated;

create policy contestacao_envio on contestacao
  for insert to anon, authenticated
  with check (
    situacao = 'recebida'
    and resposta is null
    and revisor_id is null
    and exists (
      select 1 from promessa p
      where p.id = promessa_id and p.situacao_revisao = 'aprovada'
    )
  );
