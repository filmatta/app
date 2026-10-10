begin;

alter table public.writer_assisted_imports
  drop constraint writer_assisted_imports_source_format_check;

alter table public.writer_assisted_imports
  add constraint writer_assisted_imports_source_format_check
    check (source_format in ('pasted','txt','fdx','docx'));

commit;
