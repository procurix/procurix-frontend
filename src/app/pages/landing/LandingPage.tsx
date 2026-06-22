import { Link } from 'react-router-dom';
import { ArrowRight, Cpu, Sparkles, Network, ShieldCheck } from 'lucide-react';

// Placeholder marketing landing. Real copy and design will come later;
// this just establishes the route, the auth CTAs, and a friendly empty
// state so anonymous visitors don't see a 404 at /.

export function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <header className="px-8 py-5">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-blue-600 p-1.5 text-white">
              <Cpu className="h-5 w-5" />
            </div>
            <span className="text-lg font-semibold text-slate-900">Procurix</span>
          </div>
          <nav className="flex items-center gap-2">
            <Link
              to="/login"
              className="rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Sign in
            </Link>
            <Link
              to="/register"
              className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              Get started
            </Link>
          </nav>
        </div>
      </header>

      <main className="px-8 py-12">
        <section className="mx-auto max-w-4xl text-center">
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
            Turn a BOM into a complete electrical design.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-600">
            Upload a parts list. Procurix identifies every component, extracts datasheets,
            generates spec statements, builds an architecture, and groups it into subsystems —
            all reviewable, all editable.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Link
              to="/register"
              className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              Start free
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/login"
              className="rounded-md border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              I already have an account
            </Link>
          </div>
        </section>

        <section className="mx-auto mt-20 grid max-w-6xl gap-6 px-2 sm:grid-cols-3">
          <Feature
            icon={Sparkles}
            title="Identify automatically"
            body="Upload a CSV or Excel BOM. We resolve MPNs against the Octopart / Nexar catalog, fetch datasheets, and extract structured electrical models."
          />
          <Feature
            icon={Network}
            title="Architecture from specs"
            body="Spec statements drive the architecture. Edit a requirement; the connections refresh. Resolve suggested nets and confirm with one click."
          />
          <Feature
            icon={ShieldCheck}
            title="Auditable review"
            body="Every decision is traceable — confidence scores, evidence chains, AI proposals, and a per-requirement history."
          />
        </section>
      </main>

      <footer className="mt-20 border-t border-slate-200 px-8 py-6 text-center text-xs text-slate-500">
        © Procurix
      </footer>
    </div>
  );
}

function Feature({ icon: Icon, title, body }: { icon: typeof Sparkles; title: string; body: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      <div className="inline-flex rounded-lg bg-blue-50 p-2 text-blue-600">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="mt-4 text-base font-semibold text-slate-900">{title}</h3>
      <p className="mt-2 text-sm text-slate-600">{body}</p>
    </div>
  );
}
