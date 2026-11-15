/**
 * Testes das regras do modelo de dados contra um PostgreSQL real.
 * Os dados aqui são fictícios e existem só dentro do banco de teste.
 *
 *   TEST_DATABASE_URL=postgres://... npm run test:db
 */
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, test } from "node:test";
import postgres from "postgres";
import { migrar } from "../../scripts/db/migrar";

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("Defina TEST_DATABASE_URL para rodar os testes de banco.");

const sql = postgres(url, { max: 1, onnotice: () => {} });
const HASH = "a".repeat(64);
const HASH2 = "b".repeat(64);

type Ids = { revisor: string; gov: string; outro: string; plano: string; planoOutro: string };
let ids: Ids;

async function criarBase(): Promise<Ids> {
  const [rev] = await sql`insert into revisor (nome, email) values ('Revisora Teste', 'rev@exemplo.test') returning id`;
  const [gov] = await sql`
    insert into politico (nome, cargo, uf, partido, mandato_inicio, mandato_fim, tse_url, tse_sq_candidato, ano_eleicao)
    values ('Pessoa A', 'governador', 'SP', 'PX', '2027-01-06', '2031-01-06', 'https://exemplo.test/a', '1', 2026)
    returning id`;
  const [outro] = await sql`
    insert into politico (nome, cargo, partido, mandato_inicio, mandato_fim, tse_url, tse_sq_candidato, ano_eleicao)
    values ('Pessoa B', 'presidente', 'PY', '2027-01-05', '2031-01-05', 'https://exemplo.test/b', '2', 2026)
    returning id`;
  const [plano] = await sql`
    insert into documento (politico_id, tipo, url_oficial, arquivo_path, hash_sha256)
    values (${gov.id}, 'plano_de_governo', 'https://exemplo.test/plano-a.pdf', 'planos/a.pdf', ${HASH})
    returning id`;
  const [planoOutro] = await sql`
    insert into documento (politico_id, tipo, url_oficial, arquivo_path, hash_sha256)
    values (${outro.id}, 'plano_de_governo', 'https://exemplo.test/plano-b.pdf', 'planos/b.pdf', ${HASH2})
    returning id`;
  return { revisor: rev.id, gov: gov.id, outro: outro.id, plano: plano.id, planoOutro: planoOutro.id };
}

async function criarPromessa(aprovada: boolean) {
  const [p] = await sql`
    insert into promessa (politico_id, documento_id, texto_literal, resumo_neutro, pagina, tema, verificavel,
                          situacao_revisao, revisor_id, revisado_em)
    values (${ids.gov}, ${ids.plano}, 'Construir 10 escolas', 'Construção de 10 escolas', 3, 'educacao', true,
            ${aprovada ? "aprovada" : "pendente"}, ${aprovada ? ids.revisor : null}, ${aprovada ? new Date() : null})
    returning id`;
  return p.id as string;
}

async function criarAtualizacaoAprovada(promessaId: string, status = "em_andamento") {
  return sql.begin(async (tx) => {
    const [a] = await tx`
      insert into atualizacao_status (promessa_id, status, data_referencia, descricao_neutra,
                                      situacao_revisao, revisor_id, aprovado_em)
      values (${promessaId}, ${status}, '2027-03-01', 'Publicado edital de licitação.', 'aprovada', ${ids.revisor}, now())
      returning id`;
    await tx`
      insert into evidencia (atualizacao_id, url, data_evidencia, fonte)
      values (${a.id}, 'https://exemplo.test/doe/123', '2027-03-01', 'Diário Oficial do Estado')`;
    return a.id as string;
  });
}

async function falha(promessa: Promise<unknown>, trecho: RegExp) {
  await assert.rejects(promessa, (err: Error) => {
    assert.match(err.message, trecho);
    return true;
  });
}

before(async () => {
  await sql`drop schema public cascade`;
  await sql`create schema public`;
  await migrar(url, () => {});
});

after(async () => {
  await sql.end();
});

beforeEach(async () => {
  await sql`truncate contestacao, evidencia, atualizacao_status, promessa, documento, politico, revisor cascade`;
  ids = await criarBase();
});

describe("migrações", () => {
  test("rodar de novo não faz nada", async () => {
    const logs: string[] = [];
    await migrar(url, (m) => logs.push(m));
    assert.deepEqual(logs, []);
  });
});

describe("fonte obrigatória", () => {
  test("documento exige hash SHA-256 válido", async () => {
    await falha(
      sql`insert into documento (politico_id, tipo, url_oficial, arquivo_path, hash_sha256)
          values (${ids.gov}, 'discurso', 'https://exemplo.test/x', 'x', 'nao-e-hash')`,
      /hash_sha256/,
    );
  });

  test("documento exige URL http(s)", async () => {
    await falha(
      sql`insert into documento (politico_id, tipo, url_oficial, arquivo_path, hash_sha256)
          values (${ids.gov}, 'discurso', 'arquivo-local.pdf', 'x', ${"c".repeat(64)})`,
      /url_oficial/,
    );
  });

  test("promessa de plano de governo exige página", async () => {
    await falha(
      sql`insert into promessa (politico_id, documento_id, texto_literal, resumo_neutro, tema, verificavel)
          values (${ids.gov}, ${ids.plano}, 'x', 'x', 'saude', false)`,
      /precisa da página/,
    );
  });

  test("promessa não pode usar documento de outro político", async () => {
    await falha(
      sql`insert into promessa (politico_id, documento_id, texto_literal, resumo_neutro, pagina, tema, verificavel)
          values (${ids.gov}, ${ids.planoOutro}, 'x', 'x', 1, 'saude', false)`,
      /políticos diferentes/,
    );
  });

  test("aprovar status sem evidência é recusado", async () => {
    const p = await criarPromessa(true);
    await falha(
      sql`insert into atualizacao_status (promessa_id, status, data_referencia, descricao_neutra,
                                          situacao_revisao, revisor_id, aprovado_em)
          values (${p}, 'cumprida', '2027-01-01', 'x', 'aprovada', ${ids.revisor}, now())`,
      /ao menos uma evidência/,
    );
  });
});

describe("revisão humana", () => {
  test("aprovar promessa exige revisor e data", async () => {
    await falha(
      sql`insert into promessa (politico_id, documento_id, texto_literal, resumo_neutro, pagina, tema, verificavel, situacao_revisao)
          values (${ids.gov}, ${ids.plano}, 'x', 'x', 1, 'saude', false, 'aprovada')`,
      /promessa_revisao_completa/,
    );
  });

  test("status só é aprovado para promessa aprovada", async () => {
    const p = await criarPromessa(false);
    await falha(criarAtualizacaoAprovada(p), /promessa já aprovada/);
  });

  test("promessa pendente não aparece nas visões públicas", async () => {
    await criarPromessa(false);
    const linhas = await sql`select * from promessa_publica`;
    assert.equal(linhas.length, 0);
  });
});

describe("histórico", () => {
  test("promessa aprovada sem atualização aparece como não iniciada", async () => {
    const p = await criarPromessa(true);
    const [linha] = await sql`select status_atual from promessa_publica where id = ${p}`;
    assert.equal(linha.status_atual, "nao_iniciada");
  });

  test("status atual é o da atualização aprovada mais recente", async () => {
    const p = await criarPromessa(true);
    await criarAtualizacaoAprovada(p, "em_andamento");
    await sql`
      insert into atualizacao_status (promessa_id, status, data_referencia, descricao_neutra)
      values (${p}, 'cumprida', '2028-01-01', 'Pendente de revisão')`;
    const [linha] = await sql`select status_atual from promessa_publica where id = ${p}`;
    assert.equal(linha.status_atual, "em_andamento");

    const [placar] = await sql`select total, em_andamento from placar_politico where politico_id = ${ids.gov}`;
    assert.equal(Number(placar.total), 1);
    assert.equal(Number(placar.em_andamento), 1);

    const [hist] = await sql`select evidencias from historico_status_publico where promessa_id = ${p}`;
    assert.equal(hist.evidencias.length, 1);
  });

  test("atualização aprovada não pode ser editada nem apagada", async () => {
    const p = await criarPromessa(true);
    const a = await criarAtualizacaoAprovada(p);
    await falha(sql`update atualizacao_status set status = 'cumprida' where id = ${a}`, /não pode ser alterada/);
    await falha(sql`delete from atualizacao_status where id = ${a}`, /não pode ser alterada/);
  });

  test("evidência de atualização aprovada é imutável", async () => {
    const p = await criarPromessa(true);
    const a = await criarAtualizacaoAprovada(p);
    await falha(sql`delete from evidencia where atualizacao_id = ${a}`, /não pode ser alterada nem removida/);
    await falha(
      sql`insert into evidencia (atualizacao_id, url, data_evidencia, fonte)
          values (${a}, 'https://exemplo.test/outra', '2027-04-01', 'Outra')`,
      /não recebe novas evidências/,
    );
  });

  test("atualização pendente pode ser aprovada depois de receber evidência", async () => {
    const p = await criarPromessa(true);
    const [a] = await sql`
      insert into atualizacao_status (promessa_id, status, data_referencia, descricao_neutra, origem)
      values (${p}, 'em_andamento', '2027-02-01', 'Projeto de lei enviado.', 'monitoramento') returning id`;
    await sql`insert into evidencia (atualizacao_id, url, data_evidencia, fonte)
              values (${a.id}, 'https://exemplo.test/pl', '2027-02-01', 'Assembleia Legislativa')`;
    await sql`update atualizacao_status set situacao_revisao = 'aprovada', revisor_id = ${ids.revisor},
              aprovado_em = now() where id = ${a.id}`;
    const [linha] = await sql`select status_atual from promessa_publica where id = ${p}`;
    assert.equal(linha.status_atual, "em_andamento");
  });
});

describe("acesso público (RLS)", () => {
  async function comoAnon<T>(fn: (tx: postgres.TransactionSql) => Promise<T>) {
    return sql.begin(async (tx) => {
      await tx`set local role anon`;
      return fn(tx);
    });
  }

  test("visitante só vê promessas aprovadas", async () => {
    await criarPromessa(false);
    const aprovada = await criarPromessa(true);
    const linhas = await comoAnon((tx) => tx`select id from promessa`);
    assert.deepEqual(linhas.map((l) => l.id), [aprovada]);
    const publicas = await comoAnon((tx) => tx`select id from promessa_publica`);
    assert.deepEqual(publicas.map((l) => l.id), [aprovada]);
  });

  test("visitante envia contestação mas não lê contestações", async () => {
    const p = await criarPromessa(true);
    await comoAnon((tx) => tx`
      insert into contestacao (promessa_id, mensagem, link_fonte, organizacao)
      values (${p}, 'A obra foi entregue.', 'https://exemplo.test/entrega', 'Assessoria')`);
    await falha(comoAnon((tx) => tx`select * from contestacao`), /permission denied/);
    const [{ n }] = await sql`select count(*)::int as n from contestacao`;
    assert.equal(n, 1);
  });

  test("visitante não define situação nem resposta da contestação", async () => {
    const p = await criarPromessa(true);
    await falha(
      comoAnon((tx) => tx`
        insert into contestacao (promessa_id, mensagem, link_fonte, situacao)
        values (${p}, 'x', 'https://exemplo.test/x', 'aceita')`),
      /permission denied/,
    );
  });

  test("contestação exige link de fonte", async () => {
    const p = await criarPromessa(true);
    await falha(
      comoAnon((tx) => tx`
        insert into contestacao (promessa_id, mensagem, link_fonte) values (${p}, 'x', 'sem link')`),
      /link_fonte/,
    );
  });

  test("visitante não altera promessas", async () => {
    const p = await criarPromessa(true);
    await falha(
      comoAnon((tx) => tx`update promessa set resumo_neutro = 'x' where id = ${p}`),
      /permission denied/,
    );
  });
});
