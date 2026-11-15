/**
 * Testes da leitura dos arquivos do TSE. As linhas abaixo são fictícias,
 * montadas no mesmo formato do consulta_cand (";" e Latin-1).
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  arquivosDaProposta,
  conferirEleitos,
  extrairEleitos,
  lerConsultaCand,
  UFS,
  type Eleito,
} from "../../src/lib/tse/eleitos";
import { mandato } from "../../src/lib/tse/fontes";

const CABECALHO = [
  "ANO_ELEICAO", "NR_TURNO", "SG_UF", "DS_CARGO", "SQ_CANDIDATO", "NM_CANDIDATO",
  "NM_URNA_CANDIDATO", "SG_PARTIDO", "DS_SIT_TOT_TURNO",
];

function csv(linhas: string[][]): Buffer {
  const texto = [CABECALHO, ...linhas]
    .map((l) => l.map((c) => `"${c}"`).join(";"))
    .join("\r\n");
  return Buffer.from(texto, "latin1");
}

describe("lerConsultaCand", () => {
  test("decodifica Latin-1 e separa por ponto e vírgula", () => {
    const linhas = lerConsultaCand(
      csv([["2026", "1", "AC", "GOVERNADOR", "1001", "JOSÉ DA SILVA", "ZÉ", "PX", "ELEITO"]]),
    );
    assert.equal(linhas[0].NM_CANDIDATO, "JOSÉ DA SILVA");
    assert.equal(linhas[0].SQ_CANDIDATO, "1001");
  });

  test("recusa arquivo sem as colunas esperadas", () => {
    const quebrado = Buffer.from('"ANO_ELEICAO";"OUTRA"\r\n"2026";"x"', "latin1");
    assert.throws(() => lerConsultaCand(quebrado), /Formato do TSE mudou/);
  });
});

describe("extrairEleitos", () => {
  const linhas = lerConsultaCand(
    csv([
      ["2026", "1", "BR", "PRESIDENTE", "1", "PESSOA UM", "UM", "PA", "2º TURNO"],
      ["2026", "2", "BR", "PRESIDENTE", "1", "PESSOA UM", "UM", "PA", "ELEITO"],
      ["2026", "2", "BR", "PRESIDENTE", "2", "PESSOA DOIS", "DOIS", "PB", "NÃO ELEITO"],
      ["2026", "1", "AC", "GOVERNADOR", "3", "PESSOA TRÊS", "TRÊS", "PC", "ELEITO"],
      ["2026", "1", "AC", "SENADOR", "4", "PESSOA QUATRO", "QUATRO", "PD", "ELEITO"],
    ]),
  );
  const eleitos = extrairEleitos(linhas);

  test("pega só presidente e governador com situação ELEITO", () => {
    assert.deepEqual(eleitos.map((e) => e.sqCandidato), ["1", "3"]);
  });

  test("presidente fica sem UF, mas guarda o pacote BR", () => {
    assert.equal(eleitos[0].cargo, "presidente");
    assert.equal(eleitos[0].uf, null);
    assert.equal(eleitos[0].ufPacote, "BR");
    assert.equal(eleitos[0].turno, 2);
  });
});

describe("conferirEleitos", () => {
  const base = (sq: string, cargo: Eleito["cargo"], uf: string | null): Eleito => ({
    ano: 2026, cargo, uf, ufPacote: uf ?? "BR", sqCandidato: sq,
    nome: "X", nomeUrna: "X", partido: "P", turno: 1,
  });
  const completo = [
    base("0", "presidente", null),
    ...UFS.map((uf, i) => base(String(i + 1), "governador", uf)),
  ];

  test("lista completa não tem problemas", () => {
    assert.deepEqual(conferirEleitos(completo), []);
  });

  test("aponta UF sem governador e presidente ausente", () => {
    const problemas = conferirEleitos(completo.filter((e) => e.uf !== "SP" && e.cargo !== "presidente"));
    assert.ok(problemas.some((p) => p.includes("presidente")));
    assert.ok(problemas.some((p) => p.startsWith("SP:")));
  });
});

describe("arquivosDaProposta", () => {
  const eleito: Eleito = {
    ano: 2026, cargo: "governador", uf: "PR", ufPacote: "PR", sqCandidato: "160001",
    nome: "X", nomeUrna: "X", partido: "P", turno: 1,
  };

  test("encontra todos os PDFs do candidato, em ordem", () => {
    const nomes = [
      "PR/2026PR160001_02.pdf",
      "PR/2026PR160001_01.pdf",
      "PR/2026PR1600010_01.pdf", // outro candidato com prefixo parecido
      "PR/leiame.pdf",
    ];
    assert.deepEqual(arquivosDaProposta(nomes, eleito), ["PR/2026PR160001_01.pdf", "PR/2026PR160001_02.pdf"]);
  });
});

describe("mandato", () => {
  test("presidente toma posse em 5/1 e governador em 6/1", () => {
    assert.deepEqual(mandato("presidente", 2026), { inicio: "2027-01-05", fim: "2031-01-05" });
    assert.deepEqual(mandato("governador", 2026), { inicio: "2027-01-06", fim: "2031-01-06" });
  });
});
