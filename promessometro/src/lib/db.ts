import "server-only";
import postgres from "postgres";

/**
 * Conexão de serviço com o PostgreSQL. Só pode ser usada no servidor:
 * ela ignora RLS, então páginas públicas devem consultar apenas as visões
 * públicas (promessa_publica, historico_status_publico, placar_politico).
 */
const globalParaDb = globalThis as unknown as { sql?: postgres.Sql };

export function db(): postgres.Sql {
  if (!globalParaDb.sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL não definida (veja .env.example).");
    globalParaDb.sql = postgres(url, { max: 5 });
  }
  return globalParaDb.sql;
}
