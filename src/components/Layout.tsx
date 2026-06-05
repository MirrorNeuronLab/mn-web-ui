import { NavLink, Outlet } from 'react-router-dom';
import { Boxes, LayoutDashboard, List, Play, Plus } from 'lucide-react';
import mnLogo from '../assets/mn-logo.svg';
import { Button } from './ui/button';
import { cn } from '../lib/utils';

const navItems = [
  { name: 'Dashboard', path: '/', icon: LayoutDashboard },
  { name: 'Jobs', path: '/jobs', icon: List },
  { name: 'Models', path: '/models', icon: Boxes },
  { name: 'Run a job', path: '/run', icon: Play },
];

export default function Layout() {
  return (
    <div className="flex h-screen bg-white text-neutral-950">
      <aside className="flex w-64 flex-col border-r border-neutral-200 bg-neutral-50">
        <div className="flex h-14 items-center border-b border-neutral-200 px-5">
          <img src={mnLogo} alt="" className="mr-2.5 h-7 w-7 shrink-0" />
          <span className="font-semibold tracking-tight">MirrorNeuron</span>
        </div>
        <div className="px-5 py-3">
          <Button asChild className="w-full justify-start">
            <NavLink to="/run">
              <Plus className="h-4 w-4" />
              Run a job
            </NavLink>
          </Button>
        </div>
        <nav className="flex-1 px-3 py-2">
          <ul className="space-y-1">
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
      <main className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center border-b border-neutral-200 bg-white px-6">
          <h1 className="text-lg font-semibold tracking-tight text-neutral-950">Control Panel</h1>
        </header>
        <div className="flex-1 overflow-auto bg-white p-5">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
