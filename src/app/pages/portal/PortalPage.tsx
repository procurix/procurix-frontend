import { Link } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  BarChart3,
  Cpu,
  FileStack,
  FolderOpen,
  Key,
  Settings,
  ShieldCheck,
  Upload,
  Users,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '@/app/context/AuthContext';

// Authed home. Quick-link cards in a grid. A few are wired to real routes
// (My BOMs, Upload BOM); the rest are placeholders that don't navigate
// anywhere yet but signal what's coming.

type LucideIcon = typeof Sparkles;

interface QuickLink {
  title: string;
  description: string;
  icon: LucideIcon;
  to?: string;
  comingSoon?: boolean;
}

const QUICK_LINKS: QuickLink[] = [
  {
    title: 'My BOMs',
    description: 'Open your existing designs and continue where you left off.',
    icon: FolderOpen,
    to: '/library',
  },
  {
    title: 'Upload BOM',
    description: 'Start a new design from a parts list (CSV, Excel, or text).',
    icon: Upload,
    to: '/upload',
  },
  {
    title: 'Upload supplemental docs',
    description: 'Attach datasheets, standards, and reference designs to a BOM.',
    icon: FileStack,
    to: '/ingestion/documents',
  },
  {
    title: 'View metrics',
    description: 'Quality, completeness, and compliance signals across your designs.',
    icon: BarChart3,
    comingSoon: true,
  },
  {
    title: 'Compliance dashboard',
    description: 'Aggregate compliance gaps surfaced across active BOMs.',
    icon: ShieldCheck,
    comingSoon: true,
  },
  {
    title: 'Recent activity',
    description: 'Timeline of edits, regenerations, and approvals.',
    icon: Activity,
    comingSoon: true,
  },
  {
    title: 'Team',
    description: 'Invite teammates and collaborate on BOMs together.',
    icon: Users,
    comingSoon: true,
  },
  {
    title: 'API keys',
    description: 'Programmatic access for your CI / scripts.',
    icon: Key,
    comingSoon: true,
  },
  {
    title: 'Settings',
    description: 'Profile, password, and notification preferences.',
    icon: Settings,
    comingSoon: true,
  },
];

export function PortalPage() {
  const { user, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <header className="border-b bg-white/80 backdrop-blur-sm px-8 py-5">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-blue-600 p-1.5 text-white">
              <Cpu className="h-5 w-5" />
            </div>
            <span className="text-lg font-semibold text-slate-900">Procurix</span>
          </div>
          <div className="flex items-center gap-3 text-sm text-slate-600">
            <span className="hidden sm:inline">{user?.email}</span>
            <button
              type="button"
              onClick={() => void signOut()}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-8 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">
            Welcome back{user?.email ? `, ${user.email.split('@')[0]}` : ''}.
          </h1>
          <p className="mt-1 text-sm text-slate-600">What would you like to do today?</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {QUICK_LINKS.map((link) => (
            <QuickLinkCard key={link.title} link={link} />
          ))}
        </div>
      </main>
    </div>
  );
}

function QuickLinkCard({ link }: { link: QuickLink }) {
  const Icon = link.icon;
  const body = (
    <>
      <div className="flex items-start justify-between">
        <div className="rounded-lg bg-blue-50 p-2 text-blue-600">
          <Icon className="h-5 w-5" />
        </div>
        {link.comingSoon ? (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Soon
          </span>
        ) : (
          <ArrowRight className="h-4 w-4 text-slate-300 transition-transform group-hover:translate-x-1 group-hover:text-blue-600" />
        )}
      </div>
      <h3 className="mt-4 text-base font-semibold text-slate-900">{link.title}</h3>
      <p className="mt-1 text-sm text-slate-600">{link.description}</p>
    </>
  );

  if (link.to) {
    return (
      <Link
        to={link.to}
        className="group rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm transition-all hover:border-blue-300 hover:shadow-md"
      >
        {body}
      </Link>
    );
  }
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 opacity-70" aria-disabled="true">
      {body}
    </div>
  );
}
