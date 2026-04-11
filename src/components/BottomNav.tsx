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
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-md border-t border-border/50 safe-area-bottom">
      <div className="flex items-center justify-around h-16 px-1">
        {bottomNavItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "relative flex flex-col items-center justify-center gap-0.5 flex-1 py-1.5 rounded-lg transition-all duration-200",
                active
                  ? "text-primary"
                  : "text-muted-foreground active:scale-95"
              )}
            >
              {/* Animated active indicator bar */}
              <span
                className={cn(
                  "absolute -top-[1px] left-1/2 -translate-x-1/2 h-[3px] rounded-full bg-primary transition-all duration-300 ease-out",
                  active ? "w-8 opacity-100" : "w-0 opacity-0"
                )}
              />
              <span
                className={cn(
                  "flex items-center justify-center rounded-full transition-all duration-200",
                  active ? "bg-primary/10 w-10 h-7" : "w-10 h-7"
                )}
              >
                <Icon className={cn("h-[18px] w-[18px] transition-all duration-200", active && "stroke-[2.5] scale-110")} />
              </span>
              <span className={cn("text-[10px] leading-tight transition-all duration-200", active ? "font-bold" : "font-medium")}>
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
