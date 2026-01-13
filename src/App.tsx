import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { SaldoProvider } from "@/contexts/SaldoContext";
import { ThemeProvider } from "next-themes";
import ProtectedRoute from "@/components/ProtectedRoute";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

// Finanças Pessoais
import DashboardFinancas from "./pages/financas/DashboardFinancas";
import Transacoes from "./pages/financas/Transacoes";
import Contas from "./pages/financas/Contas";
import Categorias from "./pages/financas/Categorias";
import Cartoes from "./pages/financas/Cartoes";
import Orcamento from "./pages/financas/Orcamento";
import Relatorios from "./pages/financas/Relatorios";
import Projecao from "./pages/financas/Projecao";
import Configuracoes from "./pages/financas/Configuracoes";

// Financiamento
import FinanciamentoConfig from "./pages/financiamento/FinanciamentoConfig";
import FinanciamentoParcelas from "./pages/financiamento/FinanciamentoParcelas";
import FinanciamentoDashboard from "./pages/financiamento/FinanciamentoDashboard";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <SaldoProvider>
            <SidebarProvider>
              <Routes>
            <Route path="/auth" element={<Auth />} />
            
            {/* Redirect root to financas dashboard */}
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Navigate to="/financas" replace />
                </ProtectedRoute>
              }
            />

            {/* Finanças Pessoais */}
            <Route
              path="/financas"
              element={
                <ProtectedRoute>
                  <DashboardFinancas />
                </ProtectedRoute>
              }
            />
            <Route
              path="/financas/transacoes"
              element={
                <ProtectedRoute>
                  <Transacoes />
                </ProtectedRoute>
              }
            />
            <Route
              path="/financas/contas"
              element={
                <ProtectedRoute>
                  <Contas />
                </ProtectedRoute>
              }
            />
            <Route
              path="/financas/categorias"
              element={
                <ProtectedRoute>
                  <Categorias />
                </ProtectedRoute>
              }
            />
            <Route
              path="/financas/cartoes"
              element={
                <ProtectedRoute>
                  <Cartoes />
                </ProtectedRoute>
              }
            />
            <Route
              path="/financas/orcamento"
              element={
                <ProtectedRoute>
                  <Orcamento />
                </ProtectedRoute>
              }
            />
            <Route
              path="/financas/relatorios"
              element={
                <ProtectedRoute>
                  <Relatorios />
                </ProtectedRoute>
              }
            />
            <Route
              path="/financas/projecao"
              element={
                <ProtectedRoute>
                  <Projecao />
                </ProtectedRoute>
              }
            />
            <Route
              path="/financas/configuracoes"
              element={
                <ProtectedRoute>
                  <Configuracoes />
                </ProtectedRoute>
              }
            />

            {/* Financiamento */}
            <Route
              path="/financiamento"
              element={
                <ProtectedRoute>
                  <FinanciamentoConfig />
                </ProtectedRoute>
              }
            />
            <Route
              path="/financiamento/parcelas"
              element={
                <ProtectedRoute>
                  <FinanciamentoParcelas />
                </ProtectedRoute>
              }
            />
            <Route
              path="/financiamento/dashboard"
              element={
                <ProtectedRoute>
                  <FinanciamentoDashboard />
                </ProtectedRoute>
              }
            />

              <Route path="*" element={<NotFound />} />
              </Routes>
            </SidebarProvider>
          </SaldoProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
