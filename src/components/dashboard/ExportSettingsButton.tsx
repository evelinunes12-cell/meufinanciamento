import { Button } from "@/components/ui/button";
import { Download, Upload } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { useRef } from "react";

const SETTINGS_KEYS = [
  "dashboard-widgets-visibility",
  "orcamento-collapsed-categories",
  // Add more localStorage keys here as the app grows
];

interface ExportSettingsButtonProps {
  variant?: "export" | "both";
}

export function ExportSettingsButton({ variant = "both" }: ExportSettingsButtonProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const exportSettings = () => {
    const settings: Record<string, unknown> = {};
    
    SETTINGS_KEYS.forEach(key => {
      const value = localStorage.getItem(key);
      if (value) {
        try {
          settings[key] = JSON.parse(value);
        } catch {
          settings[key] = value;
        }
      }
    });

    // Also include any other keys that might be relevant
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && !SETTINGS_KEYS.includes(key) && key.startsWith("meufinanciamento-")) {
        const value = localStorage.getItem(key);
        if (value) {
          try {
            settings[key] = JSON.parse(value);
          } catch {
            settings[key] = value;
          }
        }
      }
    }

    const exportData = {
      app: "meufinanciamento",
      exportedAt: new Date().toISOString(),
      version: "1.0",
      settings,
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `meufinanciamento-config-${format(new Date(), "yyyy-MM-dd")}.json`;
    link.click();
    
    toast({ 
      title: "Configurações Exportadas", 
      description: "Arquivo JSON salvo com sucesso" 
    });
  };

  const importSettings = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const data = JSON.parse(content);

        if (data.app !== "meufinanciamento") {
          toast({ 
            title: "Erro", 
            description: "Arquivo de configuração inválido",
            variant: "destructive"
          });
          return;
        }

        // Restore all settings
        Object.entries(data.settings || {}).forEach(([key, value]) => {
          localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
        });

        toast({ 
          title: "Configurações Importadas", 
          description: "Recarregue a página para aplicar as mudanças" 
        });
      } catch (error) {
        toast({ 
          title: "Erro", 
          description: "Erro ao ler arquivo de configuração",
          variant: "destructive"
        });
      }
    };
    reader.readAsText(file);
    
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="flex gap-2">
      <Button variant="outline" size="sm" onClick={exportSettings}>
        <Download className="h-4 w-4 mr-2" />
        Exportar Config
      </Button>
      {variant === "both" && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={importSettings}
            className="hidden"
          />
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-4 w-4 mr-2" />
            Importar Config
          </Button>
        </>
      )}
    </div>
  );
}
