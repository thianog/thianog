/**
 * Aplica as migrações SQL de db/migrations em ordem, uma única vez cada.
 * Funciona com qualquer PostgreSQL (local ou Supabase) via DATABASE_URL.
 *
 *   npm run db:migrar
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

const PASTA = path.join(process.cwd(), "db", "migrations");

export async function migrar(databaseUrl: string, log = console.log) {
  const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  try {
    await sql`
      create table if not exists _migracoes (
        nome text primary key,
        aplicada_em timestamptz not null default now()
      )`;
    const aplicadas = new Set(
      (await sql<{ nome: string }[]>`select nome from _migracoes`).map((r) => r.nome),
    );
    const arquivos = (await readdir(PASTA)).filter((f) => f.endsWith(".sql")).sort();

    for (const arquivo of arquivos) {
      if (aplicadas.has(arquivo)) continue;
      const conteudo = await readFile(path.join(PASTA, arquivo), "utf8");
      await sql.begin(async (tx) => {
        await tx.unsafe(conteudo);
        await tx`insert into _migracoes (nome) values (${arquivo})`;
      });
      log(`aplicada: ${arquivo}`);
    }
  } finally {
    await sql.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("Defina DATABASE_URL (veja .env.example).");
    process.exit(1);
  }
  migrar(url).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
