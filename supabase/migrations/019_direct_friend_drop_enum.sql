-- Direct Drop: visibility = direct + recipient_id (one specific friend)

do $$ begin
  alter type public.drop_visibility add value if not exists 'direct';
exception when duplicate_object then null;
end $$;
