import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { 
  LayoutDashboard, 
  ArrowRightLeft, 
  Wallet, 
  Tag, 
  CreditCard, 
  Target, 
  FileText, 
  Car, 
  FileSpreadsheet, 
  BarChart3,
  ChevronDown,
  ChevronRight,
  LogOut,
  Menu,
  X
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

interface NavItem {
  path: string;
  label: string;
  icon: React.ElementType;
}

interface NavGroup {
  title: string;
  icon: React.ElementType;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    title: "Finanças Pessoais",
    icon: Wallet,
    items: [
      { path: "/financas", label: "Dashboard", icon: LayoutDashboard },
      { path: "/financas/transacoes", label: "Transações", icon: ArrowRightLeft },
      { path: "/financas/contas", label: "Contas", icon: Wallet },
      { path: "/financas/categorias", label: "Categorias", icon: Tag },
      { path: "/financas/cartoes", label: "Cartões", icon: CreditCard },
      { path: "/financas/orcamento", label: "Orçamento", icon: Target },
      { path: "/financas/relatorios", label: "Relatórios", icon: FileText },
    ],
  },
  {
    title: "Financiamento",
    icon: Car,
    items: [
      { path: "/financiamento", label: "Configuração", icon: FileSpreadsheet },
      { path: "/financiamento/parcelas", label: "Parcelas", icon: FileText },
      { path: "/financiamento/dashboard", label: "Dashboard", icon: BarChart3 },
    ],
  },
];

const AppSidebar = () => {
  const location = useLocation();
  const { signOut } = useAuth();
  const [expandedGroups, setExpandedGroups] = useState<string[]>(["Finanças Pessoais", "Financiamento"]);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const handleSignOut = async () => {
    const { error } = await signOut();
    if (error) {
      toast({
        title: "Erro",
        description: "Erro ao sair da conta",
        variant: "destructive",
      });
    }
  };

  const toggleGroup = (title: string) => {
    setExpandedGroups((prev) =>
      prev.includes(title)
        ? prev.filter((g) => g !== title)
        : [...prev, title]
    );
  };

  const isActive = (path: string) => location.pathname === path;

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border">
        <Link to="/financas" className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl gradient-primary shadow-soft">
            <Wallet className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-lg font-bold text-foreground">
            Meu Controle Financeiro
          </span>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto p-4 space-y-2">
        {navGroups.map((group) => (
          <div key={group.title}>
            <button
              onClick={() => toggleGroup(group.title)}
              className="flex items-center justify-between w-full px-3 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground rounded-lg transition-colors"
            >
              <div className="flex items-center gap-2">
                <group.icon className="h-4 w-4" />
                <span>{group.title}</span>
              </div>
              {expandedGroups.includes(group.title) ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </button>

            {expandedGroups.includes(group.title) && (
              <div className="ml-4 mt-1 space-y-1">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={() => setIsMobileOpen(false)}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200",
                        isActive(item.path)
                          ? "bg-primary text-primary-foreground shadow-soft"
                          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </nav>

      <div className="p-4 border-t border-border">
        <Button
          variant="ghost"
          onClick={handleSignOut}
          className="w-full justify-start text-muted-foreground hover:text-destructive"
        >
          <LogOut className="h-4 w-4 mr-2" />
          Sair
        </Button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-card border-b border-border px-4 h-14 flex items-center justify-between">
        <Link to="/financas" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg gradient-primary">
            <Wallet className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="font-semibold text-foreground">Meu Controle</span>
        </Link>
        <Button variant="ghost" size="icon" onClick={() => setIsMobileOpen(!isMobileOpen)}>
          {isMobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </div>

      {/* Mobile Sidebar */}
      {isMobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 bg-background/80 backdrop-blur-sm" onClick={() => setIsMobileOpen(false)}>
          <div className="fixed inset-y-0 left-0 w-72 bg-card border-r border-border pt-14" onClick={(e) => e.stopPropagation()}>
            <SidebarContent />
          </div>
        </div>
      )}

      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 bg-card border-r border-border">
        <SidebarContent />
      </aside>
    </>
  );
};

export default AppSidebar;
