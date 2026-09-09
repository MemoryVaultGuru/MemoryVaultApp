---
title: Revisão Técnica, de Negócio e de UX
type: practice
tags: [estimation, risk-management, business-value]
maturity: evergreen
reviewed: true
---
Após o brainstorming, cada funcionalidade é avaliada sob três perspectivas para auxiliar na priorização e planejamento.

## Gráfico do Semáforo (Confiança)

Avalia o nível de incerteza técnica e de negócio:

- **Verde**: Alta confiança (sabemos o que fazer e como fazer).
- **Amarelo**: Confiança média.
- **Vermelho**: Baixa confiança (alto risco/incerteza).

## Tabela de Esforço e Valor

As funcionalidades recebem marcações em uma escala de 1 a 3:

- **Esforço (E, EE, EEE)**: Nível de trabalho necessário.
- **Valor de Negócio ($V, $VV, $VVV)**: Retorno ou economia prevista.
- **Valor de UX (❤️, ❤️❤️, ❤️❤️❤️)**: Quanto os usuários vão amar a funcionalidade.

```mermaid
graph LR
    A[Brainstorming] --> B[Gráfico Semáforo]
    B --> C[Tabela E/$]
    C --> D[Sequenciador]
````