import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, ArrowRightLeft, CreditCard, Target, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const bottomNavItems = [
  { path: "/financas", label: "Dashboard", icon: LayoutDashboard },
  { path: "/financas/transacoes", label: "Transações", icon: ArrowRightLeft },
  { path: "/financas/cartoes", label: "Cartões", icon: CreditCard },
  { path: "/financas/orcamento", label: "Orçamento", icon: Target },
  { path: "/financas/configuracoes", label: "Config", icon: Settings },
];

const BottomNav = () => {
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border safe-area-bottom">
      <div className="flex items-center justify-around h-16 px-1">
        {bottomNavItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 flex-1 py-1.5 rounded-lg transition-colors",
                active
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className={cn("h-5 w-5", active && "stroke-[2.5]")} />
              <span className={cn("text-[10px] leading-tight", active ? "font-semibold" : "font-medium")}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNav;
