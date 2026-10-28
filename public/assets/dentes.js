/* DENTALCHECK — dados dos 32 dentes permanentes (notação FDI) */
(function () {
  const TIPOS = {
    1: { nome: "Incisivo central", grupo: "incisivo", raizes: 1,
         desc: "Dente de borda cortante fina, protagonista do sorriso. Corta os alimentos e define a linha média e o comprimento visível dos dentes na fala." },
    2: { nome: "Incisivo lateral", grupo: "incisivo", raizes: 1,
         desc: "Menor e mais delicado que o central, com bordas arredondadas. Variações de forma e agenesia deste dente são comuns e impactam a estética." },
    3: { nome: "Canino", grupo: "canino", raizes: 1,
         desc: "Tem a raiz mais longa da boca e cúspide pontiaguda. Guia os movimentos laterais da mandíbula (guia canina) e sustenta o canto do sorriso." },
    4: { nome: "Primeiro pré-molar", grupo: "premolar", raizes: 2,
         desc: "Possui duas cúspides (vestibular e palatina/lingual). Faz a transição entre cortar e triturar. No superior costuma ter duas raízes." },
    5: { nome: "Segundo pré-molar", grupo: "premolar", raizes: 1,
         desc: "Semelhante ao primeiro pré-molar, com cúspides de tamanho mais equilibrado. Geralmente tem uma raiz e participa da trituração." },
    6: { nome: "Primeiro molar", grupo: "molar", raizes: 3,
         desc: "Maior dente da arcada e chave da oclusão. Erupciona por volta dos 6 anos. Superior com três raízes, inferior com duas." },
    7: { nome: "Segundo molar", grupo: "molar", raizes: 3,
         desc: "Erupciona por volta dos 12 anos. Coroa um pouco menor que a do primeiro molar, com papel importante na mastigação." },
    8: { nome: "Terceiro molar (siso)", grupo: "molar", raizes: 2,
         desc: "Último a erupcionar (17–25 anos). Forma e posição muito variáveis; frequentemente fica incluso ou é indicado para extração." }
  };
  const QUADRANTES = { 1: "superior direito", 2: "superior esquerdo", 3: "inferior esquerdo", 4: "inferior direito" };

  const LISTA = [];
  for (const q of [1, 2, 3, 4]) for (let i = 1; i <= 8; i++) {
    const n = q * 10 + i, t = TIPOS[i];
    let raizes = t.raizes;
    if (q >= 3) raizes = i >= 6 ? 2 : 1;          // inferiores: molares com 2 raízes, demais com 1
    LISTA.push({ n, q, i, superior: q <= 2, nome: t.nome, grupo: t.grupo, raizes, desc: t.desc, lado: QUADRANTES[q] });
  }

  /* situações do odontograma */
  const STATUS = [
    { id: "higido",     nome: "Hígido",              cor: "#ffffff" },
    { id: "carie",      nome: "Cárie",               cor: "#d64545" },
    { id: "restauracao",nome: "Restauração",         cor: "#2f7bd9" },
    { id: "trocar",     nome: "Restauração a trocar",cor: "#e07b24" },
    { id: "canal",      nome: "Tratamento de canal", cor: "#8e44ad" },
    { id: "coroa",      nome: "Coroa / prótese",     cor: "#d4a017" },
    { id: "implante",   nome: "Implante",            cor: "#4b5b6e" },
    { id: "extracao",   nome: "Indicado extração",   cor: "#9b1c1c" },
    { id: "ausente",    nome: "Ausente",             cor: "#c9d3de" },
    { id: "estetica",   nome: "Ajuste estético",     cor: "#0b9e96" },
    { id: "observar",   nome: "Observar",            cor: "#f2c94c" }
  ];

  window.DENTES = {
    LISTA, STATUS,
    porNumero: n => LISTA.find(d => d.n === Number(n)),
    status: id => STATUS.find(s => s.id === id) || STATUS[0],
    nomeCompleto: n => { const d = LISTA.find(x => x.n === Number(n)); return d ? `${d.nome} ${d.lado}` : "Dente " + n; },
    /* ordem visual do odontograma (como o profissional olha para o paciente) */
    ORDEM_SUP: [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28],
    ORDEM_INF: [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38]
  };
})();
