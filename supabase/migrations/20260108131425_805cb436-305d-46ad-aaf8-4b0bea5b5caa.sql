-- Add parent category reference and default flag to categorias table
ALTER TABLE public.categorias 
ADD COLUMN categoria_pai_id uuid REFERENCES public.categorias(id) ON DELETE SET NULL,
ADD COLUMN is_default boolean NOT NULL DEFAULT false;

-- Create index for faster parent lookups
CREATE INDEX idx_categorias_categoria_pai_id ON public.categorias(categoria_pai_id);

-- Add constraint to prevent self-referencing
ALTER TABLE public.categorias 
ADD CONSTRAINT categorias_no_self_reference CHECK (id != categoria_pai_id);