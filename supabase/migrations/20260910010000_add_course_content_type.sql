begin;

alter table public.courses
  add column content_type text not null default 'course';

alter table public.courses
  add constraint courses_content_type_check
  check (content_type in ('course', 'quick_guide'));

commit;
