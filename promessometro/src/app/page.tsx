import { STATUS, STATUS_INFO } from "@/lib/dominio";

export default function Inicio() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-16">
      <h1 className="text-4xl font-semibold tracking-tight">Promessômetro</h1>
      <p className="mt-4 text-lg leading-relaxed">
        Promessas de campanha dos políticos eleitos no Brasil, cada uma com link para a fonte
        oficial, e o acompanhamento do cumprimento ao longo do mandato.
      </p>
      <p className="mt-4 rounded-md border border-current/20 px-4 py-3 text-sm">
        Em construção. Os dados serão publicados somente depois da coleta nas fontes oficiais e
        da revisão humana de cada promessa.
      </p>

      <h2 className="mt-12 text-xl font-semibold">Como classificamos as promessas</h2>
      <dl className="mt-4 space-y-3">
        {STATUS.map((s) => (
          <div key={s}>
            <dt className="font-medium">{STATUS_INFO[s].rotulo}</dt>
            <dd className="text-sm opacity-80">{STATUS_INFO[s].definicao}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-8 text-sm opacity-80">
        Toda mudança de status tem ao menos uma evidência com link e data. O histórico completo
        fica visível.
      </p>
    </main>
  );
}
