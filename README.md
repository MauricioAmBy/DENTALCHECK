# DENTALCHECK

App web para dentistas que simula o novo sorriso do paciente com IA e gera a apresentação do caso. Roda no seu computador.

**Fluxo de um novo procedimento** (`public/simulador.html`):
1. **Paciente e fotos:**
   - Até 4 fotos: rosto de frente sorrindo, lateral esquerda, lateral direita e boca de frente.
   - **Câmera guiada:** contorno de enquadramento e aviso de luz ao vivo, uma foto por vez.
   - **Envio de fotos prontas:** a IA identifica o ângulo de cada uma, endireita se precisar e coloca no lugar certo.
2. **Planejamento:**
   - **Procedimento:** lentes dentais, clareamento ou implantes.
   - **Dentes:** a IA numera os dentes da foto e o doutor marca quais tratar tocando neles numa ampliação da boca, ou pelo mapa.
   - **Opções:** cor (BL1 a A2), formato, comprimento, translucidez, ajustes, gengivoplastia, intensidade e observações.
3. **Simulação:**
   - **Só os dentes marcados mudam:** a IA edita o recorte do sorriso e o app cola o resultado só sobre eles, com alinhamento automático e calibração da cor. Os outros dentes e o rosto continuam com os pixels da foto original.
   - **Resultado:** antes e depois do rosto inteiro e de perto, deslizante ou lado a lado, com várias versões.
4. **Apresentação** (`public/apresentacao.html`):
   - **Conteúdo:** as fotos e a simulação já entram no paciente, junto com exames, odontograma e propostas.
   - **Saída:** modo apresentação, PDF e identidade da clínica.

Os dados dos pacientes ficam guardados no navegador do aparelho (IndexedDB), separados por endereço. Na tela inicial, **Baixar backup** gera um arquivo `.json` com todos os pacientes (fotos incluídas) e as identidades visuais, e **Restaurar backup** traz esse arquivo para outro aparelho ou endereço sem apagar nada. O app lembra o dentista quando o último backup tem mais de 7 dias.

**Privacidade e consentimento:** `public/privacidade.html` e `public/termos.html` são **modelos** que precisam ser revisados por um advogado e completados com os dados da empresa. O cadastro do paciente no simulador exige marcar que o paciente autorizou o uso da imagem (`consentimento: { data, versao }`), e a ficha do paciente imprime o termo de autorização para assinatura e registra a assinatura (`assinado`, `divulgacao`).

## Como rodar

Precisa do [Node.js](https://nodejs.org) 18 ou mais novo. Não há dependências para instalar.

- **Jeito fácil:** dê dois cliques em `INICIAR-DENTALCHECK.bat`. O navegador abre sozinho em http://localhost:5173. Deixe a janela preta aberta enquanto usa.
- **Pelo terminal:** `npm start`

Na versão local o app entra direto, sem tela de ativação.

## Configuração da IA (arquivo `.env`)

O arquivo `.env` na raiz do projeto guarda a chave e nunca é enviado ao navegador:

```
GEMINI_API_KEY=sua-chave-do-google-ai-studio
```

Opcionais:
- `GEMINI_MODELO`: modelos em ordem de preferência. Padrão: `gemini-3.1-flash-image,gemini-2.5-flash-image`
- `LIMITE_IA_DIA`: máximo de simulações por dia (padrão 200), para controlar o custo
- `PORTA`: porta do servidor (padrão 5173)

Sem a chave, o simulador mostra um resultado ilustrativo (só clareia a região) para dar para testar as telas.

A edição de imagem do Gemini **não tem cota gratuita**, então o faturamento precisa estar ativo na conta do Google AI Studio.

## Contas, planos e pagamento

- **Supabase:** login por e-mail e senha, assinaturas, aparelhos, equipe e contador de simulações. A estrutura do banco está em `supabase/migrations/`.
- **E-mails:** veja a seção "E-mails" abaixo.
- **Kiwify:** cada compra, renovação, atraso, cancelamento ou reembolso chega em `POST /api/kiwify` e atualiza a assinatura pelo e-mail do comprador.
- **Limites por plano:** ficam em `server/conta.mjs` (`PLANOS`) e são conferidos no servidor.

Variáveis de ambiente (Vercel → Settings → Environment Variables):
- `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_KEY`. Com as três configuradas, o app passa a exigir login e assinatura.
- `KIWIFY_TOKEN`: o token do webhook, usado para conferir a assinatura dos avisos.
- `KIWIFY_PRODUTOS` (opcional): JSON que liga o id de cada produto ao plano, por exemplo `{"123":"profissional:anual","456":"extra"}`.

Sem as variáveis do Supabase, o app continua no modo de teste com a senha única (`ACESSO_SENHA`).

## E-mails

Todos os e-mails usam o mesmo layout, com a identidade da marca, em `server/email-layout.mjs`. Para mudar o visual, mude só esse arquivo.

| E-mail | Quando sai | Quem envia | Modelo |
|---|---|---|---|
| Boas-vindas | Primeira compra aprovada (aviso da Kiwify) | Servidor, pelo Resend | `modeloBoasVindas` em `server/email.mjs` |
| Confirmar conta | Dentista cria a conta no app | Supabase | `MODELOS_SUPABASE` → `supabase/templates/confirmar-conta.html` |
| Nova senha | "Esqueci minha senha" | Supabase | `MODELOS_SUPABASE` → `supabase/templates/redefinir-senha.html` |

Recibos e cobranças da compra são enviados pela própria Kiwify. O rodapé de todos os e-mails tem links para a Política de Privacidade e os Termos de Uso. Ao mudar o layout, cole de novo os dois modelos no Supabase.

**Para alterar ou criar um e-mail:**
1. Edite o texto em `server/email.mjs`. Um e-mail novo do servidor ganha uma função `modeloX` e uma `emailX`, como as de boas-vindas.
2. Rode `npm run emails -- --previa` e abra `previa-emails/index.html` para conferir todos os e-mails com dados de exemplo.
3. Se mudou um modelo do Supabase, cole o HTML de `supabase/templates/` no painel (passo 3 abaixo).

**Configuração (uma vez):**
1. **Resend:** crie a conta, adicione e verifique o domínio de envio (registros DNS) e gere uma chave de API.
2. **Vercel** → Settings → Environment Variables:
   - `RESEND_API_KEY`: a chave do Resend.
   - `EMAIL_REMETENTE`: por exemplo `DENTALCHECK <ola@seudominio.com.br>`. Precisa ser do domínio verificado.
   - `EMAIL_RESPOSTA` (opcional): para onde vão as respostas, por exemplo o e-mail de suporte.
   - `APP_URL` (opcional): o endereço do app, se for diferente de `https://www.dentalcheck.com.br`. Os links e o logo dos e-mails usam esse endereço.
3. **Supabase** → Authentication → Emails:
   - **Templates:** em "Confirm signup" e "Reset password", cole o HTML do arquivo correspondente e use o assunto que o `npm run emails` mostra.
   - **SMTP Settings:** ative o SMTP próprio com o Resend (host `smtp.resend.com`, porta `465`, usuário `resend`, senha = a chave do Resend, remetente igual ao `EMAIL_REMETENTE`). Sem isso, o Supabase envia de um remetente genérico e só poucos e-mails por hora.

## Estrutura

```
INICIAR-DENTALCHECK.bat   abre o app com dois cliques (Windows)
server/
  servidor.mjs            servidor local: entrega as páginas e chama a IA (/api/simular, /api/localizar,
                          /api/analisar-foto, /api/dentes)
  prompt-sorriso.mjs      transforma o planejamento do doutor nas instruções para a IA
public/                   o app (HTML, CSS e JS)
  index.html              tela inicial: novo procedimento e pacientes
  simulador.html          novo procedimento: fotos → planejamento → simulação
  apresentacao.html       pacientes, apresentação e PDF
  assets/                 estilos, banco local, dados dos dentes
  sw.js                   cache para abrir sem internet
scripts/gerar-icones.mjs  gera os PNG dos ícones
```

## Próximas etapas sugeridas

- Página de vendas.
- Hospedagem online, ativação por compra (e-mail e telefone, limite de aparelhos) e integração com a Kiwify.
