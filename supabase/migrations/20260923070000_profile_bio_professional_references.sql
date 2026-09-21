-- Narrow contact detection: a referenced publication is not a contact profile. No data rewrite.
begin;
create or replace function private.profile_bio_has_contact(p_text text) returns boolean language plpgsql immutable set search_path='' as $$
declare v text; pattern text;
begin
 v:=lower(pg_catalog.normalize(left(coalesce(p_text,''),1201),'NFKC'));
 v:=regexp_replace(v,'['||chr(8203)||'-'||chr(8207)||chr(8234)||'-'||chr(8238)||chr(8288)||'-'||chr(8303)||chr(65279)||']','','g');
 v:=translate(v,'áéíóúüñ','aeiouun');
 v:=regexp_replace(v,'[[:space:]]+',' ','g');
 v:=regexp_replace(v,'[a-z0-9._%+-]+@[a-z0-9.-]+[.][a-z]{2,63}',' correo-permitido ','g');
 foreach pattern in array array['(^|[^a-z0-9._%+-])@[a-z0-9_][a-z0-9._]*',
'(^|[^a-z0-9_])(ig|instagram)[ ]*[:=][ ]*[@a-z0-9_]',
'(^|[^a-z0-9_])(mi[ ]+)?ig[ ]+es[ ]+[@a-z0-9_]',
'(me encuentras|buscame|sigueme|contactame)[ ]+(en[ ]+)?instagram',
'mi usuario de instagram[ ]+(es|:)',
'(instagram|contacto|contactarme)[^.]{0,80}mi usuario[ ]+(es|:)',
'(^|[^a-z0-9_])(www[.])?instagram[.]com/(?!p/|reel/|reels/|stories/|explore/)[a-z0-9_.]+',
'(^|[^a-z0-9_])(wa[.]me/|api[.]whatsapp[.]com/|chat[.]whatsapp[.]com/|whatsapp://)',
'(escribeme|contactame|hablame)[ ]+(por|al|en)[ ]+whatsapp',
'whatsapp[ ]*[:=][ ]*[+0-9(]',
'(llamame[ ]+al|telefono([ ]+de[ ]+contacto)?[ ]*[:=]|contacto[ ]*[:=])[ ]*[+0-9(][+0-9() .-]{5,}',
'(^|[^a-z0-9_])arroba[ ]+[a-z0-9_]+'] loop
  if v ~ pattern then return true; end if;
 end loop;
 return false;
end $$;
commit;
