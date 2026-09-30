import { Activity, Boxes, FileCode2, History, LayoutList, PlusCircle, Rocket, ScrollText, Server, TerminalSquare } from 'lucide-react';

export const NAV = [
  { to: '/', label: 'Processes', icon: LayoutList },
  { to: '/logs', label: 'Logs', icon: ScrollText },
  { to: '/events', label: 'Events', icon: History },
  { to: '/metrics', label: 'Metrics', icon: Activity },
  { to: '/new', label: 'Start process', icon: PlusCircle },
  { to: '/ecosystem', label: 'Ecosystem', icon: FileCode2 },
  { to: '/deploy', label: 'Deploy', icon: Rocket },
  { to: '/modules', label: 'Modules', icon: Boxes },
  { to: '/system', label: 'System', icon: Server },
  { to: '/jobs', label: 'Jobs', icon: TerminalSquare },
];
