const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static('public'));

const salas = {};

// Frases sorteadas exclusivamente pelo servidor
const FRASES = [
    "Sistemas distribuídos exigem sincronização rigorosa de estado entre os nós.",
    "O servidor autoritativo valida cada jogada e garante a ordem dos eventos.",
    "A comunicação via WebSocket mantém um canal bidirecional de baixa latência.",
    "A tolerância a falhas parciais impede que a queda de um cliente trave o sistema.",
    "O relógio do servidor é a única fonte da verdade para definir o vencedor."
];

io.on('connection', (socket) => {
    console.log(`[LOG - CONEXAO] Cliente conectado: ${socket.id}`);

    // 1. Criar ou entrar na sala (RF02 / RF03)
    socket.on('sala:criar_ou_entrar', (data) => {
        try {
            if (!data || typeof data !== 'object') {
                return socket.emit('erro:mensagem', { mensagem: 'Formato de dados inválido.' });
            }

            const { nomeUsuario, codigoSala } = data;
            const salaId = (String(codigoSala || 'SALA1')).toUpperCase().trim();
            const nomeLimpo = (String(nomeUsuario || 'Jogador')).trim().substring(0, 20);

            socket.join(salaId);
            socket.salaId = salaId;
            socket.nomeUsuario = nomeLimpo;

            if (!salas[salaId]) {
                salas[salaId] = {
                    jogadores: [],
                    estado: 'LOBBY',
                    textoOficial: '',
                    timestampInicio: null,
                    melhorTempoSolo: null
                };
            }

            const sala = salas[salaId];
            let papel = 'Espectador';

            // Permite até 5 jogadores ativos na sala (Tema 9)
            const qtdJogadores = sala.jogadores.filter(p => p.papel !== 'Espectador').length;
            if (qtdJogadores < 5 && sala.estado === 'LOBBY') {
                papel = `Jogador ${qtdJogadores + 1}`;
            }

            socket.papel = papel;
            sala.jogadores.push({
                id: socket.id,
                nome: nomeLimpo,
                papel,
                progresso: 0,
                caracteresCorretos: 0,
                ultimoTamanhoTexto: 0,
                erros: 0,
                concluido: false,
                tempoFinal: null,
                ppm: 0,
                vitorias: 0
            });

            console.log(`[SALA ${salaId}] ${nomeLimpo} entrou como ${papel}`);

            socket.emit('sala:papel_atribuido', { papel, salaId });
            io.to(salaId).emit('sala:estado_atualizado', {
                jogadores: sala.jogadores,
                estado: sala.estado,
                melhorTempoSolo: sala.melhorTempoSolo
            });
        } catch (err) {
            console.error(`[ERRO]`, err.message);
            socket.emit('erro:mensagem', { mensagem: 'Erro interno ao entrar na sala.' });
        }
    });

    // 2. Iniciar o Jogo (Apenas Jogador 1 pode disparar)
    socket.on('jogo:iniciar', () => {
        const salaId = socket.salaId;
        const sala = salas[salaId];
        if (!sala) return;

        if (socket.papel !== 'Jogador 1') {
            return socket.emit('erro:mensagem', { mensagem: 'Apenas o Jogador 1 pode iniciar a partida.' });
        }

        if (sala.estado !== 'LOBBY') {
            return socket.emit('erro:mensagem', { mensagem: 'A partida já está em andamento.' });
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
        sala.textoOficial = FRASES[Math.floor(Math.random() * FRASES.length)];

        console.log(`[SALA ${salaId}] Contagem regressiva iniciada por ${socket.nomeUsuario}`);
        io.to(salaId).emit('jogo:contagem', { segundos: 3 });

        // Timer controlado pelo servidor
        setTimeout(() => {
            if (!salas[salaId] || salas[salaId].estado !== 'CONTAGEM') return;

            sala.estado = 'EM_ANDAMENTO';
            sala.timestampInicio = Date.now(); // Relógio autoritativo do servidor

            console.log(`[SALA ${salaId}] Corrida iniciada! Texto: "${sala.textoOficial}"`);
            io.to(salaId).emit('jogo:comecar', {
                textoOficial: sala.textoOficial,
                jogadores: sala.jogadores
            });
        }, 3000);
    });

    // 3. Validar Digitação Autoritativa em Tempo Real
    socket.on('jogo:digitar', (data) => {
        try {
            const salaId = socket.salaId;
            const sala = salas[salaId];

            // Rejeita jogadas fora do estado EM_ANDAMENTO (RF04)
            if (!sala || sala.estado !== 'EM_ANDAMENTO') {
                return socket.emit('erro:mensagem', { mensagem: 'Jogada rejeitada: a corrida não está em andamento.' });
            }

            const jogador = sala.jogadores.find(j => j.id === socket.id);
            if (!jogador || jogador.papel === 'Espectador' || jogador.concluido) return;

            if (!data || typeof data.texto !== 'string') {
                return socket.emit('erro:mensagem', { mensagem: 'Formato de mensagem inválido.' });
            }

            const textoDigitado = data.texto;
            const oficial = sala.textoOficial;

            // Proteção Anti-Cheat corrigida: compara com o tamanho anterior digitado
            const diferencaTamanho = textoDigitado.length - (jogador.ultimoTamanhoTexto || 0);
            if (diferencaTamanho > 5) {
                console.warn(`[ALERTA ANTI-CHEAT] ${jogador.nome} tentou enviar ${diferencaTamanho} caracteres de uma vez!`);
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

            // Feedback individual para colorir o texto na tela
            socket.emit('jogo:feedback_texto', {
                acertos,
                temErro,
                tamanhoDigitado: textoDigitado.length
            });

            // Verifica se concluiu 100% da frase
            if (textoDigitado === oficial) {
                jogador.concluido = true;
                jogador.progresso = 100;

                // Tempo calculado EXCLUSIVAMENTE pelo relógio do servidor (Tema 9)
                const tempoDecorrido = Number(((Date.now() - sala.timestampInicio) / 1000).toFixed(2));
                jogador.tempoFinal = tempoDecorrido;

                // Cálculo de Palavras Por Minuto (PPM)
                const minutos = tempoDecorrido / 60;
                const palavras = oficial.length / 5;
                jogador.ppm = minutos > 0 ? Math.round(palavras / minutos) : 0;

                console.log(`[SALA ${salaId}] ${jogador.nome} concluiu em ${tempoDecorrido}s (${jogador.ppm} PPM)!`);

                const ativos = sala.jogadores.filter(j => j.papel !== 'Espectador');
                if (ativos.every(j => j.concluido)) {
                    finalizarPartida(salaId);
                }
            }

            io.to(salaId).emit('jogo:progresso_atualizado', {
                jogadores: sala.jogadores
            });
        } catch (err) {
            console.error(`[ERRO] Falha ao processar digitação:`, err.message);
        }
    });

    // 4. Botão Finalizar Jogo Manualmente
    socket.on('jogo:finalizar', () => {
        const salaId = socket.salaId;
        const sala = salas[salaId];
        if (!sala || sala.estado === 'LOBBY') return;

        console.log(`[SALA ${salaId}] Partida encerrada manualmente por ${socket.nomeUsuario}`);
        finalizarPartida(salaId);
    });

    // 5. Revanche / Voltar para o Lobby (RF08)
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
            melhorTempoSolo: sala.melhorTempoSolo
        });
    });

    // 6. Desconexão (RF07)
    socket.on('disconnect', () => {
        console.log(`[LOG - DESCONEXAO] Cliente desconectado: ${socket.id}`);
        const salaId = socket.salaId;

        if (salaId && salas[salaId]) {
            const sala = salas[salaId];
            const saiu = sala.jogadores.find(j => j.id === socket.id);
            sala.jogadores = sala.jogadores.filter(j => j.id !== socket.id);

            if (sala.estado !== 'LOBBY' && saiu && saiu.papel !== 'Espectador') {
                sala.estado = 'LOBBY';
            }

            io.to(salaId).emit('sala:jogador_desconectou', {
                mensagem: `O participante ${socket.nomeUsuario} (${socket.papel}) desconectou.`,
                jogadores: sala.jogadores,
                estado: sala.estado
            });

            if (sala.jogadores.length === 0) {
                delete salas[salaId];
                console.log(`[SALA ${salaId}] Sala removida (vazia).`);
            }
        }
    });
});

function finalizarPartida(salaId) {
    const sala = salas[salaId];
    if (!sala) return;

    sala.estado = 'FIM';
    const ativos = sala.jogadores.filter(j => j.papel !== 'Espectador');

    const ranking = [...ativos].sort((a, b) => {
        if (a.tempoFinal === null) return 1;
        if (b.tempoFinal === null) return -1;
        return a.tempoFinal - b.tempoFinal;
    });

    if (ranking.length > 0 && ranking[0].tempoFinal !== null) {
        const vencedorOriginal = sala.jogadores.find(j => j.id === ranking[0].id);
        if (vencedorOriginal) vencedorOriginal.vitorias++;
    }

    let mensagemRecorde = null;

    // Modo 1 Jogador: disputa contra o tempo anterior
    if (ativos.length === 1 && ativos[0].tempoFinal !== null) {
        const tempoAtual = ativos[0].tempoFinal;
        if (sala.melhorTempoSolo === null) {
            sala.melhorTempoSolo = tempoAtual;
            mensagemRecorde = `Primeiro tempo registrado: ${tempoAtual}s! Jogue novamente para tentar superar.`;
        } else if (tempoAtual < sala.melhorTempoSolo) {
            const anterior = sala.melhorTempoSolo;
            sala.melhorTempoSolo = tempoAtual;
            mensagemRecorde = `🏆 NOVO RECORDE PESSOAL! Você fez ${tempoAtual}s (bateu ${anterior}s).`;
        } else {
            mensagemRecorde = `Você fez ${tempoAtual}s. Seu recorde atual continua sendo ${sala.melhorTempoSolo}s.`;
        }
    }

    io.to(salaId).emit('jogo:fim', {
        ranking,
        mensagemRecorde,
        melhorTempoSolo: sala.melhorTempoSolo
    });
}

const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n==================================================`);
    console.log(` Servidor Arena Distribuida rodando na porta ${PORT}`);
    console.log(` Local: http://localhost:${PORT}`);
    console.log(`==================================================\n`);
});