import { Download, ExternalLink, MonitorSmartphone, ShieldCheck, Zap } from 'lucide-react';

const downloadUrl = process.env.NEXT_PUBLIC_DOWNLOAD_URL ?? '/downloads/ID Maker Setup 1.0.0.exe';
const downloadTarget = downloadUrl.startsWith('http');
const latestVersion = process.env.NEXT_PUBLIC_LATEST_VERSION ?? 'v1.0.0';
const installerSize = process.env.NEXT_PUBLIC_INSTALLER_SIZE ?? '141.5 MB';
const releaseNotesUrl = process.env.NEXT_PUBLIC_RELEASE_NOTES_URL ?? 'https://github.com/jazeelwayanad/idmaker/releases';
const releaseNotesTarget = releaseNotesUrl.startsWith('http');
const contributeUrl = process.env.NEXT_PUBLIC_CONTRIBUTE_URL ?? 'https://github.com/jazeelwayanad/idmaker/blob/main/CONTRIBUTING.md';

const features = [
  {
    title: 'Bulk ID Card Generation',
    description: 'Import large Excel datasets and generate cards in batches.',
    icon: Zap,
  },
  {
    title: 'Built for Offline Work',
    description: 'Desktop-first workflow with local SQLite data and export tools.',
    icon: ShieldCheck,
  },
  {
    title: 'Advanced Layout Control',
    description: 'Design templates, map fields, preview, and export print-ready files.',
    icon: MonitorSmartphone,
  },
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-dark-900 text-foreground">
      <section className="mx-auto max-w-6xl px-6 py-20 md:py-28">
        <div className="glass-card rounded-3xl border border-zinc-800/80 p-8 md:p-12">
          <span className="inline-flex rounded-full border border-primary-500/30 bg-primary-500/10 px-3 py-1 text-xs font-semibold tracking-wide text-primary-100">
            IDMaker Pro
          </span>
          <h1 className="mt-6 text-4xl font-extrabold leading-tight text-zinc-100 md:text-6xl">
            Create ID Cards at Scale, Faster.
          </h1>
          <p className="mt-5 max-w-2xl text-zinc-300 md:text-lg">
            IDMaker helps schools, institutions, and enterprises produce large volumes of ID cards with an efficient desktop workflow.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href={downloadUrl}
              target={downloadTarget ? '_blank' : undefined}
              rel={downloadTarget ? 'noreferrer' : undefined}
              className="inline-flex items-center gap-2 rounded-xl bg-primary-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-primary-600"
            >
              <Download className="h-4 w-4" />
              Download App
            </a>
            <a
              href={contributeUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 px-5 py-3 text-sm font-bold text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800/60"
            >
              Contribute Now
              <ExternalLink className="h-4 w-4" />
            </a>
            <a
              href="/coffee"
              className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 px-5 py-3 text-sm font-bold text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800/60"
            >
              Give Me a Coffee
            </a>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-20">
        <div className="grid gap-4 md:grid-cols-3">
          {features.map(({ title, description, icon: Icon }) => (
            <article key={title} className="glass-card rounded-2xl border border-zinc-800/80 p-6">
              <Icon className="h-5 w-5 text-primary-400" />
              <h2 className="mt-4 text-lg font-bold text-zinc-100">{title}</h2>
              <p className="mt-2 text-sm text-zinc-400">{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-20">
        <div className="glass-card rounded-2xl border border-zinc-800/80 p-6 md:p-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Latest Release</p>
              <h2 className="mt-2 text-2xl font-bold text-zinc-100">{latestVersion}</h2>
              <p className="mt-2 text-sm text-zinc-400">Windows installer • {installerSize}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <a
                href={downloadUrl}
                target={downloadTarget ? '_blank' : undefined}
                rel={downloadTarget ? 'noreferrer' : undefined}
                className="inline-flex items-center gap-2 rounded-xl bg-primary-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-primary-600"
              >
                <Download className="h-4 w-4" />
                Download {latestVersion}
              </a>
              <a
                href={releaseNotesUrl}
                target={releaseNotesTarget ? '_blank' : undefined}
                rel={releaseNotesTarget ? 'noreferrer' : undefined}
                className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 px-5 py-3 text-sm font-bold text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800/60"
              >
                Release Notes
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
