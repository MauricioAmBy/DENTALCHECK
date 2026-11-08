# DENTALCHECK — anúncio Reels "Vou pensar"

GOAL:    o dentista se reconhece no "vou pensar", vê o fluxo real (fotos → dentes → simulação → apresentação) e sai com
         "o paciente vê o sorriso antes de dizer sim" e a garantia de 7 dias.
OUTPUT:  HyperFrames, 1080 x 1920 (9:16, Reels), 30 fps.
TIME:    ~41 s. A narração (VoiceStudio, mulher adulta, pt-BR, frase por frase) é o relógio: cada cena começa na
         sua frase e o texto aparece na palavra que o diz.
LOOK:    grounds da página de vendas: sky #f3f8fb (gancho, app), mint #dff5f2 (dúvida), teal #0b9e96 (revelação, inundação),
         foto em tela cheia (resultado), navy #0c2440 → #16365c só no cartão final (como o rodapé da página).
         Tinta navy #0c2440 / ink #10233a; muted #5d6f84. Acento aqua #4fd1c5 / teal: uma palavra por plano,
         dentes marcados, botão principal.
         Tipo: Plus Jakarta Sans (a fonte do site). Títulos 800, 96–132 px, tracking -2%; UI 600–700, 34–44 px; legendas 700, 46 px.
         Meio: a interface real do app (cartões brancos raio 22 px, sombra 0 24 60 -30 rgba(12,36,64,.45), botões pílula),
         fotos reais da paciente fictícia Maria e os slides reais da apresentação. Sem grão, sem vinheta.
OBJECTS: foto da Maria (rosto e boca, antes/depois), câmera guiada (contorno oval tracejado + aviso de luz),
         chips de numeração FDI (13 12 11 21 22 23) sobre os dentes, escala de cor (BL1 BL2 BL3 A1 A2),
         botão "✨ Gerar simulação com IA", comparador com divisória e alça ⇆, slides reais, balão de conversa com o PDF,
         o selo do app (logo.svg) e a palavra DENTALCHECK.
MOTION:  chegadas expo.out / power4.out 0.5–0.7 s; câmera e inundação de cor power2.inOut 0.4–0.6 s; saídas power3.in, 40% mais curtas.
         Molas (back.out 1.4) só em chips e badges. Palavras com stagger 0.07 s. Títulos parados depois de pousar.
SHOTS (tempos finais no index.html, ancorados nas frases l1–l12):
  1 gancho (l1–l3): Maria sorrindo (antes) ocupa a banda; "Você explica tudo…" em tipo grande; o balão "Vou pensar."
    surge com pop; em "E não volta" o cartão de retorno "Maria · Retorno" é riscado (knock) e a foto perde a cor.
  2 duvida (l4): fundo mint; o sorriso fica fosco sob um vidro e a palavra "imaginar" gira entre opções (slot) até "imaginar o resultado"? → o vidro se abre num círculo.
  3 revela (l5): o círculo do vidro vira a inundação teal; o título "antes de dizer sim" pousa por palavra; a barra de etapas do app (1 Foto · 2 Planejamento · 3 Simulação · 4 Apresentação) entra e leva ao app.
  4 fotos (l6): câmera guiada com o rosto, contorno oval e "Luz boa ✓"; toque no obturador (shutter); as 4 fotos voam para a grade organizada com seus rótulos.
  5 plano (l7): close da boca (antes) a 2×; chips FDI aparecem um a um (tone-step 1–5); o cursor toca 11, 21, 12, 22 (taps) e eles ficam teal; o painel sobe com "Lentes dentais · Porcelana" e a escala de cor, BL2 tocado.
  6 gera (l8a): toque em "✨ Gerar simulação com IA"; scan sobre o sorriso, "Analisando o sorriso…" com barra.
  7 resultado (l8b–l9): riser → a divisória varre do antes para o depois no close (shimmer); recua para o rosto inteiro com comparador; chip "Só os dentes marcados mudam".
  8 apresentacao (l10): os slides reais caem em pilha (whoosh), passam 3; botão "Compartilhar PDF"; balão de conversa com o PDF enviado (message-out).
  9 promessa (l11): rosto depois em tela cheia; "Mostre hoje" pousa em tipo gigante.
  10 final (l12 + 2.5 s): navy; o selo entra e o check desenha; DENTALCHECK abre por máscara; selo "Garantia de 7 dias"; botão "Teste agora"; sting-warm-short.
  Legendas: frase falada em uma pílula navy 46 px, na base da banda (y 1180–1320), sempre.
BANNED:  vazio escuro com coisas pequenas flutuando; brilho, partículas, gradiente roxo; tudo centralizado e subindo com fade;
         três cartões lado a lado; logo no canto; texto que se move enquanto é lido; nomear o provedor de IA;
         promessas fora da página de vendas (nada de "20× mais vendas"); interface inventada (só rótulos reais do app).
QA:      t=0 (thumbnail com rosto + frase), cada fronteira de cena ±0.1 s, o pico do comparador, o cartão final aos 39 s;
         nada de texto abaixo de 1330 px fora da legenda; legenda legível no celular; som medido (picos onde a imagem bate, −14 a −16 LUFS).
