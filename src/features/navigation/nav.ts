import {
  LayoutDashboard,
  FolderKanban,
  Network,
  BookOpen,
  ShieldCheck,
  MessagesSquare,
  Image,
  FileDown,
  Settings,
  type LucideIcon,
} from "lucide-react";
import type { MessageKey } from "@/features/i18n/locale";

export interface NavItem {
  to:
    | "/"
    | "/projects"
    | "/program-architect"
    | "/course-studio"
    | "/compliance"
    | "/reviews"
    | "/media"
    | "/exports"
    | "/settings";
  label: MessageKey;
  description: MessageKey;
  icon: LucideIcon;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { to: "/", label: "nav.dashboard", description: "desc.dashboard", icon: LayoutDashboard },
  { to: "/projects", label: "nav.projects", description: "desc.projects", icon: FolderKanban },
  {
    to: "/program-architect",
    label: "nav.architect",
    description: "desc.architect",
    icon: Network,
  },
  { to: "/course-studio", label: "nav.course", description: "desc.course", icon: BookOpen },
  { to: "/compliance", label: "nav.compliance", description: "desc.compliance", icon: ShieldCheck },
  { to: "/reviews", label: "nav.reviews", description: "desc.reviews", icon: MessagesSquare },
  { to: "/media", label: "nav.media", description: "desc.media", icon: Image },
  { to: "/exports", label: "nav.exports", description: "desc.exports", icon: FileDown },
  { to: "/settings", label: "nav.settings", description: "desc.settings", icon: Settings },
];

export function navItem(to: NavItem["to"]): NavItem {
  return NAV_ITEMS.find((n) => n.to === to)!;
}
