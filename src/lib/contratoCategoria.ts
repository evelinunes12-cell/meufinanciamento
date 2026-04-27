import { supabase } from "@/integrations/supabase/client";

type TipoContrato = "financiamento" | "emprestimo";

/**
 * Garante existência de categoria pai ("Financiamentos" ou "Empréstimos")
 * e cria/recupera subcategoria com o nome do contrato.
 * Retorna o id da subcategoria.
 */
export async function garantirCategoriaContrato(
  nomeContrato: string,
  tipoContrato: TipoContrato,
  userId: string
): Promise<string> {
  const nomePai = tipoContrato === "emprestimo" ? "Empréstimos" : "Financiamentos";

  // 1) Buscar categoria pai (despesa, sem pai)
  const { data: paiExistente } = await supabase
    .from("categorias")
    .select("id")
    .eq("user_id", userId)
    .eq("tipo", "despesa")
    .eq("nome", nomePai)
    .is("categoria_pai_id", null)
    .maybeSingle();

  let paiId = paiExistente?.id as string | undefined;

  if (!paiId) {
    const { data: novoPai, error: errPai } = await supabase
      .from("categorias")
      .insert({
        user_id: userId,
        nome: nomePai,
        tipo: "despesa",
        cor: "#EF4444",
        icone: tipoContrato === "emprestimo" ? "hand-coins" : "landmark",
      })
      .select("id")
      .single();
    if (errPai) throw errPai;
    paiId = novoPai.id;
  }

  // 2) Buscar/criar subcategoria com nome do contrato
  const nomeSub = nomeContrato.trim() || "Contrato sem nome";
  const { data: subExistente } = await supabase
    .from("categorias")
    .select("id")
    .eq("user_id", userId)
    .eq("tipo", "despesa")
    .eq("nome", nomeSub)
    .eq("categoria_pai_id", paiId)
    .maybeSingle();

  if (subExistente?.id) return subExistente.id;

  const { data: novaSub, error: errSub } = await supabase
    .from("categorias")
    .insert({
      user_id: userId,
      nome: nomeSub,
      tipo: "despesa",
      cor: "#EF4444",
      icone: "circle",
      categoria_pai_id: paiId,
    })
    .select("id")
    .single();
  if (errSub) throw errSub;
  return novaSub.id;
}
