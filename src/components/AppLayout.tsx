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
      
      {/* Saldo indicator in header for mobile */}
      <div className="lg:hidden fixed top-0 right-14 z-50 h-14 flex items-center">
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-muted/50">
          <Wallet className="h-3.5 w-3.5 text-muted-foreground" />
          <span className={`text-xs font-medium ${saldoContas >= 0 ? "text-success" : "text-destructive"}`}>
            {isLoading ? "..." : formatCurrency(saldoContas)}
          </span>
        </div>
      </div>

      <main className="lg:pl-64 pt-14 lg:pt-0">
        {/* Desktop saldo indicator */}
        <div className="hidden lg:flex fixed top-4 right-6 z-40">
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-card border border-border shadow-sm">
            <div className="p-1.5 rounded-lg bg-primary/10">
              <Wallet className="h-4 w-4 text-primary" />
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Saldo Total</p>
              <p className={`text-sm font-bold ${saldoContas >= 0 ? "text-success" : "text-destructive"}`}>
                {isLoading ? "..." : formatCurrency(saldoContas)}
              </p>
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
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg gradient-primary text-primary-foreground z-50"
        size="icon"
      >
        <Plus className="h-6 w-6" />
      </Button>

      <QuickAddTransaction open={quickAddOpen} onOpenChange={setQuickAddOpen} />
    </div>
  );
};

export default AppLayout;
