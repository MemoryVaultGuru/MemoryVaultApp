---
title: Safra 2026 · Serra Gaúcha
aliases: [Safra 2026]
tags: [safra, registro]
tipo: registro
maturity: evergreen
reviewed: true
regiao: Serra Gaúcha
autor: Enologia
created: 2026-03-02
updated: 2026-04-12
colhida_em: 2026-02-24
resumo: Registro completo da safra 2026 na Serra Gaúcha, com a curva de maturação, a decisão de colheita e o que mudou no protocolo.
---

A safra em que a chuva chegou antes do IPT. O registro existe para que a
decisão tomada com pressa possa ser lida com calma no ano seguinte.

> [!tip] O registro é a medida
> Tudo em [[Vinificação em tinto]] é intenção até uma página como esta trazer
> um número.

## Curva

| Semana | °Brix | IPT | Nota |
| --- | --- | --- | --- |
| 3 fev | 19,4 | 38 | Casca ainda verde |
| 10 fev | 21,1 | 47 | Curva subindo |
| 17 fev | 22,0 | 55 | Chuva anunciada |
| 24 fev | 22,3 | 58 | Antecipada, contra [[Vinificação em tinto]] |

Colhemos com IPT 58 e não com os 62 de
[[Índice de Polifenóis Totais#^faixa-de-guarda]]. ^decisao-2026

A meta escrita no protocolo era ~~62~~ 58 depois da chuva do dia 17, e o
número riscado é o que valia quando a safra começou. O boletim que anunciou a
chuva está em https://boletim.example.org/serra-gaucha, fora deste vault: um
endereço solto é link na página e nunca aresta no grafo.

## O que deu errado

A remontagem do dia 26 foi feita por calendário, e não pela curva. O passo 4 do
protocolo ganhou a frase que faltava por causa disso.

A perda de estrutura estimada foi de $4\%$ sobre a média das três safras
anteriores, calculada como

$$P = 1 - \frac{IPT_{colheita}}{IPT_{alvo}}$$

## O que tentamos escrever e não deu

- **Fórmula com subscrito.** `H~2~O` e `m^2^` não têm significado neste
  perfil: ficam na página exatamente com esses caracteres. Escreva o caractere
  real, ou uma fórmula: $H_2O$ e $m^2$.
- **Um aviso em HTML.** `<div class="aviso">` é guardado e mostrado como
  texto, nunca renderizado. Use um callout, como esta página faz acima.
- **Um resumo no frontmatter.** O `resumo` lá em cima passa de quarenta
  caracteres, então é lido e descartado em vez de virar uma categoria de um
  item só. O mesmo vale para `title`, que aqui é atributo comum e não renomeia
  nada.

Relacionado: [[Cabernet Sauvignon#Na Serra Gaúcha]].
