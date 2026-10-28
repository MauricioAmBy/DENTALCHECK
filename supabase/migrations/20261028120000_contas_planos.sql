-- DENTALCHECK — estrutura do banco (Supabase / Postgres).
-- Rode este arquivo inteiro uma vez em: Supabase → SQL Editor → New query → colar → Run.
-- Guarda só CONTA, PLANO e USO. Fichas e fotos de pacientes continuam no aparelho do dentista.
-- O app acessa estas tabelas apenas pelo servidor (chave service_role); o navegador não lê nada direto.

-- Assinaturas: criadas/atualizadas pela Kiwify (webhook), identificadas pelo e-mail da compra.
create table if not exists public.assinaturas (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,                       -- e-mail do titular (o mesmo da compra na Kiwify)
  plano text not null check (plano in ('essencial', 'profissional', 'clinica')),
  periodo text not null default 'mensal' check (periodo in ('mensal', 'anual')),
  status text not null default 'ativa' check (status in ('ativa', 'atrasada', 'cancelada', 'reembolsada')),
  valido_ate timestamptz,                           -- fim do período pago (renovações empurram a data)
  kiwify_pedido text,
  kiwify_assinatura text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- Profissionais da equipe (plano Clínica): outros e-mails que usam a mesma assinatura.
create table if not exists public.membros (
  assinatura_id uuid not null references public.assinaturas(id) on delete cascade,
  email text not null,
  criado_em timestamptz not null default now(),
  primary key (assinatura_id, email)
);
create unique index if not exists membros_email_unico on public.membros (email);

-- Aparelhos conectados por assinatura (limite por plano).
create table if not exists public.aparelhos (
  assinatura_id uuid not null references public.assinaturas(id) on delete cascade,
  aparelho text not null,                           -- identificador gerado no navegador
  descricao text,
  ultimo_uso timestamptz not null default now(),
  primary key (assinatura_id, aparelho)
);

-- Uso por mês: simulações feitas e simulações extras compradas (pacote avulso).
create table if not exists public.uso_mensal (
  assinatura_id uuid not null references public.assinaturas(id) on delete cascade,
  mes text not null,                                -- 'AAAA-MM'
  simulacoes int not null default 0,
  extras int not null default 0,
  primary key (assinatura_id, mes)
);

-- Registro dos avisos recebidos da Kiwify (para conferir e não processar o mesmo aviso duas vezes).
create table if not exists public.eventos_kiwify (
  id text primary key,
  tipo text,
  email text,
  recebido_em timestamptz not null default now(),
  dados jsonb
);

-- Segurança: RLS ligado e nenhuma política = o navegador (chave anon) não acessa estas tabelas.
alter table public.assinaturas enable row level security;
alter table public.membros enable row level security;
alter table public.aparelhos enable row level security;
alter table public.uso_mensal enable row level security;
alter table public.eventos_kiwify enable row level security;

-- Consome 1 simulação do mês de forma atômica (sem estourar o limite com pedidos simultâneos).
-- Retorna o total usado depois de consumir, ou -1 se o limite (plano + extras) já foi atingido.
create or replace function public.consumir_simulacao(p_assinatura uuid, p_mes text, p_limite int)
returns int language plpgsql security definer set search_path = public as $$
declare usado int;
begin
  insert into uso_mensal (assinatura_id, mes) values (p_assinatura, p_mes) on conflict do nothing;
  update uso_mensal set simulacoes = simulacoes + 1
    where assinatura_id = p_assinatura and mes = p_mes and simulacoes < p_limite + extras
    returning simulacoes into usado;
  return coalesce(usado, -1);
end $$;

-- Devolve 1 simulação quando a IA falha (o dentista não paga por erro).
create or replace function public.devolver_simulacao(p_assinatura uuid, p_mes text)
returns void language sql security definer set search_path = public as $$
  update uso_mensal set simulacoes = greatest(0, simulacoes - 1) where assinatura_id = p_assinatura and mes = p_mes;
$$;

-- Soma simulações extras ao mês (compra do pacote avulso).
create or replace function public.adicionar_extras(p_assinatura uuid, p_mes text, p_qtd int)
returns void language sql security definer set search_path = public as $$
  insert into uso_mensal (assinatura_id, mes, extras) values (p_assinatura, p_mes, p_qtd)
  on conflict (assinatura_id, mes) do update set extras = uso_mensal.extras + excluded.extras;
$$;

revoke all on function public.consumir_simulacao(uuid, text, int) from public, anon, authenticated;
revoke all on function public.devolver_simulacao(uuid, text) from public, anon, authenticated;
revoke all on function public.adicionar_extras(uuid, text, int) from public, anon, authenticated;
