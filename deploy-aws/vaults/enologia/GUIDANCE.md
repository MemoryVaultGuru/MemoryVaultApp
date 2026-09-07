# Enologia

> [!info]
> Castas, protocolos de vinificação e o registro de cada safra. O que se mede,
> o que se decide com a medida, e o que aconteceu de verdade.

## Regras de escrita

1. **Casta descreve o que a planta é**; protocolo descreve o que se faz com
   ela. Se a nota mistura os dois, são duas notas.
2. **Protocolo é escrito para quem chega na safra sem ter feito a anterior**, e
   todo passo que exige julgamento linka a página que explica o critério.
3. **Safra é registro e não opinião.** É onde os números entram, e é a única
   página que pode afirmar um resultado.
4. Decisão tomada contra o protocolo se escreve na safra, com o motivo.

## Frontmatter obrigatório

`title`, `aliases`, `tags`, `tipo` (`casta` | `medida` | `protocolo` |
`registro`), `maturity` (`seed` | `growing` | `evergreen`, reavaliada a cada
escrita), `reviewed` (`true` somente após revisão humana da revisão vigente;
qualquer edição posterior de conteúdo devolve a `false`), `regiao`, `autor`,
`created`, `updated`.

**As quatro chaves reservadas são escritas em en-US mesmo aqui**: `aliases`,
`tags`, `created` e `updated`. O resto do vocabulário é o desta casa —
`regiao`, `tipo`, `autor`, `colhida_em` — e o produto não traduz nenhuma
delas. A interface pode mostrar o rótulo das reservadas em português; os bytes
do arquivo nunca mudam.

## A notação deste vault

Tudo aqui é o MemorySmith Markdown Profile, e nada neste vault usa nada fora
dele. Dois hábitos merecem ser nomeados porque as pessoas chegam com eles:

- **Um assunto escrito no corpo como `#tinta` não arquiva nada.** É texto
  comum. Assunto mora em `tags:`; assunto que merece página própria vira
  `[[wikilink]]`.
- **HTML bruto não é renderizado.** É guardado e mostrado como texto, e isso é
  fronteira de segurança, não preferência. Escreva um callout.
- **Não existe notação para subscrito nem sobrescrito**, nem para nada mais que
  o perfil não liste: pode até ser desenhado na página, e nunca significa nada.
  Escreva uma fórmula.
