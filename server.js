const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" },
    pingInterval: 5000,
    pingTimeout: 10000
});

app.use(express.static('public'));

const salas = {};

// Banco ampliado de frases aleatórias
const FRASES = [
    "Sistemas distribuídos exigem sincronização rigorosa de estado entre os nós.",
    "O servidor autoritativo valida cada jogada e garante a ordem dos eventos.",
    "A comunicação via WebSocket mantém um canal bidirecional de baixa latência.",
    "A tolerância a falhas parciais impede que a queda de um cliente trave o sistema.",
    "O relógio do servidor é a única fonte da verdade para definir o vencedor.",
    "A exclusão mútua evita condições de corrida quando dois processos acessam um recurso.",
    "A transparência de localização permite acessar recursos remotos como se fossem locais.",
    "O protocolo TCP garante a entrega ordenada e confiável dos pacotes na rede.",
    "A escalabilidade horizontal permite adicionar mais servidores para suportar carga.",
    "O balanceamento de carga distribui as requisições entre diferentes instâncias.",
    "A latência de rede representa o tempo necessário para uma mensagem viajar entre nós.",
    "Mensagens em formato JSON facilitam a interoperabilidade entre cliente e servidor.",
    "A arquitetura cliente-servidor centraliza as regras de negócio no backend.",
    "Eventos assíncronos permitem que a interface web reaja sem recarregar a página.",
    "A consistência eventual garante que todas as réplicas convirjam para o mesmo valor."
];

function escaparHTML(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function sortearFrase(fraseAnterior) {
    const opcoes = FRASES.filter(f => f !== fraseAnterior);
    return opcoes[Math.floor(Math.random() * opcoes.length)];
}

io.on('connection', (socket) => {
    console.log(`[LOG - CONEXAO] Cliente conectado: ${socket.id}`);

    socket.on('rede:ping', (timestampCliente) => {
        socket.emit('rede:pong', timestampCliente);
    });

    // 1. Criar, Entrar ou Reconectar na Sala
    socket.on('sala:criar_ou_entrar', (data) => {
        try {
            if (!data || typeof data !== 'object') {
                return socket.emit('erro:mensagem', { mensagem: 'Formato de dados inválido.' });
            }

            const { nomeUsuario, codigoSala, tokenSessao } = data;
            const salaId = (String(codigoSala || 'SALA1')).toUpperCase().trim();
            const nomeLimpo = escaparHTML((String(nomeUsuario || 'Jogador')).trim().substring(0, 20));
            const token = tokenSessao ? String(tokenSessao) : socket.id;

            socket.join(salaId);
            socket.salaId = salaId;
            socket.nomeUsuario = nomeLimpo;
            socket.tokenSessao = token;

            if (!salas[salaId]) {
                salas[salaId] = {
                    jogadores: [],
                    estado: 'LOBBY',
                    textoOficial: '',
                    timestampInicio: null,
                    historicoTempos: [] // Lista ordenada de todos os tempos concluídos na sala
                };
            }

            const sala = salas[salaId];

            const jogadorExistente = sala.jogadores.find(j => j.tokenSessao === token);
            if (jogadorExistente) {
                clearTimeout(jogadorExistente.timerDesconexao);
                jogadorExistente.id = socket.id;
                jogadorExistente.desconectado = false;
                socket.papel = jogadorExistente.papel;

                socket.emit('sala:papel_atribuido', {
                    papel: jogadorExistente.papel,
                    salaId,
                    tokenSessao: token
                });

                io.to(salaId).emit('sala:estado_atualizado', {
                    jogadores: sala.jogadores,
                    estado: sala.estado,
                    historicoTempos: sala.historicoTempos,
                    textoOficial: sala.estado === 'EM_ANDAMENTO' ? sala.textoOficial : '',
                    timestampInicio: sala.timestampInicio
                });
                return;
            }

            let papel = 'Espectador';
            const qtdJogadores = sala.jogadores.filter(p => p.papel !== 'Espectador').length;
            if (qtdJogadores < 5 && sala.estado === 'LOBBY') {
                papel = `Jogador ${qtdJogadores + 1}`;
            }

            socket.papel = papel;
            sala.jogadores.push({
                id: socket.id,
                tokenSessao: token,
                nome: nomeLimpo,
                papel,
                progresso: 0,
                caracteresCorretos: 0,
                ultimoTamanhoTexto: 0,
                erros: 0,
                concluido: false,
                tempoFinal: null,
                ppm: 0,
                vitorias: 0,
                desconectado: false,
                timerDesconexao: null
            });

            console.log(`[LOG - SALA] ${nomeLimpo} entrou na sala ${salaId} como ${papel}`);

            socket.emit('sala:papel_atribuido', { papel, salaId, tokenSessao: token });
            io.to(salaId).emit('sala:estado_atualizado', {
                jogadores: sala.jogadores,
                estado: sala.estado,
                historicoTempos: sala.historicoTempos
            });
        } catch (err) {
            console.error(`[ERRO - ENTRADA]`, err.message);
            socket.emit('erro:mensagem', { mensagem: 'Erro interno ao processar entrada na sala.' });
        }
    });

    // Chat da sala
    socket.on('sala:chat', (data) => {
        try {
            const salaId = socket.salaId;
            if (!salaId || !salas[salaId] || !data || typeof data.mensagem !== 'string') return;

            const msgLimpa = escaparHTML(data.mensagem.trim().substring(0, 150));
            if (!msgLimpa) return;

            io.to(salaId).emit('sala:chat_mensagem', {
                autor: socket.nomeUsuario,
                papel: socket.papel,
                mensagem: msgLimpa,
                hora: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
            });
        } catch (err) {
            console.error(`[ERRO - CHAT]`, err.message);
        }
    });

    // 2. Iniciar o Jogo
    socket.on('jogo:iniciar', () => {
        try {
            const salaId = socket.salaId;
            const sala = salas[salaId];
            if (!sala) return;

            if (socket.papel !== 'Jogador 1') {
                return socket.emit('erro:mensagem', { mensagem: 'Jogada rejeitada: apenas o Jogador 1 pode iniciar a partida.' });
            }

            if (sala.estado !== 'LOBBY') {
                return socket.emit('erro:mensagem', { mensagem: 'Jogada rejeitada: a partida já está em andamento.' });
            }

            sala.jogadores.forEach(j => {
                j.progresso = 0;
                j.caracteresCorretos = 0;
                j.ultimoTamanhoTexto = 0;
                j.erros = 0;
                j.concluido = false;
                j.tempoFinal = null;
                j.ppm = 0;
            });

            sala.estado = 'CONTAGEM';
            sala.textoOficial = sortearFrase(sala.textoOficial);

            console.log(`[LOG - PARTIDA] Contagem iniciada na sala ${salaId}`);
            io.to(salaId).emit('jogo:contagem', { segundos: 3 });

            setTimeout(() => {
                if (!salas[salaId] || salas[salaId].estado !== 'CONTAGEM') return;

                sala.estado = 'EM_ANDAMENTO';
                sala.timestampInicio = Date.now();

                console.log(`[LOG - PARTIDA] Corrida iniciada na sala ${salaId}!`);
                io.to(salaId).emit('jogo:comecar', {
                    textoOficial: sala.textoOficial,
                    jogadores: sala.jogadores,
                    timestampInicio: sala.timestampInicio
                });
            }, 3000);
        } catch (err) {
            console.error(`[ERRO - INICIAR]`, err.message);
        }
    });

    // 3. Validar Digitação Autoritativa
    socket.on('jogo:digitar', (data) => {
        try {
            const salaId = socket.salaId;
            const sala = salas[salaId];

            if (!sala || sala.estado !== 'EM_ANDAMENTO') {
                return socket.emit('erro:mensagem', { mensagem: 'Jogada rejeitada: a corrida não está em andamento.' });
            }

            const jogador = sala.jogadores.find(j => j.id === socket.id);
            if (!jogador || jogador.papel === 'Espectador' || jogador.concluido) return;

            if (!data || typeof data.texto !== 'string') return;

            if (data.tempoCliente || data.timestamp) {
                console.warn(`[LOG - SEGURANCA] ${jogador.nome} tentou enviar timestamp manipulado! Ignorado.`);
            }

            const textoDigitado = data.texto;
            const oficial = sala.textoOficial;

            const diferencaTamanho = textoDigitado.length - (jogador.ultimoTamanhoTexto || 0);
            if (diferencaTamanho > 5) {
                return socket.emit('erro:mensagem', { mensagem: 'Ação bloqueada: não é permitido colar ou injetar texto!' });
            }
            jogador.ultimoTamanhoTexto = textoDigitado.length;

            let acertos = 0;
            let temErro = false;
            for (let i = 0; i < textoDigitado.length; i++) {
                if (textoDigitado[i] === oficial[i] && !temErro) {
                    acertos++;
                } else {
                    temErro = true;
                }
            }

            if (temErro) jogador.erros++;

            jogador.caracteresCorretos = acertos;
            jogador.progresso = Math.min(100, Math.round((acertos / oficial.length) * 100));

            socket.emit('jogo:feedback_texto', {
                acertos,
                temErro
            });

            if (textoDigitado === oficial) {
                jogador.concluido = true;
                jogador.progresso = 100;

                const tempoDecorrido = Number(((Date.now() - sala.timestampInicio) / 1000).toFixed(2));
                jogador.tempoFinal = tempoDecorrido;

                const minutos = tempoDecorrido / 60;
                const palavras = oficial.length / 5;
                jogador.ppm = minutos > 0 ? Math.round(palavras / minutos) : 0;

                // Salva no histórico geral de tempos da sala e ordena do menor para o maior
                sala.historicoTempos.push({
                    nome: jogador.nome,
                    tempo: tempoDecorrido,
                    ppm: jogador.ppm,
                    data: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                });
                sala.historicoTempos.sort((a, b) => a.tempo - b.tempo);

                console.log(`[LOG - ACEITO] ${jogador.nome} concluiu em ${tempoDecorrido}s (${jogador.ppm} PPM)!`);

                const ativos = sala.jogadores.filter(j => j.papel !== 'Espectador');
                if (ativos.every(j => j.concluido)) {
                    finalizarPartida(salaId);
                }
            }

            io.to(salaId).emit('jogo:progresso_atualizado', {
                jogadores: sala.jogadores
            });
        } catch (err) {
            console.error(`[ERRO - DIGITAR]`, err.message);
        }
    });

    // 4. Encerrar Partida Manualmente
    socket.on('jogo:finalizar', () => {
        const salaId = socket.salaId;
        const sala = salas[salaId];
        if (!sala || sala.estado === 'LOBBY') return;

        console.log(`[LOG - PARTIDA] Partida encerrada manualmente na sala ${salaId} por ${socket.nomeUsuario}`);
        finalizarPartida(salaId);
    });

    // 5. Voltar ao Lobby
    socket.on('jogo:voltar_lobby', () => {
        const salaId = socket.salaId;
        const sala = salas[salaId];
        if (!sala) return;

        sala.estado = 'LOBBY';
        sala.jogadores.forEach(j => {
            j.progresso = 0;
            j.caracteresCorretos = 0;
            j.ultimoTamanhoTexto = 0;
            j.erros = 0;
            j.concluido = false;
            j.tempoFinal = null;
            j.ppm = 0;
        });

        io.to(salaId).emit('sala:estado_atualizado', {
            jogadores: sala.jogadores,
            estado: sala.estado,
            historicoTempos: sala.historicoTempos
        });
    });

    // 6. Desconexão
    socket.on('disconnect', () => {
        const salaId = socket.salaId;
        if (salaId && salas[salaId]) {
            const sala = salas[salaId];
            const jogador = sala.jogadores.find(j => j.id === socket.id);
            if (!jogador) return;

            jogador.desconectado = true;
            jogador.timerDesconexao = setTimeout(() => {
                if (!salas[salaId]) return;
                const salaAtual = salas[salaId];
                salaAtual.jogadores = salaAtual.jogadores.filter(j => j.tokenSessao !== jogador.tokenSessao);

                if (salaAtual.estado !== 'LOBBY' && jogador.papel !== 'Espectador') {
                    salaAtual.estado = 'LOBBY';
                }

                io.to(salaId).emit('sala:jogador_desconectou', {
                    mensagem: `O participante ${jogador.nome} (${jogador.papel}) saiu da sala.`,
                    jogadores: salaAtual.jogadores,
                    estado: salaAtual.estado
                });

                if (salaAtual.jogadores.length === 0) {
                    delete salas[salaId];
                }
            }, 5000);
        }
    });
});

function finalizarPartida(salaId) {
    const sala = salas[salaId];
    if (!sala) return;

    sala.estado = 'FIM';
    const ativos = sala.jogadores.filter(j => j.papel !== 'Espectador');

    const rankingRodada = [...ativos].sort((a, b) => {
        if (a.tempoFinal === null) return 1;
        if (b.tempoFinal === null) return -1;
        return a.tempoFinal - b.tempoFinal;
    });

    if (rankingRodada.length > 0 && rankingRodada[0].tempoFinal !== null) {
        const vencedorOriginal = sala.jogadores.find(j => j.id === rankingRodada[0].id);
        if (vencedorOriginal) vencedorOriginal.vitorias++;
    }

    io.to(salaId).emit('jogo:fim', {
        rankingRodada,
        historicoTempos: sala.historicoTempos
    });
}

const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n==================================================`);
    console.log(` Servidor Arena Distribuida v1.0 rodando na porta ${PORT}`);
    console.log(` Local: http://localhost:${PORT}`);
    console.log(`==================================================\n`);
});