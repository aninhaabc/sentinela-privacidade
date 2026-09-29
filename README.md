# Sentinela de Privacidade

Extensao academica para Firefox desenvolvida para a Avaliacao Intermediaria de Ciberseguranca do Insper.

## Objetivo

O Sentinela observa a pagina atualmente aberta e apresenta, em um unico painel, indicadores de privacidade e rastreamento. A versao entregue para a avaliacao cobre:

- conexoes de primeira e terceira parte;
- dominios de terceiros e quantidade de requisicoes observadas;
- cookies de primeira/terceira parte e de sessao/persistentes;
- armazenamento HTML5: `localStorage`, `sessionStorage` e `IndexedDB`;
- parametros de rastreamento, bounce tracking e sinais de cookie sync;
- uso de APIs de canvas associado a fingerprinting;
- indicadores heurisiticos de hijacking/hooks: WebSocket, polling persistente, alteracao de objetos globais e scripts de terceiros inseridos;
- pontuacao de privacidade por pagina;
- lista de bloqueio personalizada.

> **Importante:** os indicadores de hijacking/hooks sao heuristicas. Um sinal detectado nao significa, isoladamente, que o comportamento seja malicioso; ele indica uma atividade que merece analise contextual do trafego e da pagina.

## Estrutura

```text
sentinela-privacidade/
|-- background/
|   `-- background.js
|-- content/
|   |-- canvas-bridge.js
|   |-- canvas-page.js
|   |-- hijacking-bridge.js
|   |-- hijacking-page.js
|   `-- storage-detector.js
|-- popup/
|   |-- popup.html
|   |-- popup.css
|   `-- popup.js
|-- evidencias/
|   |-- ddg/                 # DuckDuckGo Privacy Test Pages
|   |-- desenvolvimento/    # evidencias de desenvolvimento
|   |-- har/                 # HAR dos tres sites reais
|   `-- sites-reais/         # Sentinela, Blacklight e uBlock
|-- manifest.json
`-- README.md
```

## Carregamento no Firefox

A extensao usa Manifest V3 e e carregada temporariamente durante o desenvolvimento.

1. Abra `about:debugging` no Firefox.
2. Selecione **Este Firefox**.
3. Clique em **Carregar extensao temporaria**.
4. Selecione `manifest.json` desta pasta.
5. Abra a pagina que deseja analisar.
6. Recarregue a pagina para iniciar o monitoramento.
7. Clique no icone do Sentinela para abrir o relatorio.

A extensao temporaria e removida quando o Firefox e fechado; isso e esperado neste fluxo de desenvolvimento.

## O que o popup mostra

### Rede

O Sentinela conta as requisicoes observadas na aba e separa as que pertencem ao dominio da pagina das que pertencem a terceiros. Tambem lista os dominios terceiros com a quantidade de requisicoes.

A classificacao usa o dominio raiz do site, com tratamento para sufixos compostos como `com.br`, `edu.br`, `co.uk` e outros casos explicitamente configurados em `background.js`.

### Cookies

A contagem usa os cabecalhos `Set-Cookie` observados pelo `webRequest`. Tentativas de delecao sao ignoradas. Cada cookie e classificado por:

- primeira ou terceira parte, conforme o dominio que respondeu ao request;
- sessao ou persistente, usando `Max-Age`/`Expires`.

Como a contagem e feita sobre observacoes de headers, escritas repetidas do mesmo cookie podem aparecer como varias ocorrencias na janela monitorada.

### Armazenamento HTML5

O detector consulta periodicamente:

- `localStorage.length`;
- `sessionStorage.length`;
- quantidade de bancos retornados por `indexedDB.databases()`.

O popup agrega as origens que possuem algum desses dados.

### Canvas fingerprinting

O detector observa chamadas a:

- `HTMLCanvasElement.toDataURL()`;
- `HTMLCanvasElement.toBlob()`;
- `CanvasRenderingContext2D.getImageData()`;
- `WebGLRenderingContext.readPixels()` e `WebGL2RenderingContext.readPixels()`;
- imagens `data:image/...` suficientemente longas no DOM.

O objetivo e sinalizar o uso de APIs que podem ser utilizadas na construacao de uma identificacao de navegador/dispositivo. O detector nao afirma sozinho a finalidade desse uso.

### Rastreamento por navegacao

Sao observados parametros como `utm_*`, `fbclid`, `gclid`, `dclid`, `msclkid`, `ttclid`, `mc_eid`, `uid`, `user_id`, `userid`, `click_id`, `client_id`, `cid`, `isnew` e nomes `bounceuid*`.

Bounce tracking e sinalizado quando ha uma cadeia de navegacao entre dominios e identificadores associados a bounce, incluindo o caso parcial em que o monitoramento comeca no dominio intermediario.

Cookie sync e sinalizado quando um mesmo identificador aparece associado a dominios diferentes, quando ha endpoints com padroes de sincronizacao ou quando um identificador de bounce e retransmitido ao destino.

### Hijacking / hooks

O painel registra quatro classes de sinais:

- WebSockets de terceiros;
- polling persistente para endpoints de terceiros;
- alteracoes de objetos globais monitorados (`fetch`, `XMLHttpRequest`, `WebSocket`, timers, `addEventListener` e `createElement`);
- scripts de terceiros observados sendo inseridos no DOM.

Esses eventos sao heuristicas de seguranca do navegador. Uso de `fetch`, timers ou scripts de terceiros pode ser perfeitamente legitimo.

### Pontuacao de privacidade

A pontuacao parte de 100 e aplica penalidades limitadas por categoria:

| Categoria | Limite | Regra |
|---|---:|---|
| Conexoes externas | 20 | 2 pontos por dominio terceiro + 0,5 por requisicao terceira parte |
| Cookies | 20 | 4 pontos por cookie terceiro + 1 por cookie persistente |
| Armazenamento | 10 | 2 por origem com storage + 1 por entrada/banco |
| Canvas fingerprinting | 10 | 10 pontos quando existe pelo menos uma leitura |
| Rastreamento por navegacao | 20 | 1 por parametro + 8 por bounce + 8 por cookie sync |
| Hijacking e hooks | 20 | 5 por host WebSocket + 6 por polling + 8 por global alterado + 2 por script terceiro |

A pontuacao final e `max(0, 100 - penalidade_total)`.

Classificacao visual:

- `80-100`: Boa
- `60-79`: Atencao
- `0-59`: Critica

## Lista de bloqueio personalizada

O usuario pode adicionar um dominio ao painel. O dominio e normalizado para hostname e o bloqueio se aplica ao proprio dominio e a seus subdominios. O estado da lista e persistido em `browser.storage.local`.

Depois de adicionar um dominio, recarregue a pagina para observar os requests bloqueados. O popup contabiliza o numero de requests cancelados pela lista personalizada.

## Evidencias

### DuckDuckGo Privacy Test Pages

As evidencias estao em `evidencias/ddg/` e cobrem:

- Query Parameters;
- Bounce Tracking;
- JS Leaks / hijacking;
- Storage Blocking;
- Fingerprinting / Canvas;
- Tracker Blocking;
- Storage Partitioning.

O relatorio final consolidado explica, teste a teste, o que a pagina reporta, o que o Sentinela observa e por que os indicadores nao sao necessariamente equivalentes.

### Sites reais

Tres sites possuem HAR e capturas de Sentinela, Blacklight e uBlock Origin:

- `evidencias/sites-reais/g1/` + `evidencias/har/g1-sem-bloqueio.har`
- `evidencias/sites-reais/insper/` + `evidencias/har/insper-sem-bloqueio.har`
- `evidencias/sites-reais/mercadoLivre/` + `evidencias/har/mercado-livre-sem-bloqueio.har`

Os valores do popup representam uma janela de monitoramento da extensao. Os HARs sao registros de uma captura do DevTools e podem ter uma quantidade diferente de entradas. Por isso, o relatorio final separa explicitamente os numeros do popup dos numeros brutos do HAR.

## Comparacao com Blacklight e uBlock

Os tres instrumentos observam camadas diferentes:

- **Sentinela:** observa trafego, cookies, storage e APIs diretamente no Firefox;
- **Blacklight:** aplica uma metodologia propria para identificar categorias de vigilancia, incluindo ad trackers e cookies de terceiros;
- **uBlock Origin:** mostra requests bloqueados e conexoes conforme as listas/regras de filtros ativas.

Por isso, `dominio terceiro`, `ad tracker` e `request bloqueado` nao sao sinonimos. O relatorio final compara as ferramentas por dimensao e explica as divergencias sem tratar os contadores como metricas diretamente intercambiaveis.

## Resultados registrados nos tres sites

| Site | Sentinela | Blacklight | uBlock Origin |
|---|---|---|---|
| G1 | 494 requests; 420 terceiros; 105 dominios terceiros; 96 cookies; score 10 | 27 ad trackers; 14 cookies terceiros; X e Google Analytics detectados | 61 bloqueios na pagina (16%); 6 dominios conectados de 25 |
| Insper | 175 requests; 160 terceiros; 40 dominios terceiros; 6 cookies; score 0 | 15 ad trackers; 26 cookies terceiros; session recorder Hotjar; Facebook/TikTok/Google Analytics | 15 bloqueios na pagina (14%); 12 dominios conectados de 20 |
| Mercado Livre | 122 requests; 119 terceiros; 6 dominios terceiros; 23 cookies; score 21 | 11 ad trackers; 16 cookies terceiros; Facebook/TikTok/X | 27 bloqueios na pagina (5%); 8 dominios conectados de 10 |

Os numeros acima sao os das capturas selecionadas para o relatorio. O comportamento observado pode variar com horario, estado de consentimento, conteudo dinamico, perfil do navegador e listas de filtros.
