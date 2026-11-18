# 🏎️ Arena Distribuída — Corrida de Digitação Multiplayer

Aplicação web multiplayer em tempo real desenvolvida para a disciplina de **Sistemas Distribuídos e Programação Web** (Curso de Análise e Desenvolvimento de Sistemas — **Fatec Taubaté**).

O sistema implementa o **Tema 9 (Corrida de Digitação)** utilizando arquitetura **Cliente-Servidor Autoritativo** sobre **WebSockets**, garantindo sincronização de estado em tempo real, isolamento de salas, tolerância a falhas parciais e integridade temporal controlada exclusivamente pelo relógio do servidor.

---

## 📋 Funcionalidades Implementadas

### Requisitos Centrais & Regras de Negócio
* **Comunicação em Tempo Real via WebSocket:** Canal bidirecional persistente utilizando Socket.IO sobre Node.js.
* **Isolamento de Salas (`Rooms`):** Múltiplas partidas simultâneas separadas por código de sala, sem interferência de mensagens ou estado entre salas distintas.
* **Gestão Dinâmica de Papéis:** Atribuição automática de papéis na entrada da sala (`Jogador 1` a `Jogador 5` para competidores no lobby; `Espectador` para participantes excedentes ou que ingressem com a corrida em andamento).
* **Servidor Autoritativo (Fonte Única da Verdade):**
  * Sorteio aleatório de frases no backend (sem repetição consecutiva na mesma sala).
  * Contagem regressiva oficial de 3 segundos controlada pelo servidor.
  * Validação caractere a caractere em tempo real no servidor.
  * Cálculo do tempo final e de **PPM (Palavras por Minuto)** baseado exclusivamente no relógio do servidor (`Date.now()`), ignorando timestamps enviados pelo cliente.
* **Proteção Anti-Trapaça (Anti-Cheat):** Bloqueio de colagem (`paste`) no frontend e rejeição no servidor de envios em bloco ou tentativas de manipulação de tempo via console.
* **Feedback Visual em Tempo Real:** Destaque em verde para o trecho digitado corretamente, destaque em vermelho com bloqueio de avanço na letra exata em caso de erro, barras de progresso sincronizadas e cronômetro ao vivo na arena.
* **Tolerância a Falhas e Desconexão:** Tratamento gracioso para quedas de conexão, notificações em tempo real aos participantes e limpeza automática de salas vazias.
* **Placar da Sessão & Histórico Ordenado:** Contabilização de vitórias acumuladas na sessão (revanche) e ranking histórico dos melhores tempos da sala ordenados do menor para o maior.

### Itens de Bônus Implementados
* **Medidor de Latência (`Ping/Pong`):** Cálculo e exibição contínua da latência de rede em milissegundos (`ms`) na interface do cliente.
* **Reconexão Automática de Sessão:** Persistência de token via `sessionStorage` permitindo que o usuário recarregue a página (`F5`) e retome seu papel e estado na partida dentro de uma janela de tolerância de 5 segundos.
* **Chat da Sala com Sanitização XSS:** Troca de mensagens em tempo real no lobby com escape de caracteres HTML no servidor.

---

## 🛠️ Tecnologias Utilizadas

* **Backend:** Node.js, Express, Socket.IO
* **Frontend:** HTML5, CSS3, JavaScript Vanilla (ES6+)
* **Protocolos & Conceitos:** HTTP, WebSocket (Full-Duplex), JSON, Servidor Autoritativo, Exclusão Lógica por Sala, Tolerância a Falhas Parciais.

---

## 📁 Estrutura do Projeto

```text
arena-distribuida-corrida-digitacao/
├── public/
│   ├── index.html      # Estrutura das telas (Login, Lobby, Arena e Resultado)
│   ├── style.css       # Estilização responsiva e indicadores visuais
│   └── client.js       # Lógica do cliente WebSocket, cronômetro e renderização
├── server.js           # Servidor autoritativo, regras da corrida e gestão de salas
├── package.json        # Dependências e scripts de execução
├── .gitignore          # Exclusão de node_modules e arquivos de ambiente
└── README.md           # Documentação do projeto