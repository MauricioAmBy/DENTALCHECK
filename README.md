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

Os dados dos pacientes ficam guardados no navegador do computador (IndexedDB).

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
- **E-mail de boas-vindas:** enviado pelo app na primeira ativação (`server/email.mjs`, Resend). Variáveis: `RESEND_API_KEY`, `EMAIL_REMETENTE` e, opcional, `EMAIL_RESPOSTA`.
- **Kiwify:** cada compra, renovação, atraso, cancelamento ou reembolso chega em `POST /api/kiwify` e atualiza a assinatura pelo e-mail do comprador.
- **Limites por plano:** ficam em `server/conta.mjs` (`PLANOS`) e são conferidos no servidor.

Variáveis de ambiente (Vercel → Settings → Environment Variables):
- `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_KEY`. Com as três configuradas, o app passa a exigir login e assinatura.
- `KIWIFY_TOKEN`: o token do webhook, usado para conferir a assinatura dos avisos.
- `KIWIFY_PRODUTOS` (opcional): JSON que liga o id de cada produto ao plano, por exemplo `{"123":"profissional:anual","456":"extra"}`.

Sem as variáveis do Supabase, o app continua no modo de teste com a senha única (`ACESSO_SENHA`).

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
