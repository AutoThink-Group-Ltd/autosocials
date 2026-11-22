
-- Kanban columns for collaboration pipeline
CREATE TABLE public.collaboration_columns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT 'gray',
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Kanban cards
CREATE TABLE public.collaboration_cards (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  column_id UUID REFERENCES public.collaboration_columns(id) ON DELETE CASCADE NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL,
  creator_name TEXT NOT NULL,
  creator_handle TEXT,
  creator_avatar_url TEXT,
  creator_list TEXT,
  notes TEXT,
  deal_value NUMERIC,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.collaboration_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collaboration_cards ENABLE ROW LEVEL SECURITY;

-- RLS policies for columns
CREATE POLICY "Users can view own workspace columns"
ON public.collaboration_columns FOR SELECT
TO authenticated
USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Users can insert own workspace columns"
ON public.collaboration_columns FOR INSERT
TO authenticated
WITH CHECK (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Users can update own workspace columns"
ON public.collaboration_columns FOR UPDATE
TO authenticated
USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Users can delete own workspace columns"
ON public.collaboration_columns FOR DELETE
TO authenticated
USING (public.is_workspace_member(auth.uid(), workspace_id));

-- RLS policies for cards
CREATE POLICY "Users can view own workspace cards"
ON public.collaboration_cards FOR SELECT
TO authenticated
USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Users can insert own workspace cards"
ON public.collaboration_cards FOR INSERT
TO authenticated
WITH CHECK (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Users can update own workspace cards"
ON public.collaboration_cards FOR UPDATE
TO authenticated
USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Users can delete own workspace cards"
ON public.collaboration_cards FOR DELETE
TO authenticated
USING (public.is_workspace_member(auth.uid(), workspace_id));
