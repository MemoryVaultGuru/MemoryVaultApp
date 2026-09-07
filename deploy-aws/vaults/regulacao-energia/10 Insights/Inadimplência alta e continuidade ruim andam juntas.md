---
title: Inadimplência alta e continuidade ruim andam juntas
aliases:
  - Associação entre inadimplência e qualidade
  - Os dois critérios do serviço adequado não são independentes
tags:
  - aneel
  - qualidade
  - inadimplencia
  - concessoes
  - sustentabilidade-economica
  - insight
type: insight
maturity: seed
reviewed: false
source: "[[Evolução da Inadimplência Definitiva das Distribuidoras (2020–2025)]]"
author: Análise própria (assistida por IA)
created: 2026-07-27
updated: 2026-07-27
refresh_frequency: quarterly
data_source: https://dadosabertos.aneel.gov.br/dataset/indqual-inadimplencia
coverage: 2020-01 a 2025-12
---

> [!abstract]
> Distribuidoras no quartil superior de inadimplência definitiva têm, em média, 38,0% dos conjuntos acima do limite de continuidade, contra 20,8% no quartil inferior. Os dois critérios que o Decreto 12.068/2024 usa para aferir serviço adequado — continuidade e gestão econômico-financeira — não são independentes entre si.

> [!info] Leitura feita em 2026-07-27 · Baseada em: [[Evolução da Inadimplência Definitiva das Distribuidoras (2020–2025)]], [[Transgressão dos Limites Coletivos de Continuidade]] · Cadência de revisão: trimestral

## O achado

Cruzando, por distribuidora e ano (2020–2025, 210 observações de 36 concessionárias com dez ou mais conjuntos), a inadimplência definitiva `ITot24` com as medidas de continuidade:

| Par                                            | Spearman ρ |     p-valor |
| ---------------------------------------------- | ---------: | ----------: |
| DEC médio dos conjuntos × inadimplência        |  **0,412** | 5,0 × 10⁻¹⁰ |
| % de conjuntos em transgressão × inadimplência |      0,230 |  7,7 × 10⁻⁴ |
| Razão apurado/limite (mediana) × inadimplência |      0,281 |  3,5 × 10⁻⁵ |

Agregando por concessionária (média dos seis anos, n = 36), a associação persiste (ρ = 0,316) mas perde significância convencional (p = 0,060) — o que era esperado com 36 pontos.

Em termos diretos:

| Grupo (por inadimplência média 2020–2025) | Conjuntos em transgressão (média) |
|---|---:|
| Quartil inferior (`ITot24` ≤ 0,58%) | 20,8% |
| Quartil superior (`ITot24` ≥ 2,79%) | **38,0%** |

As concessionárias que aparecem nos dois topos são as mesmas: ENEL RJ, LIGHT SESA, EQUATORIAL PA, EQUATORIAL MA, ENEL CE, ELETROPAULO, CEEE-D.

## Evidência

| Nota de contexto | O que ela mostra |
|---|---|
| [[Evolução da Inadimplência Definitiva das Distribuidoras (2020–2025)]] | `ITot24` por distribuidora e ano; cauda longa com meia dúzia de concessionárias muito acima da mediana |
| [[Transgressão dos Limites Coletivos de Continuidade]] | Taxa de transgressão e DEC médio por distribuidora e ano |
| [[A transgressão crônica se concentra e não muda de dono]] | As distribuidoras do topo da transgressão são estáveis no período — as mesmas do topo da inadimplência |

Recorte consumido: `data/processed/painel_completo_distribuidora_ano.csv`.

## Confronto com a norma

O achado tensiona [[Serviço Adequado (Distribuição)]].

O Decreto 12.068/2024, art. 2º, § 1º, define dois critérios de eficiência — continuidade (§ 2º) e gestão econômico-financeira (§ 3º) — e os trata como testes **separados**, com tolerâncias diferentes: três anos de descumprimento em continuidade, dois no financeiro. O desenho pressupõe independência: uma concessionária pode falhar num e passar no outro.

O dado diz que, na prática, os dois falham juntos. Isso tem duas consequências para o rito do decreto: a probabilidade de reprovação simultânea é maior do que a de dois eventos independentes, e o remédio previsto para cada falha — [[Aporte de Capital na Concessão]] para a financeira, [[Plano de Resultados]] para a de continuidade — pode estar atacando duas faces do mesmo problema com dois instrumentos desconectados.

> [!warning] Associação não é causalidade, e aqui há confundidor óbvio
> A renda da área de concessão explica plausivelmente **as duas** variáveis ao mesmo tempo: áreas de baixa renda têm mais inadimplência e, tipicamente, redes mais precárias e mais sujeitas a furto de energia. Nada nesta nota permite dizer que a inadimplência degrada a qualidade, nem o contrário.

## Hipóteses alternativas

| Hipótese | O que descartaria |
|---|---|
| **Confundidor socioeconômico** — renda e densidade da área de concessão causam ambas | Controlar por PIB per capita e por percentual de consumidores da subclasse residencial baixa renda. Os dados de baixa renda estão fichados em [[SCS - Sistema de Controle de Subvenções e Programas Sociais (ANEEL)]], ainda não coletados |
| **Causalidade financeira → qualidade** — receita que não entra vira investimento que não acontece | Testar defasagem: inadimplência de t−2 contra continuidade de t, controlando por investimento realizado ([[PDD - Plano de Desenvolvimento da Distribuição (ANEEL)]]) |
| **Causalidade qualidade → financeira** — serviço ruim reduz disposição a pagar e alimenta contestação de fatura | Testar a defasagem inversa e cruzar com reclamações de 1º e 2º nível |
| **Efeito de composição regional** — Norte e Nordeste concentram as duas piores posições por razões geográficas, não de gestão | Estimar o efeito dentro de cada região. Com 36 concessionárias, o poder estatístico é baixo |
| **Espúria por escala** — grandes distribuidoras urbanas dominam as duas caudas | Repetir com peso por número de unidades consumidoras. A série de UCs por distribuidora só existe a partir de 2023 no INDGER |

## O que invalidaria esta leitura

1. **A associação desaparecer ao controlar por renda da área de concessão.** É o teste decisivo e não foi feito — por isso esta nota está `seed`, não `growing`.
2. **A associação vier de poucos pontos extremos.** Spearman é robusto a outliers em nível, mas não a um pequeno grupo que ocupe simultaneamente o topo dos dois rankings. Remover as cinco concessionárias mais extremas e refazer é um teste de robustez pendente.
3. **`ITot24` não representar o critério do decreto.** O art. 2º, § 3º fala em capacidade de honrar compromissos de forma sustentável, operacionalizada pela ANEEL em indicador próprio. `ITot24` é proxy, e um proxy que erra o alvo derruba a ponte com a norma — restaria uma correlação sem consequência regulatória.

> [!question]
> Qual é o indicador que a ANEEL efetivamente usa para aferir o critério de gestão econômico-financeira do art. 2º, § 3º do Decreto 12.068/2024, e ele está publicado em dados abertos? Enquanto a resposta não vier, toda leitura sobre esse critério é feita por proxy.

---

Fonte: [[Evolução da Inadimplência Definitiva das Distribuidoras (2020–2025)]], [[Transgressão dos Limites Coletivos de Continuidade]] · Ref: [[Serviço Adequado (Distribuição)]], [[Caducidade da Concessão de Distribuição]]
