# Promessômetro

Plataforma pública e apartidária que reúne as promessas de campanha dos
políticos eleitos no Brasil, cada uma com link para a fonte oficial, e acompanha
o status de cumprimento ao longo do mandato.

**A credibilidade é o produto:** toda afirmação tem fonte verificável, o mesmo
critério vale para todos os partidos, e nada é publicado sem revisão humana.

- Metodologia: [`docs/METODOLOGIA.md`](docs/METODOLOGIA.md)
- Decisões de projeto: [`docs/DECISOES.md`](docs/DECISOES.md)

## Roteiro

1. [x] Repositório, banco e modelo de dados
2. [ ] Coleta do TSE (eleitos e planos de governo de 2026)
3. [ ] Extração de promessas com IA e painel de revisão
4. [ ] Site público (páginas de político e promessa)
5. [ ] Monitoramento automático e sugestão de status
6. [ ] Lançamento; depois, prefeitos das capitais

## Estrutura

```
db/migrations/     esquema do banco em SQL (fonte da verdade do modelo)
scripts/db/        runner de migrações
src/app/           site (Next.js App Router)
src/lib/dominio.ts tipos e rótulos (status, cargos...)
src/lib/db.ts      conexão com o banco (somente servidor)
tests/db/          testes das regras do banco contra PostgreSQL real
docs/              metodologia e registro de decisões
```

## Modelo de dados

| Tabela | Conteúdo |
|---|---|
| `politico` | nome, cargo, UF, partido, mandato, foto, link e identificador no TSE |
| `documento` | plano de governo/discurso/entrevista: URL oficial, cópia salva, hash SHA-256 |
| `promessa` | citação literal, resumo neutro, página, tema, verificável, situação da revisão |
| `atualizacao_status` | status, data do fato, descrição neutra, revisor e data de aprovação |
| `evidencia` | link, data e fonte de cada atualização (uma ou mais) |
| `contestacao` | mensagem e link de fonte enviados pelo público |
| `tema`, `revisor` | tabelas de apoio |

O site público lê apenas as visões `promessa_publica`,
`historico_status_publico` e `placar_politico`, que contêm só o que foi aprovado.

## Rodando localmente

Requisitos: Node.js 22+ e PostgreSQL 15+ (local ou Supabase).

```bash
cp .env.example .env.local   # preencha DATABASE_URL e TEST_DATABASE_URL
npm install
npm run db:migrar            # cria as tabelas
npm run test:db              # testa as regras do banco (APAGA o banco de teste)
npm run dev                  # http://localhost:3000
```

## Regra de ouro

Nunca inventar dados ou links. Todo dado vem de fonte oficial coletada pelo
pipeline e passa por revisão humana antes de ser publicado.
