# ArquipelagoVR

Arquipélago: jogo de tabuleiro em VR para o Meta Quest 3 no navegador (WebXR), sem instalar nada.
Uma mesa redonda num quiosque de praia ao entardecer, com uma bandeja hexagonal cheia de mar de
verdade (água animada). Cada um tira peças hexagonais do saquinho (praia, floresta, montanha, sozinhas
ou em dupla, com alturas diferentes), gira e encaixa no mar, montando ilhas, e põe cabanas para mandar
nelas. A maré sobe a cada rodada e, quando enche, afunda as praias (e depois as florestas), partindo
ilhas e afogando cabanas. No fim conta o tamanho das ilhas de cada um. Você contra 1 ou 2
computadores (3 adversários com personalidade), 3 mapas. Também joga no PC com mouse e teclado.
Tudo em português.

## Como rodar / jogar

**No Quest:** abrir no navegador do óculos **https://parappathe.github.io/ArquipelagoVR/** (ou a página
inicial https://parappathe.github.io/) e apertar "Entrar em VR". Para atualizar o site: commitar e
rodar `python publicar.py ArquipelagoVR` na pasta `C:\claude code`.

**No PC:** `python serve.py` nesta pasta e abrir `http://localhost:8824` (o painel de visualização usa
`.claude/launch.json`). O `serve.py` manda o navegador não guardar cache; `python serve.py --https`
serve para abrir no Quest pela rede de casa (porta 8443).

### Controles

| | VR (Quest) | PC |
|---|---|---|
| Pegar uma peça da sua bandeja | Aperto (botão lateral) ou pinça da mão com a mão a até 8 cm da peça; ou apontar o laser e apertar o gatilho (pega de longe) | Clicar e arrastar |
| Girar a peça (60°) | Girar o pulso segurando (45° de pulso = 60° da peça), botão A/X, ou thumbstick para o lado | R (Shift+R ao contrário), roda do mouse ou botão direito, segurando |
| Encaixar | Soltar com a peça em cima do mar: o fantasma verde mostra onde cai (vermelho = não pode); se estiver quase em cima de um lugar que pode, ele ajuda | Soltar o botão |
| Cabana | Pegar uma da sua pilha (aperto/pinça) e soltar numa das casas marcadas, ou apontar a casa e apertar o gatilho | Clicar numa casa marcada (ou arrastar da pilha) |
| Não pôr cabana | Apontar o botão "Sem cabana" na frente da bandeja e gatilho | Botão "Sem cabana" na tela ou N |
| Pausa | B ou Y | Esc ou P |
| Menu | Apontar com o controle (ou a mão) e gatilho/pinça | Clique |
| Câmera | (você anda em volta da mesa) | A/D gira em volta da mesa, W/S sobe/desce, roda dá zoom |
| FPS | Pausa ou menu → FPS | Tecla F |

No VR a mesa se ajusta à altura de quem joga (em pé ou sentado) quando entra no VR e em
"Recentralizar" (na pausa). À esquerda da mesa fica o placar, à direita o recado (de quem é a vez,
o que fazer, quando a maré enche). Os adversários são bonecos sentados em volta da mesa; balançam a
cabeça enquanto pensam.

### Regras

- Mar em grade hexagonal. Peças: praia (altura 1), floresta (2), montanha (3), sozinhas ou em
  duplas de dois tipos (9 tipos; montanha é a mais rara). Os rochedos (altura 4) já começam no mapa,
  nunca afundam e não aceitam cabana.
- Cada um tem 2 peças na bandeja, à vista de todos. Na sua vez: escolhe uma, gira e encaixa em mar
  livre (fora dos corais), **encostando em terra que já existe**. Depois pode pôr **1 cabana numa
  das casas da peça que acabou de pôr**. A bandeja completa com uma peça do saquinho.
- Cabanas: 7 para cada um com 1 adversário, 6 com 2.
- Ordem fixa: você sempre começa a rodada, depois os computadores. 12 rodadas.
- **Maré:** sobe um pouco a cada rodada (régua no canto da bandeja). Nas rodadas de cheia de cada mapa
  ela enche no fim da rodada e afunda tudo com altura até o nível: cheia 1 afunda as praias, cheia 2
  praias e florestas. Cabana em peça que afundou se perde. Depois da cheia a maré baixa e o lugar
  volta a ser mar. **A última rodada sempre termina com uma cheia** (conta o que sobrar).
- **Dono da ilha** (ilha = terra ligada): quem tem mais cabanas. Empate: soma das alturas das
  cabanas (mais alta ganha). Empate de novo: quem pôs cabana lá primeiro.
- **Pontos no fim:** o dono marca 1 por casa da ilha (rochedo conta), o segundo lugar em cabanas
  (sem empate) marca metade, para baixo, e cada cabana de pé vale 1 ponto para o dono dela.
- Ganha quem tiver mais pontos. Empate: a maior ilha de cada um; depois quem guardou mais cabanas;
  depois empate de verdade.
- Quem não tem onde pôr peça passa a vez sozinho.
- Mapas (em `js/maps.js`): **Enseada Mansa** (mar de raio 5, quatro rochedos e umas ilhotas; cheias nas
  rodadas 3, 6 e 12 de praia e 9 de floresta), **Atol das Marés** (raio 6, laguna de coral no meio,
  6 rochedos em anel; cheias 2, 5 e 12 de praia e 8 de floresta), **Estreito dos Corais** (raio 5,
  duas ilhas grandes com montanha separadas por uma faixa de corais com 3 passagens; cheias 4 e 12 de
  praia e 8 de floresta).
- Adversários (em `js/ai.js`): **Zé Tubarão** (fácil: invasor, gruda nas suas ilhas para roubar a
  maioria, gasta cabana rápido e erra mais, às vezes ainda põe cabana em praia), **Capitã Marola** (médio: cautelosa, cresce a própria ilha, foge de
  briga, guarda cabana no alto), **Vó Coral** (difícil: lê todas as cheias que faltam e imagina a
  resposta dos outros antes de jogar).
- Progresso salvo no navegador (localStorage, chave `arquipelagovr.v1`): mapa e adversários escolhidos,
  vitórias, partidas e recorde por mapa e número de adversários, vitórias contra cada adversário, som,
  FPS.

## Como testar

- `npm test` (ou `node tests/run.js`): grade hexagonal (vizinhas, ida e volta ponto→casa), saquinho
  (lote completo, raridade, mesma semente), giros, colocação (em cima de terra, sem encostar, fora do
  tabuleiro, coral, peça só pela segunda casa, número de jogadas), cabana (só na peça nova, gasta da
  reserva, sem reserva pula), maré (curva sobe aos poucos, cheias nas rodadas certas, praias e depois
  florestas afundam, cabana afogada, lugar volta a ser mar, toda partida termina com cheia), ilhas
  (dono, segundo lugar, praia afundando parte a ilha, desempates por altura e por quem chegou
  primeiro, rochedo conta), fim e desempate, passar a vez, IA (Tubarão rouba a ilha com montanha,
  Vó Coral não gasta cabana em praia antes da cheia, jogadas sempre legais, tempo de pensar), robô
  jogando partidas inteiras nos 3 mapas com 2 e 3 jogadores (mostra placares), duelos Vó Coral x
  Capitã Marola e Capitã Marola x Zé Tubarão (o mais forte tem que ganhar a maioria; mostra os
  placares), Zé Tubarão marcando pontos a dois e numa mesa de 3 contra o robô e a Vó Coral (pelo
  menos 7 de 9 partidas, média de 9 pontos, no máximo 3,4 cabanas afogadas) e o **teste do main.js** (`tests/smoke/main.js`: jogo inteiro com navegador, renderer e
  controles de VR de mentira: menu com cliques, arrastar/girar/encaixar com o mouse, cabana com
  clique, soltar fora devolve a peça, Esc, VR com aperto + giro do pulso, laser + gatilho + botão A,
  "Sem cabana" no VR, B pausa, pinça da mão rastreada pegando peça e cabana, robô até o fim, "Jogar de
  novo", Zé Tubarão marcando pontos numa mesa de 3 pelo `loadLevel` com as sementes 1234 e 1 nos 3
  mapas, os 3 mapas). Tem que terminar com "Tudo certo" (sai com código 1 se algo falhar). Não toca
  som. Leva uns 35 s.
- No navegador (console): `arq.dev.loadLevel(2)` começa no mapa 2 (1 a 3) com os adversários
  escolhidos, `arq.dev.startGame(3, [0, 2])` no mapa 3 contra Capitã Marola e Vó Coral (índices:
  0 Marola, 1 Tubarão, 2 Coral), `arq.dev.autoplay = true` faz o robô jogar por você,
  `arq.dev.advance(30)` roda 30 s de jogo na hora (sem esperas), `arq.dev.state()` mostra tela,
  rodada, fase, pontos, cabanas, `arq.dev.resetSave()` apaga o progresso. `window.arq` tem `game`,
  `seats`, `save`, `camera`, `scene`, `renderer`, `board`.
- **Só dá para testar no óculos:** alcance e conforto de pegar as peças (8 cm), giro do pulso
  (sensibilidade), altura automática da mesa, ler as placas laterais, laser nos menus, rastreamento
  de mãos, vibração, FPS e o tempo que a Vó Coral leva pensando no processador do Quest.

## Estrutura

| Arquivo | O que tem |
|---|---|
| `index.html`, `css/style.css` | Página, botão "Entrar em VR", placar do PC, aviso, botão "Sem cabana" |
| `js/hex.js` | Grade hexagonal axial (ponta para cima): vizinhas, chave inteira `K(q, r)`, disco, casa ↔ ponto. Sem navegador |
| `js/rules.js` | `Game`: saquinho, mãos, colocação, cabana, ordem, maré (`tideCurve`, cheias), afundar, ilhas (`findIslands`), dono e desempates (`islandOwner`), pontos (`scoreIslands`, `vice`), fim. Sem navegador |
| `js/maps.js` | Os 3 mapas: casas, corais, terra inicial, rodadas e cheias. Sem navegador |
| `js/ai.js` | Adversários (`OPPONENTS`), robô (`ROBOT`), avaliação do tabuleiro, escolha em pedaços (`chooseMoveGen`), resposta imaginada dos outros (Vó Coral). Sem navegador |
| `js/main.js` | Liga tudo: mesa, vez de cada um, animações (peça voando, cabana, maré, afundar, respingo), segurar/girar/encaixar no mouse e no VR (aperto, pinça, laser, pulso), menus, placar, placas do VR, sons, `dev` |
| `js/scene.js` | Quiosque, céu do pôr do sol, mar aberto, coqueiros, mesa, bandeja com fundo de areia/corais e água animada (shader), régua da maré, peças (geometria juntada com cor por vértice), cabanas, saquinho, bonecos dos adversários |
| `js/ui.js` | Painel de menu 3D em canvas e placas de texto |
| `js/audio.js` | Sons sintetizados: ondas de fundo, madeira, cabana, saquinho, maré subindo, bolhas, gaivota, fanfarra |
| `js/save.js` | Progresso e opções salvos |
| `tests/run.js` | Testes |
| `tests/smoke/` | Teste do `main.js` com navegador e Three.js de mentira (`env.js`, `three-wrap.js`, `hooks.js`, `register.js`) |
| `serve.py` | Servidor local sem cache (porta 8824, `--https` para o Quest) |
| `vendor/three/three.module.js` | Three.js r170 (cópia local) |

Coordenadas: o tabuleiro é o grupo `board` (filho da mesa); x para a direita, z para perto do
jogador, y para cima a partir do fundo da bandeja. Lado do hexágono `S` = 3,8 cm, um nível de
altura `U` = 1,1 cm; a água fica em `(0,45 + maré) × U`. A mesa (`stage`) fica 75 cm à frente do
jogador; no PC o tampo está a 80 cm do chão.

## Regras e convenções do projeto

- `hex.js`, `rules.js`, `maps.js` e `ai.js` não podem usar navegador nem Three.js: os testes rodam no
  Node.
- Mexeu em regras, mapas ou IA: rodar `npm test` (os duelos mostram se a escada de dificuldade
  continua certa).
- A IA do `main.js` sorteia a partir da semente da partida: a mesma semente repete a partida inteira.
- A IA no navegador pensa numa cópia do jogo, em pedaços de até 4 ms (Quest) / 7 ms (PC) por quadro
  (`chooseMoveGen` é um gerador): nada de cálculo pesado de uma vez só.
- O tabuleiro desenhado só tira peça afundada pela animação da cheia (fila `seq` em `main.js`); a
  vez seguinte só começa com a fila vazia.
- Testes nunca tocam som.

## Decisões

- Regras próprias (não é cópia de jogo existente): peças de 1 ou 2 casas sem empilhar, cabana só na
  peça recém-posta, maré com cheias marcadas por mapa e contagem depois da última cheia.
- **Ordem fixa** (você sempre começa a rodada): testado com a IA contra ela mesma, girar quem começa
  deu 44 x 16 para o segundo jogador; ordem fixa deu 18,5 x 17,5.
- **Peça tem que encostar em terra**: o tabuleiro cresce a partir dos rochedos e das ilhas; com
  colocação livre o jogo vira cada um na sua ilha.
- **Segundo lugar leva metade** e **contagem depois de uma cheia final**: sem isso as partidas viravam
  "uma ilha só, quem tem a maioria leva tudo" (placares de 19 x 0).
- **Desempate final por quem chegou primeiro na ilha**: sem ele apareciam ilhas inteiras sem dono
  (0 x 0 x 0 em 3 jogadores).
- **Cada cabana de pé vale 1 ponto**: a três, quem perdia a maioria em todas as ilhas zerava (até a
  Vó Coral, cerca de 15% das vezes com três IAs iguais). Também premia guardar cabana no alto.
- A IA avalia sobretudo o que sobra depois das cheias que faltam (`all`) e pouco o placar de agora
  (`now`): mandar numa ilha que vai afundar não vale nada no fim. Cabana em casa que ainda vai
  afundar tem penalidade (`doom`) e não ganha bônus de invasão. Antes disso o Zé Tubarão gastava as 6
  cabanas em floresta até a rodada 6 e terminava com 0 ponto e 6 afogadas (semente 1234 do
  `loadLevel`); os testes de `run.js` e do `main.js` impedem que volte.
- Dificuldade calibrada com IA contra IA: Vó Coral (ruído 0,25, imagina 6 jogadas com resposta) ganha
  cerca de 70% da Capitã Marola (ruído 4,5), que ganha cerca de 65% do Zé Tubarão (ruído 4,5, maré
  0,7, guarda pouca cabana, gosta de invadir).
- Peça segurada no VR: segue a mão; o giro é pelo pulso (45° de pulso por passo de 60°) para não
  precisar das duas mãos. Pegar de perto (8 cm) ou de longe com o laser, porque o lado de lá do
  tabuleiro fica fora do alcance do braço.
- Desempenho no Quest: cada peça é uma malha só (geometria juntada com cor por vértice), contornos
  das ilhas numa `InstancedMesh`, 3 luzes sem sombra, pixelRatio 1 e foveação.
- Porta do servidor local 8824.

## Pendências / problemas conhecidos

- Nada testado no Quest ainda: pegar peça com aperto e pinça, sensibilidade do giro do pulso,
  laser, altura da mesa, tamanho das peças (6,6 cm) e das cabanas, leitura das placas, conforto,
  vibração, FPS e o tempo de pensar da Vó Coral no processador do Quest.
- A escada de dificuldade foi medida só com IA contra IA; contra gente pode estar fácil ou difícil.
