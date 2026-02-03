-- Add external_id column for duplicate detection from OFX imports
ALTER TABLE public.transacoes 
ADD COLUMN external_id TEXT UNIQUE;

-- Create index for faster lookups
CREATE INDEX idx_transacoes_external_id ON public.transacoes(external_id) WHERE external_id IS NOT NULL;

-- Add comment explaining the column purpose
COMMENT ON COLUMN public.transacoes.external_id IS 'Unique external identifier (FITID from OFX) for duplicate prevention';