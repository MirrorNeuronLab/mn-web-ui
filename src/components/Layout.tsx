import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Boxes, History, LayoutDashboard, List, Play, Plus } from 'lucide-react';
import mnLogo from '../assets/mn-logo.svg';
import { Button } from './ui/button';
import { cn } from '../lib/utils';

const navItems = [
  { name: 'Dashboard', path: '/', icon: LayoutDashboard },
  { name: 'Jobs', path: '/jobs', icon: List },
  { name: 'Runs', path: '/runs', icon: History },
  { name: 'Models', path: '/models', icon: Boxes },
  { name: 'Start a run', path: '/run', icon: Play },
];

export default function Layout() {
  const location = useLocation();
  const title = pageTitle(location.pathname);

  return (
    <div className="flex min-h-screen flex-col bg-white text-neutral-950 md:h-screen md:flex-row">
      <aside className="flex w-full shrink-0 flex-col border-b border-neutral-200 bg-neutral-50 md:w-64 md:border-b-0 md:border-r">
        <div className="flex h-14 items-center border-b border-neutral-200 px-5">
          <img src={mnLogo} alt="" className="mr-2.5 h-7 w-7 shrink-0" />
          <span className="font-semibold tracking-tight">MirrorNeuron</span>
        </div>
        <div className="hidden px-5 py-3 md:block">
          <Button asChild className="w-full justify-start">
            <NavLink to="/run">
              <Plus className="h-4 w-4" />
              Start a run
            </NavLink>
          </Button>
        </div>
        <nav className="overflow-x-auto px-3 py-2 md:flex-1">
          <ul className="flex min-w-max gap-1 md:block md:min-w-0 md:space-y-1">
            {navItems.map((item) => (
              <li key={item.path}>
                <NavLink
                  to={item.path}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-neutral-100 text-neutral-950'
                        : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-950'
                    )
                  }
                >
                  <item.icon className="mr-2.5 h-4 w-4" />
                  {item.name}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center border-b border-neutral-200 bg-white px-6">
          <h1 className="text-lg font-semibold tracking-tight text-neutral-950">{title}</h1>
        </header>
        <div className="flex-1 overflow-auto bg-white p-5">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

function pageTitle(pathname: string) {
  if (pathname === '/') return 'Dashboard';
  if (pathname === '/jobs') return 'Jobs';
  if (pathname.startsWith('/jobs/')) return 'Job details';
  if (pathname === '/runs') return 'Runs';
  if (pathname.startsWith('/runs/') && !pathname.endsWith('/ui')) return 'Run details';
  if (pathname === '/models') return 'Models';
  if (pathname === '/run') return 'Start a run';
  if (pathname.startsWith('/runs/')) return 'Blueprint UI';
  return 'MirrorNeuron';
}
