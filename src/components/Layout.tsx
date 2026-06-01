import { NavLink, Outlet } from 'react-router-dom';
import { LayoutDashboard, List, Play, Plus } from 'lucide-react';
import clsx from 'clsx';
import mnLogo from '../assets/mn-logo.svg';

const navItems = [
  { name: 'Dashboard', path: '/', icon: LayoutDashboard },
  { name: 'Jobs', path: '/jobs', icon: List },
  { name: 'Run a job', path: '/run', icon: Play },
];

export default function Layout() {
  return (
    <div className="flex h-screen bg-white text-neutral-950">
      <aside className="w-72 bg-neutral-50 border-r border-neutral-200 flex flex-col">
        <div className="h-16 flex items-center px-6 border-b border-neutral-200">
          <img src={mnLogo} alt="" className="mr-3 h-8 w-8 shrink-0" />
          <span className="text-lg font-semibold tracking-tight">MirrorNeuron</span>
        </div>
        <div className="px-6 py-4">
          <NavLink
            to="/run"
            className="flex h-11 items-center gap-3 rounded-md bg-neutral-950 px-4 text-sm font-medium text-white hover:bg-neutral-800"
          >
            <Plus className="w-4 h-4" />
            Run a job
          </NavLink>
        </div>
        <nav className="flex-1 px-4 py-2">
          <ul className="space-y-1">
            {navItems.map((item) => (
              <li key={item.path}>
                <NavLink
                  to={item.path}
                  className={({ isActive }) =>
                    clsx(
                      'flex items-center rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-neutral-100 text-neutral-950'
                        : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-950'
                    )
                  }
                >
                  <item.icon className="w-5 h-5 mr-3" />
                  {item.name}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 bg-white border-b border-neutral-200 flex items-center px-8 shrink-0">
          <h1 className="text-xl font-semibold tracking-tight text-neutral-950">Control Panel</h1>
        </header>
        <div className="flex-1 overflow-auto bg-white p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
