-- DENTALCHECK — margem: registro do custo da IA, limites das chamadas auxiliares, teto de falhas,
-- limite diário global e controle dos avisos ao administrador.
-- Rode este arquivo inteiro uma vez em: Supabase → SQL Editor → New query → colar → Run.
-- Pode rodar mais de uma vez sem erro. Rode ANTES de publicar o código que usa estas tabelas.
-- Nenhuma tabela guarda foto ou dado de paciente.

-- Cada chamada feita ao Gemini (uma simulação pode ter mais de uma, quando um modelo não existe e o próximo é tentado).
-- Serve para calibrar os limites dos planos (custo real de 1 simulação e de 1 chamada auxiliar).
create table if not exists public.chamadas_ia (
  id bigint generated always as identity primary key,
  assinatura_id uuid references public.assinaturas(id) on delete set null,
  rota text not null,                               -- simular | localizar | analisar-foto | dentes
  modelo text not null,
  tokens_entrada int not null default 0,
  tokens_saida int not null default 0,              -- texto + raciocínio
  tokens_imagem int not null default 0,             -- parte da saída que é imagem (cobrada mais caro)
  sucesso boolean not null,
  motivo text,                                      -- quando falha: bloqueio, sem-imagem, modelo-indisponivel, limite-provedor, erro-provedor, resposta-invalida, rede
  duracao_ms int,
  criado_em timestamptz not null default now()
);
create index if not exists chamadas_ia_criado on public.chamadas_ia (criado_em desc);
create index if not exists chamadas_ia_conta on public.chamadas_ia (assinatura_id, criado_em desc);

-- Contadores por conta e por dia (UTC): chamadas auxiliares, falhas do dia e falhas seguidas.
create table if not exists public.uso_diario (
  assinatura_id uuid not null references public.assinaturas(id) on delete cascade,
  dia date not null,
  auxiliares int not null default 0,
  falhas int not null default 0,
  falhas_seguidas int not null default 0,
  primary key (assinatura_id, dia)
);

-- Freio de emergência do sistema todo, por dia e por tipo ('simulacao' ou 'auxiliar').
create table if not exists public.uso_global_dia (
  dia date not null,
  tipo text not null,
  chamadas int not null default 0,
  primary key (dia, tipo)
);

-- Pedidos e falhas por hora (para avisar quando a taxa de falha geral sobe).
create table if not exists public.ia_hora (
  hora timestamptz primary key,
  pedidos int not null default 0,
  falhas int not null default 0
);

-- Último aviso enviado ao administrador por assunto (no máximo um por hora por assunto).
create table if not exists public.avisos_admin (
  chave text primary key,
  enviado_em timestamptz not null
);

alter table public.chamadas_ia enable row level security;
alter table public.uso_diario enable row level security;
alter table public.uso_global_dia enable row level security;
alter table public.ia_hora enable row level security;
alter table public.avisos_admin enable row level security;

-- Libera (ou não) uma chamada à IA, de forma atômica. Retorna:
--   'ok' | 'teto-falhas' (a conta falhou demais hoje) | 'limite-auxiliares' (acabaram as auxiliares do dia)
--   | 'limite-global' (o sistema todo atingiu o freio do dia).
-- p_tipo: 'simulacao' (a cota do mês é descontada à parte, por consumir_simulacao) ou 'auxiliar'.
create or replace function public.liberar_chamada_ia(p_assinatura uuid, p_dia date, p_tipo text, p_limite_aux int, p_teto_falhas int, p_limite_global int)
returns text language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into uso_diario (assinatura_id, dia) values (p_assinatura, p_dia) on conflict do nothing;
  if exists (select 1 from uso_diario where assinatura_id = p_assinatura and dia = p_dia and falhas >= p_teto_falhas) then
    return 'teto-falhas';
  end if;
  if p_tipo = 'auxiliar' then
    update uso_diario set auxiliares = auxiliares + 1
      where assinatura_id = p_assinatura and dia = p_dia and auxiliares < p_limite_aux
      returning auxiliares into n;
    if n is null then return 'limite-auxiliares'; end if;
  end if;
  insert into uso_global_dia (dia, tipo) values (p_dia, p_tipo) on conflict do nothing;
  update uso_global_dia set chamadas = chamadas + 1
    where dia = p_dia and tipo = p_tipo and chamadas < p_limite_global
    returning chamadas into n;
  if n is null then
    if p_tipo = 'auxiliar' then
      update uso_diario set auxiliares = greatest(0, auxiliares - 1) where assinatura_id = p_assinatura and dia = p_dia;
    end if;
    return 'limite-global';
  end if;
  return 'ok';
end $$;

-- Registra o resultado de um pedido à IA e devolve os números usados para decidir os avisos.
create or replace function public.registrar_resultado_ia(p_assinatura uuid, p_dia date, p_sucesso boolean)
returns json language plpgsql security definer set search_path = public as $$
declare d uso_diario; h ia_hora;
begin
  if p_assinatura is not null then
    insert into uso_diario (assinatura_id, dia) values (p_assinatura, p_dia) on conflict do nothing;
    update uso_diario set
        falhas = falhas + case when p_sucesso then 0 else 1 end,
        falhas_seguidas = case when p_sucesso then 0 else falhas_seguidas + 1 end
      where assinatura_id = p_assinatura and dia = p_dia
      returning * into d;
  end if;
  insert into ia_hora (hora, pedidos, falhas) values (date_trunc('hour', now()), 1, case when p_sucesso then 0 else 1 end)
    on conflict (hora) do update set pedidos = ia_hora.pedidos + 1, falhas = ia_hora.falhas + excluded.falhas
    returning * into h;
  return json_build_object('falhas_dia', coalesce(d.falhas, 0), 'falhas_seguidas', coalesce(d.falhas_seguidas, 0),
                           'pedidos_hora', h.pedidos, 'falhas_hora', h.falhas);
end $$;

-- Reserva o envio de um aviso: true se nenhum aviso com essa chave saiu nos últimos p_minutos.
create or replace function public.reservar_aviso(p_chave text, p_minutos int)
returns boolean language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into avisos_admin (chave, enviado_em) values (p_chave, now())
    on conflict (chave) do update set enviado_em = now()
    where avisos_admin.enviado_em < now() - make_interval(mins => p_minutos);
  get diagnostics n = row_count;
  return n > 0;
end $$;

-- Agregado para o painel admin: por rota e modelo, desde uma data.
create or replace function public.resumo_chamadas_ia(p_desde timestamptz)
returns table (rota text, modelo text, chamadas bigint, sucessos bigint, tokens_entrada bigint, tokens_saida bigint, tokens_imagem bigint)
language sql security definer set search_path = public as $$
  select rota, modelo, count(*), count(*) filter (where sucesso),
         coalesce(sum(tokens_entrada), 0), coalesce(sum(tokens_saida), 0), coalesce(sum(tokens_imagem), 0)
  from chamadas_ia where criado_em >= p_desde group by rota, modelo order by rota, modelo;
$$;

revoke all on function public.liberar_chamada_ia(uuid, date, text, int, int, int) from public, anon, authenticated;
revoke all on function public.registrar_resultado_ia(uuid, date, boolean) from public, anon, authenticated;
revoke all on function public.reservar_aviso(text, int) from public, anon, authenticated;
revoke all on function public.resumo_chamadas_ia(timestamptz) from public, anon, authenticated;
