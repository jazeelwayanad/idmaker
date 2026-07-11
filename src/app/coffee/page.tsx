const coffeeUrl = process.env.NEXT_PUBLIC_COFFEE_URL ?? 'https://buymeacoffee.com/';

export default function CoffeePage() {
  return (
    <main className="min-h-screen bg-dark-900 text-foreground">
      <section className="mx-auto max-w-3xl px-6 py-20">
        <div className="glass-card rounded-3xl border border-zinc-800/80 p-8 md:p-12">
          <h1 className="text-3xl font-extrabold text-zinc-100 md:text-4xl">Support IDMaker</h1>
          <p className="mt-4 text-zinc-300">
            If IDMaker helps your work, you can support development by buying me a coffee.
          </p>
          <div className="mt-8">
            <a
              href={coffeeUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center rounded-xl bg-primary-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-primary-600"
            >
              Give Me a Coffee
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
