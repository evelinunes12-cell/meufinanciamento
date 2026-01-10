import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Settings2 } from "lucide-react";
import { ExportSettingsButton } from "./ExportSettingsButton";

export interface WidgetVisibility {
  kpis: boolean;
  graficoCategoria: boolean;
  saldoContas: boolean;
  ultimasTransacoes: boolean;
  contasConfirmar: boolean;
  evolucaoMensal: boolean;
  proximosFechamentos: boolean;
}

const STORAGE_KEY = "dashboard-widgets-visibility";

const defaultVisibility: WidgetVisibility = {
  kpis: true,
  graficoCategoria: true,
  saldoContas: true,
  ultimasTransacoes: true,
  contasConfirmar: true,
  evolucaoMensal: true,
  proximosFechamentos: true,
};

export function useWidgetVisibility() {
  const [visibility, setVisibility] = useState<WidgetVisibility>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? { ...defaultVisibility, ...JSON.parse(saved) } : defaultVisibility;
    } catch {
      return defaultVisibility;
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(visibility));
  }, [visibility]);

  return { visibility, setVisibility };
}

interface CustomizeDashboardModalProps {
  visibility: WidgetVisibility;
  onVisibilityChange: (visibility: WidgetVisibility) => void;
}

const widgetLabels: Record<keyof WidgetVisibility, string> = {
  kpis: "Resumo Financeiro (KPIs)",
  graficoCategoria: "Gráfico de Categorias",
  saldoContas: "Saldos por Conta",
  ultimasTransacoes: "Últimas Transações",
  contasConfirmar: "Contas a Confirmar",
  evolucaoMensal: "Evolução Mensal",
  proximosFechamentos: "Próximos Fechamentos",
};

export function CustomizeDashboardModal({ visibility, onVisibilityChange }: CustomizeDashboardModalProps) {
  const [open, setOpen] = useState(false);
  const [localVisibility, setLocalVisibility] = useState(visibility);

  const handleSave = () => {
    onVisibilityChange(localVisibility);
    setOpen(false);
  };

  const handleToggle = (key: keyof WidgetVisibility) => {
    setLocalVisibility(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setLocalVisibility(visibility); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings2 className="h-4 w-4 mr-2" />
          Personalizar
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Personalizar Dashboard</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {(Object.keys(widgetLabels) as Array<keyof WidgetVisibility>).map((key) => (
            <div key={key} className="flex items-center space-x-3">
              <Checkbox
                id={key}
                checked={localVisibility[key]}
                onCheckedChange={() => handleToggle(key)}
              />
              <Label htmlFor={key} className="cursor-pointer">
                {widgetLabels[key]}
              </Label>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-3">
          <Button onClick={handleSave} className="w-full gradient-primary text-primary-foreground">
            Salvar Preferências
          </Button>
          <div className="flex justify-center">
            <ExportSettingsButton />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
