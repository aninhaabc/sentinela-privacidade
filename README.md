# Sentinela de Privacidade

Extensão acadêmica para Firefox desenvolvida para a Avaliação Intermediária de
Cibersegurança do Insper.

## Estado atual

Estado atual do projeto:

- extensão em Manifest V3;
- popup funcional com atualização automática;
- identificação da página atualmente aberta;
- detecção de requisições para domínios de terceiros;
- contagem de requisições e listagem dos domínios observados.

## Carregar temporariamente no Firefox

1. Abra `about:debugging` no Firefox.
2. Clique em **Este Firefox**.
3. Clique em **Carregar extensão temporária**.
4. Selecione o arquivo `manifest.json` desta pasta.
5. Abra um site comum e clique no ícone da extensão.

Após carregar a extensão, abra uma página e recarregue-a. O popup deve apresentar
o total de requisições observadas, a quantidade classificada como terceira parte
e a lista dos domínios terceiros encontrados.

## Observação

A instalação feita pelo `about:debugging` é temporária e será removida quando o
Firefox for fechado. Esse comportamento é esperado durante o desenvolvimento.

## Próximas etapas

- contar e classificar cookies;
- detectar armazenamento HTML5;
- identificar fingerprinting, bounce tracking e indicadores de hijacking;
- calcular a pontuação de privacidade;
- permitir uma lista de bloqueio personalizada.
