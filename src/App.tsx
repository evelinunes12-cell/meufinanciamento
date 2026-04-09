import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { SaldoProvider } from "@/contexts/SaldoContext";
import { ThemeProvider } from "next-themes";
import ProtectedRoute from "@/components/ProtectedRoute";

// Lazy-loaded pages for code-splitting
const Auth = lazy(() => import("./pages/Auth"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const NotFound = lazy(() => import("./pages/NotFound"));

// Finanças Pessoais
const DashboardFinancas = lazy(() => import("./pages/financas/DashboardFinancas"));
const Transacoes = lazy(() => import("./pages/financas/Transacoes"));
const Contas = lazy(() => import("./pages/financas/Contas"));
const Categorias = lazy(() => import("./pages/financas/Categorias"));
const Cartoes = lazy(() => import("./pages/financas/Cartoes"));
const Orcamento = lazy(() => import("./pages/financas/Orcamento"));
const Relatorios = lazy(() => import("./pages/financas/Relatorios"));
const Projecao = lazy(() => import("./pages/financas/Projecao"));
const Configuracoes = lazy(() => import("./pages/financas/Configuracoes"));

// Financiamento
const FinanciamentoConfig = lazy(() => import("./pages/financiamento/FinanciamentoConfig"));
const FinanciamentoParcelas = lazy(() => import("./pages/financiamento/FinanciamentoParcelas"));
const FinanciamentoDashboard = lazy(() => import("./pages/financiamento/FinanciamentoDashboard"));

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
              <Suspense fallback={<div className="flex items-center justify-center min-h-screen bg-background"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
                <main className="contents">
                <Routes>
                  <Route path="/auth" element={<Auth />} />
                  <Route path="/reset-password" element={<ResetPassword />} />
              
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
                </main>
              </Suspense>
            </SidebarProvider>
          </SaldoProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
