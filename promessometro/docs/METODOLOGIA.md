# Metodologia (rascunho)

> Rascunho da página pública de metodologia. O texto final deve ser revisado
> antes do lançamento. Os mesmos critérios valem para todos os políticos e
> partidos.

## O que é o Promessômetro

Uma plataforma pública e apartidária que reúne as promessas de campanha de
políticos eleitos no Brasil, cada uma com link para a fonte oficial, e acompanha
o status de cumprimento ao longo do mandato.

## Quem acompanhamos

- **Fase 1:** Presidente da República e os 27 governadores eleitos em 2026.
- **Fase 2:** prefeitos das capitais.
- **Fase 3:** demais prefeitos e, depois, outros cargos.

## De onde vêm as promessas

A fonte principal é o **plano de governo** que cada candidato é obrigado a
registrar no Tribunal Superior Eleitoral (TSE), disponível no DivulgaCandContas
e no Portal de Dados Abertos do TSE. Para cada plano guardamos:

- o link oficial no TSE;
- uma cópia do arquivo original;
- uma impressão digital do arquivo (hash SHA-256), que permite a qualquer pessoa
  confirmar que o arquivo não foi alterado.

Discursos e entrevistas podem ser usados como fonte complementar, sempre com
link para o registro original.

## Como as promessas são extraídas

1. Um modelo de inteligência artificial lê o plano de governo e sugere uma lista
   de promessas, cada uma com o **trecho literal** e a **página** de onde saiu.
2. Cada promessa recebe um **resumo neutro** (sem adjetivos ou opinião) e um
   **tema**.
3. A promessa é marcada como **verificável** quando tem uma meta objetiva
   (ex.: "criar 500 creches") ou **não verificável** quando é genérica
   (ex.: "melhorar a saúde").
4. **Uma pessoa revisa cada sugestão** e decide aprovar, editar ou descartar.
   Nada sugerido pela IA é publicado sem essa revisão.

## Status das promessas

| Status | Definição |
|---|---|
| **Não iniciada** | Nenhuma ação oficial identificada. |
| **Em andamento** | Existe ação concreta (projeto de lei, decreto, orçamento, licitação). |
| **Cumprida** | Entregue conforme prometido. |
| **Cumprida parcialmente** | Entregue com escopo menor. |
| **Modificada** | O próprio político mudou a proposta publicamente. |
| **Abandonada/Revertida** | Desistência declarada ou ato contrário ao prometido. |

- Toda promessa começa como **Não iniciada**. Isso significa que não
  encontramos ação oficial, e não que nada foi feito.
- **Toda mudança de status tem ao menos uma evidência** com link e data.
- O status exibido é o do fato mais recente com evidência aprovada.
- **O histórico completo fica visível.** Mudanças de status publicadas não são
  apagadas nem editadas; uma correção entra como nova atualização.

## Onde buscamos evidências

Diário Oficial da União e diários oficiais estaduais, Portal da Transparência,
sites oficiais dos governos e das assembleias legislativas, dados abertos da
Câmara dos Deputados e do Senado. A imprensa de referência é usada apenas como
fonte complementar.

## Direito de correção

Qualquer pessoa, inclusive assessorias de políticos, pode contestar uma
informação pelo formulário disponível em cada promessa. A contestação precisa
incluir um link de fonte. Toda contestação é analisada por uma pessoa.
