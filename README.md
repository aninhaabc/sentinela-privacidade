# Sentinela de Privacidade

Extensão acadêmica para Firefox desenvolvida para a Avaliação Intermediária de
Cibersegurança do Insper.

## Estado atual

Primeiro incremento do projeto:

- extensão em Manifest V3;
- popup funcional;
- identificação da página atualmente aberta;
- estrutura preparada para receber os detectores de privacidade.

## Carregar temporariamente no Firefox

1. Abra `about:debugging` no Firefox.
2. Clique em **Este Firefox**.
3. Clique em **Carregar extensão temporária**.
4. Selecione o arquivo `manifest.json` desta pasta.
5. Abra um site comum e clique no ícone da extensão.

O popup deve apresentar o título e a URL da aba atual, além da indicação
**Extensão carregada**.

## Observação

A instalação feita pelo `about:debugging` é temporária e será removida quando o
Firefox for fechado. Esse comportamento é esperado durante o desenvolvimento.

## Próximas etapas

- detectar requisições para domínios de terceiros;
- contar e classificar cookies;
- detectar armazenamento HTML5;
- identificar fingerprinting, bounce tracking e indicadores de hijacking;
- calcular a pontuação de privacidade;
- permitir uma lista de bloqueio personalizada.
