/**
 * Etapa 2 do roteiro — coleta no TSE.
 *
 * 1. Baixa o pacote oficial de candidatos e identifica os eleitos (presidente
 *    e governadores).
 * 2. Baixa os pacotes de propostas de governo e guarda o PDF de cada eleito.
 * 3. Registra, para cada arquivo, a URL oficial e o hash SHA-256.
 * 4. Grava político, documento e procedência no banco (DATABASE_URL), ou só
 *    gera o manifesto com --sem-banco.
 *
 *   npm run coleta:tse -- [--ano 2026] [--sem-banco] [--uf AC,BR]
 *
 * Os PDFs são guardados no banco (tabela arquivo) e também em DADOS_DIR
 * (padrão ./dados, fora do git), junto com o manifesto da coleta.
 * Nada aqui é inventado: se o formato do TSE mudar ou faltar um eleito, o
 * script para e avisa.
 */
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { parseArgs } from "node:util";
import postgres from "postgres";
import { EnvHttpProxyAgent, fetch } from "undici";
import yauzl from "yauzl";
import {
  arquivosDaProposta,
  conferirEleitos,
  extrairEleitos,
  lerConsultaCand,
  UFS,
  type Eleito,
} from "../../src/lib/tse/eleitos";
import { mandato, tse } from "../../src/lib/tse/fontes";

const dispatcher = new EnvHttpProxyAgent();

interface ArquivoBaixado {
  url: string;
  caminho: string;
  hash: string;
  tamanho: number;
  publicadoEm: string | null;
}

interface DocumentoColetado {
  caminhoNoPacote: string;
  arquivo: string;
  hash: string;
  tamanho: number;
  conteudo: Buffer;
}

// ---------------------------------------------------------------------------
// Download e ZIP
// ---------------------------------------------------------------------------

async function baixar(url: string, destino: string): Promise<ArquivoBaixado> {
  await mkdir(path.dirname(destino), { recursive: true });
  const resp = await fetch(url, { dispatcher });
  if (!resp.ok || !resp.body) throw new Error(`Falha ao baixar ${url}: HTTP ${resp.status}`);

  const hash = createHash("sha256");
  let tamanho = 0;
  const contar = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      hash.update(chunk);
      tamanho += chunk.length;
      cb(null, chunk);
    },
  });
  await pipeline(Readable.fromWeb(resp.body as never), contar, createWriteStream(destino));

  const esperado = Number(resp.headers.get("content-length"));
  if (esperado && esperado !== tamanho) {
    throw new Error(`Download incompleto de ${url}: ${tamanho} de ${esperado} bytes`);
  }
  const lm = resp.headers.get("last-modified");
  return {
    url,
    caminho: destino,
    hash: hash.digest("hex"),
    tamanho,
    publicadoEm: lm ? new Date(lm).toISOString() : null,
  };
}

function abrirZip(arquivo: string): Promise<yauzl.ZipFile> {
  return new Promise((ok, falha) =>
    yauzl.open(arquivo, { lazyEntries: true, autoClose: false }, (err, zip) =>
      err ? falha(err) : ok(zip),
    ),
  );
}

/** Lê do ZIP só as entradas escolhidas, sem carregar o pacote inteiro. */
async function extrair(
  arquivoZip: string,
  escolher: (nomes: string[]) => string[],
  aoLer: (nome: string, conteudo: Buffer) => Promise<void>,
) {
  const zip = await abrirZip(arquivoZip);
  try {
    const entradas = new Map<string, yauzl.Entry>();
    await new Promise<void>((ok, falha) => {
      zip.on("entry", (e: yauzl.Entry) => {
        entradas.set(e.fileName, e);
        zip.readEntry();
      });
      zip.on("end", () => ok());
      zip.on("error", falha);
      zip.readEntry();
    });
    for (const nome of escolher([...entradas.keys()])) {
      const stream = await new Promise<Readable>((ok, falha) =>
        zip.openReadStream(entradas.get(nome)!, (err, s) => (err ? falha(err) : ok(s))),
      );
      const partes: Buffer[] = [];
      for await (const parte of stream) partes.push(parte as Buffer);
      await aoLer(nome, Buffer.concat(partes));
    }
  } finally {
    zip.close();
  }
}

const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex");

// ---------------------------------------------------------------------------
// Banco
// ---------------------------------------------------------------------------

async function registrarColeta(sql: postgres.Sql, a: ArquivoBaixado): Promise<string> {
  const [linha] = await sql`
    insert into coleta (fonte_url, hash_sha256, tamanho_bytes, publicado_em)
    values (${a.url}, ${a.hash}, ${a.tamanho}, ${a.publicadoEm})
    on conflict (fonte_url, hash_sha256) do update set fonte_url = excluded.fonte_url
    returning id`;
  return linha.id;
}

async function gravarPolitico(sql: postgres.Sql, e: Eleito, coletaId: string): Promise<string> {
  const m = mandato(e.cargo, e.ano);
  const [linha] = await sql`
    insert into politico (nome, nome_urna, cargo, uf, partido, mandato_inicio, mandato_fim,
                          tse_url, tse_sq_candidato, ano_eleicao, coleta_id)
    values (${e.nome}, ${e.nomeUrna}, ${e.cargo}, ${e.uf}, ${e.partido}, ${m.inicio}, ${m.fim},
            ${tse.conjuntoCandidatos(e.ano)}, ${e.sqCandidato}, ${e.ano}, ${coletaId})
    on conflict (ano_eleicao, tse_sq_candidato) do update set
      nome = excluded.nome, nome_urna = excluded.nome_urna, cargo = excluded.cargo,
      uf = excluded.uf, partido = excluded.partido, mandato_inicio = excluded.mandato_inicio,
      mandato_fim = excluded.mandato_fim, coleta_id = excluded.coleta_id
    returning id`;
  return linha.id;
}

async function gravarArquivo(sql: postgres.Sql, d: DocumentoColetado) {
  await sql`
    insert into arquivo (hash_sha256, conteudo, tamanho_bytes, tipo_mime)
    values (${d.hash}, ${d.conteudo}, ${d.tamanho}, 'application/pdf')
    on conflict (hash_sha256) do nothing`;
}

async function gravarDocumento(
  sql: postgres.Sql,
  politicoId: string,
  url: string,
  coletaId: string,
  d: DocumentoColetado,
) {
  await sql`
    insert into documento (politico_id, tipo, titulo, url_oficial, arquivo_path, hash_sha256,
                           coleta_id, caminho_no_pacote)
    values (${politicoId}, 'plano_de_governo', 'Proposta de governo registrada no TSE', ${url},
            ${d.arquivo}, ${d.hash}, ${coletaId}, ${d.caminhoNoPacote})
    on conflict (politico_id, hash_sha256) do nothing`;
}

// ---------------------------------------------------------------------------
// Execução
// ---------------------------------------------------------------------------

async function main() {
  const { values } = parseArgs({
    options: {
      ano: { type: "string", default: "2026" },
      "sem-banco": { type: "boolean", default: false },
      uf: { type: "string" },
      "manter-zips": { type: "boolean", default: false },
    },
  });
  const ano = Number(values.ano);
  const dados = path.resolve(process.env.DADOS_DIR ?? "dados");
  const brutos = path.join(dados, "brutos", "tse", String(ano));
  const filtroUf = values.uf?.split(",").map((s) => s.trim().toUpperCase());

  const sql =
    values["sem-banco"] ? null : postgres(requer("DATABASE_URL"), { max: 1, onnotice: () => {} });

  try {
    // 1. Eleitos -------------------------------------------------------------
    console.log(`Baixando candidatos ${ano}...`);
    const pacoteCand = await baixar(tse.consultaCand(ano), path.join(brutos, `consulta_cand_${ano}.zip`));
    const arquivosCsv = ["BR", ...UFS].map((uf) => `consulta_cand_${ano}_${uf}.csv`);
    const eleitos: Eleito[] = [];
    await extrair(
      pacoteCand.caminho,
      (nomes) => {
        const faltando = arquivosCsv.filter((a) => !nomes.includes(a));
        if (faltando.length) throw new Error(`Arquivos ausentes no pacote: ${faltando.join(", ")}`);
        return arquivosCsv;
      },
      async (_nome, conteudo) => {
        eleitos.push(...extrairEleitos(lerConsultaCand(conteudo)));
      },
    );
    const problemas = conferirEleitos(eleitos);
    if (problemas.length) {
      throw new Error(`Lista de eleitos não confere:\n- ${problemas.join("\n- ")}`);
    }
    console.log(`Eleitos: ${eleitos.length} (pacote ${pacoteCand.hash.slice(0, 12)}…)`);

    const coletaCand = sql ? await registrarColeta(sql, pacoteCand) : null;

    // 2. Propostas -----------------------------------------------------------
    const manifestoEleitos: Record<string, unknown>[] = [];
    const manifestoPacotes: Record<string, unknown>[] = [];
    const pacotes = ["BR", ...UFS].filter((uf) => !filtroUf || filtroUf.includes(uf));

    for (const uf of pacotes) {
      const doPacote = eleitos.filter((e) => e.ufPacote === uf);
      const url = tse.propostaGoverno(ano, uf);
      console.log(`[${uf}] baixando propostas...`);
      const pacote = await baixar(url, path.join(brutos, `proposta_governo_${ano}_${uf}.zip`));
      const coletaProp = sql ? await registrarColeta(sql, pacote) : null;

      for (const e of doPacote) {
        const docs: DocumentoColetado[] = [];
        await extrair(
          pacote.caminho,
          (nomes) => arquivosDaProposta(nomes, e),
          async (nome, conteudo) => {
            if (!conteudo.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
              throw new Error(`${nome} não é um PDF`);
            }
            const relativo = path.posix.join("documentos", String(ano), nome);
            const destino = path.join(dados, relativo);
            await mkdir(path.dirname(destino), { recursive: true });
            await writeFile(destino, conteudo);
            docs.push({
              caminhoNoPacote: nome,
              arquivo: relativo,
              hash: sha256(conteudo),
              tamanho: conteudo.length,
              conteudo,
            });
          },
        );

        if (docs.length === 0) {
          console.warn(`[${uf}] ATENÇÃO: nenhuma proposta encontrada para ${e.nomeUrna} (${e.sqCandidato})`);
        }
        if (sql) {
          const politicoId = await gravarPolitico(sql, e, coletaCand!);
          for (const d of docs) {
            await gravarArquivo(sql, d);
            await gravarDocumento(sql, politicoId, url, coletaProp!, d);
          }
        }
        manifestoEleitos.push({
          cargo: e.cargo,
          uf: e.uf,
          sq_candidato: e.sqCandidato,
          nome_urna: e.nomeUrna,
          partido: e.partido,
          turno: e.turno,
          documentos: docs.map((d) => ({
            url_oficial: url,
            caminho_no_pacote: d.caminhoNoPacote,
            arquivo: d.arquivo,
            hash: d.hash,
            tamanho: d.tamanho,
          })),
        });
        console.log(`[${uf}] ${e.cargo} ${e.nomeUrna} (${e.partido}): ${docs.length} PDF(s)`);
      }

      if (!values["manter-zips"]) await rm(pacote.caminho);
      manifestoPacotes.push({ url, hash: pacote.hash, tamanho: pacote.tamanho, publicado_em: pacote.publicadoEm });
    }

    // 3. Manifesto -----------------------------------------------------------
    const arquivoManifesto = path.join(dados, "manifestos", `coleta-tse-${ano}-${hoje()}.json`);
    await mkdir(path.dirname(arquivoManifesto), { recursive: true });
    await writeFile(
      arquivoManifesto,
      JSON.stringify(
        {
          gerado_em: new Date().toISOString(),
          candidatos: { url: pacoteCand.url, hash: pacoteCand.hash, publicado_em: pacoteCand.publicadoEm },
          propostas: manifestoPacotes,
          eleitos: manifestoEleitos,
        },
        null,
        2,
      ),
    );
    console.log(`Manifesto: ${path.relative(process.cwd(), arquivoManifesto)}`);
  } finally {
    await sql?.end();
  }
}

function requer(nome: string): string {
  const v = process.env[nome];
  if (!v) throw new Error(`Defina ${nome} (veja .env.example) ou use --sem-banco.`);
  return v;
}

const hoje = () => new Date().toISOString().slice(0, 10);

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
