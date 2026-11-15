-- Promessômetro — cópia dos arquivos originais dentro do banco
--
-- Guarda o conteúdo dos PDFs coletados, endereçado pelo próprio hash
-- SHA-256. Assim a cópia sobrevive a deploys em hospedagens sem disco
-- permanente (ver D19) e o mesmo arquivo nunca é guardado duas vezes.

create table arquivo (
  hash_sha256 char(64) primary key check (hash_sha256 ~ '^[0-9a-f]{64}$'),
  conteudo bytea not null,
  tamanho_bytes integer not null check (tamanho_bytes > 0),
  tipo_mime text not null,
  criado_em timestamptz not null default now(),

  constraint arquivo_tamanho_confere check (octet_length(conteudo) = tamanho_bytes)
);

-- O conteúdo precisa corresponder ao hash que o identifica.
create function arquivo_conferir_hash() returns trigger
language plpgsql as $$
begin
  if encode(sha256(new.conteudo), 'hex') <> new.hash_sha256 then
    raise exception 'Conteúdo do arquivo não corresponde ao hash informado'
      using errcode = 'check_violation';
  end if;
  return new;
end
$$;

create trigger arquivo_conferir_hash before insert or update on arquivo
  for each row execute function arquivo_conferir_hash();

alter table arquivo enable row level security;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'grant select on arquivo to anon, authenticated';
    execute 'create policy arquivo_leitura on arquivo for select to anon, authenticated using (true)';
  end if;
end
$$;
