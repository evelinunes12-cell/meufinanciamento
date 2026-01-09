import { ReactNode, useState } from "react";
import AppSidebar from "./AppSidebar";
import QuickAddTransaction from "./QuickAddTransaction";
import { Button } from "@/components/ui/button";
import { Plus, Wallet } from "lucide-react";
import { useSaldo } from "@/contexts/SaldoContext";

interface AppLayoutProps {
  children: ReactNode;
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
};

const AppLayout = ({ children }: AppLayoutProps) => {
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const { saldoContas, isLoading } = useSaldo();

  return (
    <div className="min-h-screen bg-background">
      <AppSidebar />
      
      {/* Mobile Header Bar with saldo */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 h-14 bg-background/95 backdrop-blur-sm border-b border-border/50">
        <div className="flex items-center justify-end h-full px-4 pr-16">
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-muted/80 border border-border/50">
            <Wallet className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className={`text-xs font-semibold whitespace-nowrap ${saldoContas >= 0 ? "text-success" : "text-destructive"}`}>
              {isLoading ? "..." : formatCurrency(saldoContas)}
            </span>
          </div>
        </div>
      </div>

      <main className="lg:pl-64 pt-14 lg:pt-0">
        {/* Desktop Header with saldo */}
        <div className="hidden lg:block sticky top-0 z-30 bg-background/95 backdrop-blur-sm border-b border-border/30">
          <div className="flex items-center justify-end h-16 px-8">
            <div className="flex items-center gap-3 px-4 py-2 rounded-xl bg-card border border-border shadow-sm">
              <div className="p-1.5 rounded-lg bg-primary/10">
                <Wallet className="h-4 w-4 text-primary" />
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground leading-none mb-0.5">Saldo Total</p>
                <p className={`text-sm font-bold leading-none ${saldoContas >= 0 ? "text-success" : "text-destructive"}`}>
                  {isLoading ? "..." : formatCurrency(saldoContas)}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 sm:p-6 lg:p-8">
          {children}
        </div>
      </main>

      {/* FAB - Quick Add Button */}
      <Button
        onClick={() => setQuickAddOpen(true)}
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg gradient-primary text-primary-foreground z-40"
        size="icon"
      >
        <Plus className="h-6 w-6" />
      </Button>

      <QuickAddTransaction open={quickAddOpen} onOpenChange={setQuickAddOpen} />
    </div>
  );
};

export default AppLayout;
