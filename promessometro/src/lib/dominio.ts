/**
 * Tipos e rótulos do domínio. Espelham db/migrations/0001_modelo_de_dados.sql;
 * ao mudar um, mude o outro.
 *
 * As definições de status são as mesmas exibidas na página de metodologia:
 * o texto é único para todos os políticos e partidos.
 */

export const CARGOS = ["presidente", "governador", "prefeito"] as const;
export type Cargo = (typeof CARGOS)[number];

export const TIPOS_DOCUMENTO = ["plano_de_governo", "discurso", "entrevista"] as const;
export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number];

export const STATUS = [
  "nao_iniciada",
  "em_andamento",
  "cumprida",
  "cumprida_parcialmente",
  "modificada",
  "abandonada_revertida",
] as const;
export type Status = (typeof STATUS)[number];

export const STATUS_INFO: Record<Status, { rotulo: string; definicao: string }> = {
  nao_iniciada: {
    rotulo: "Não iniciada",
    definicao: "Nenhuma ação oficial identificada.",
  },
  em_andamento: {
    rotulo: "Em andamento",
    definicao: "Existe ação concreta (projeto de lei, decreto, orçamento, licitação).",
  },
  cumprida: {
    rotulo: "Cumprida",
    definicao: "Entregue conforme prometido.",
  },
  cumprida_parcialmente: {
    rotulo: "Cumprida parcialmente",
    definicao: "Entregue com escopo menor.",
  },
  modificada: {
    rotulo: "Modificada",
    definicao: "O próprio político mudou a proposta publicamente.",
  },
  abandonada_revertida: {
    rotulo: "Abandonada/Revertida",
    definicao: "Desistência declarada ou ato contrário ao prometido.",
  },
};

export const SITUACOES_REVISAO = ["pendente", "aprovada", "descartada"] as const;
export type SituacaoRevisao = (typeof SITUACOES_REVISAO)[number];

export const SITUACOES_CONTESTACAO = ["recebida", "em_analise", "aceita", "rejeitada"] as const;
export type SituacaoContestacao = (typeof SITUACOES_CONTESTACAO)[number];

export type Origem = "ia" | "manual" | "monitoramento";

export interface Politico {
  id: string;
  nome: string;
  nome_urna: string | null;
  cargo: Cargo;
  uf: string | null;
  municipio: string | null;
  partido: string;
  mandato_inicio: Date;
  mandato_fim: Date;
  foto_url: string | null;
  tse_url: string;
  tse_sq_candidato: string;
  ano_eleicao: number;
}

export interface Documento {
  id: string;
  politico_id: string;
  tipo: TipoDocumento;
  titulo: string | null;
  url_oficial: string;
  arquivo_path: string;
  hash_sha256: string;
  data_documento: Date | null;
  coletado_em: Date;
}

export interface Promessa {
  id: string;
  politico_id: string;
  documento_id: string;
  texto_literal: string;
  resumo_neutro: string;
  pagina: number | null;
  tema: string;
  verificavel: boolean;
  origem: Origem;
  situacao_revisao: SituacaoRevisao;
  revisor_id: string | null;
  revisado_em: Date | null;
}

export interface Evidencia {
  url: string;
  data: string;
  fonte: string;
  titulo: string | null;
}

export interface AtualizacaoStatus {
  id: string;
  promessa_id: string;
  status: Status;
  data_referencia: Date;
  descricao_neutra: string;
  origem: Origem;
  situacao_revisao: SituacaoRevisao;
  revisor_id: string | null;
  aprovado_em: Date | null;
}

export interface Contestacao {
  id: string;
  promessa_id: string;
  atualizacao_id: string | null;
  mensagem: string;
  link_fonte: string;
  nome_contato: string | null;
  email_contato: string | null;
  organizacao: string | null;
  situacao: SituacaoContestacao;
  resposta: string | null;
}

/** Linha da visão promessa_publica (somente conteúdo aprovado). */
export interface PromessaPublica {
  id: string;
  politico_id: string;
  documento_id: string;
  texto_literal: string;
  resumo_neutro: string;
  pagina: number | null;
  tema: string;
  tema_nome: string;
  verificavel: boolean;
  status_atual: Status;
  status_desde: Date | null;
  documento_url: string;
  documento_tipo: TipoDocumento;
  documento_hash: string;
}
