/**
 * Leitura dos arquivos de candidatos do TSE (consulta_cand_<ano>_<UF>.csv)
 * e seleção dos eleitos. Código puro, sem rede nem banco, para ser testável.
 *
 * Formato dos arquivos (Portal de Dados Abertos do TSE): CSV separado por ";",
 * campos entre aspas, codificação Latin-1. Dicionário de dados no leiame.pdf
 * que acompanha o pacote.
 */
import { parse } from "csv-parse/sync";
import type { Cargo } from "@/lib/dominio";

export const UFS = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA",
  "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO",
] as const;

const CARGOS_TSE: Record<string, Cargo> = {
  PRESIDENTE: "presidente",
  GOVERNADOR: "governador",
};

export interface LinhaCandidato {
  ANO_ELEICAO: string;
  NR_TURNO: string;
  SG_UF: string;
  DS_CARGO: string;
  SQ_CANDIDATO: string;
  NM_CANDIDATO: string;
  NM_URNA_CANDIDATO: string;
  SG_PARTIDO: string;
  DS_SIT_TOT_TURNO: string;
  [coluna: string]: string;
}

export interface Eleito {
  ano: number;
  cargo: Cargo;
  /** null para presidente */
  uf: string | null;
  /** UF do pacote do TSE onde estão os arquivos ("BR" para presidente) */
  ufPacote: string;
  sqCandidato: string;
  nome: string;
  nomeUrna: string;
  partido: string;
  turno: number;
}

const COLUNAS_OBRIGATORIAS = [
  "ANO_ELEICAO", "NR_TURNO", "SG_UF", "DS_CARGO", "SQ_CANDIDATO",
  "NM_CANDIDATO", "NM_URNA_CANDIDATO", "SG_PARTIDO", "DS_SIT_TOT_TURNO",
];

export function lerConsultaCand(conteudo: Buffer): LinhaCandidato[] {
  const texto = new TextDecoder("latin1").decode(conteudo);
  const linhas = parse(texto, {
    delimiter: ";",
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as LinhaCandidato[];
  if (linhas.length > 0) {
    const faltando = COLUNAS_OBRIGATORIAS.filter((c) => !(c in linhas[0]));
    if (faltando.length) {
      throw new Error(`Formato do TSE mudou: colunas ausentes ${faltando.join(", ")}`);
    }
  }
  return linhas;
}

/** Linhas de presidente/governador com situação final "ELEITO". */
export function extrairEleitos(linhas: LinhaCandidato[]): Eleito[] {
  return linhas
    .filter((l) => l.DS_CARGO in CARGOS_TSE && l.DS_SIT_TOT_TURNO === "ELEITO")
    .map((l) => {
      const cargo = CARGOS_TSE[l.DS_CARGO];
      return {
        ano: Number(l.ANO_ELEICAO),
        cargo,
        uf: cargo === "presidente" ? null : l.SG_UF,
        ufPacote: l.SG_UF,
        sqCandidato: l.SQ_CANDIDATO,
        nome: l.NM_CANDIDATO,
        nomeUrna: l.NM_URNA_CANDIDATO,
        partido: l.SG_PARTIDO,
        turno: Number(l.NR_TURNO),
      };
    });
}

/**
 * Confere se a lista bate com o esperado para a fase 1: exatamente um
 * presidente e um governador por UF. Devolve os problemas encontrados
 * (lista vazia = tudo certo). Não corrige nada: o coletor para e avisa.
 */
export function conferirEleitos(eleitos: Eleito[]): string[] {
  const problemas: string[] = [];
  const presidentes = eleitos.filter((e) => e.cargo === "presidente");
  if (presidentes.length !== 1) {
    problemas.push(`Esperado 1 presidente eleito, encontrado ${presidentes.length}.`);
  }
  for (const uf of UFS) {
    const n = eleitos.filter((e) => e.cargo === "governador" && e.uf === uf).length;
    if (n !== 1) problemas.push(`${uf}: esperado 1 governador eleito, encontrado ${n}.`);
  }
  const sqs = eleitos.map((e) => e.sqCandidato);
  const repetidos = sqs.filter((s, i) => sqs.indexOf(s) !== i);
  if (repetidos.length) problemas.push(`Candidatos repetidos: ${repetidos.join(", ")}.`);
  return problemas;
}

/**
 * Arquivos do pacote de propostas que pertencem ao candidato.
 * Padrão observado no pacote de 2026: "<UF>/<ano><UF><SQ_CANDIDATO>_<NN>.pdf".
 */
export function arquivosDaProposta(nomesNoPacote: string[], e: Eleito): string[] {
  const prefixo = `${e.ufPacote}/${e.ano}${e.ufPacote}${e.sqCandidato}_`;
  return nomesNoPacote
    .filter((n) => n.startsWith(prefixo) && /_\d+\.pdf$/i.test(n))
    .sort();
}
