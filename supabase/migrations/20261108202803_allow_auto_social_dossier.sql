alter table public.dossier_documents drop constraint dossier_documents_source_check;
alter table public.dossier_documents add constraint dossier_documents_source_check check (source in ('paste', 'upload', 'auto-social'));
