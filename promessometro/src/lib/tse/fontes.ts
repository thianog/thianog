/**
 * Endereços oficiais do Portal de Dados Abertos do TSE e regras de mandato.
 * URLs conferidas no catálogo (dadosabertos.tse.jus.br, conjunto
 * "candidatos-<ano>") em 2026-11-15.
 */
import type { Cargo } from "@/lib/dominio";

const CDN = "https://cdn.tse.jus.br/estatistica/sead/odsele";

export const tse = {
  /** Página do conjunto de dados de candidatos no portal oficial. */
  conjuntoCandidatos: (ano: number) => `https://dadosabertos.tse.jus.br/dataset/candidatos-${ano}`,
  /** Pacote com um CSV de candidatos por UF (e "BR" para presidente). */
  consultaCand: (ano: number) => `${CDN}/consulta_cand/consulta_cand_${ano}.zip`,
  /** Pacote com os PDFs das propostas de governo de uma UF (ou "BR"). */
  propostaGoverno: (ano: number, uf: string) =>
    `${CDN}/proposta_governo/proposta_governo_${ano}_${uf}.zip`,
};

/**
 * Início e fim do mandato. A partir das eleições de 2026, a posse do
 * Presidente é em 5 de janeiro e a dos Governadores em 6 de janeiro do ano
 * seguinte à eleição, com mandato de 4 anos (Constituição Federal, arts. 28 e
 * 82, com redação da Emenda Constitucional nº 111/2021).
 */
export function mandato(cargo: Cargo, anoEleicao: number): { inicio: string; fim: string } {
  if (anoEleicao < 2026) throw new Error("Regra de posse anterior a 2026 não implementada.");
  const dia = { presidente: "05", governador: "06" }[cargo as "presidente" | "governador"];
  if (!dia) throw new Error(`Regra de mandato para ${cargo} ainda não implementada.`);
  return {
    inicio: `${anoEleicao + 1}-01-${dia}`,
    fim: `${anoEleicao + 5}-01-${dia}`,
  };
}
