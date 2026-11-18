const socket = io();

const telaLogin = document.getElementById('tela-login');
const telaLobby = document.getElementById('tela-lobby');
const telaCorrida = document.getElementById('tela-corrida');
const telaResultado = document.getElementById('tela-resultado');

const statusConexao = document.getElementById('status-conexao');
const indicadorPing = document.getElementById('indicador-ping');
const meuPapelSpan = document.getElementById('meu-papel');
const idSalaSpan = document.getElementById('id-sala');
const listaJogadores = document.getElementById('lista-jogadores');
const btnEntrar = document.getElementById('btn-entrar');
const btnIniciar = document.getElementById('btn-iniciar');
const msgAguardando = document.getElementById('msg-aguardando');
const avisoRecordeLobby = document.getElementById('aviso-recorde-lobby');

const chatMensagens = document.getElementById('chat-mensagens');
const inputChat = document.getElementById('input-chat');
const btnEnviarChat = document.getElementById('btn-enviar-chat');

const statusCorrida = document.getElementById('status-corrida');
const cronometroSala = document.getElementById('cronometro-sala');
const btnFinalizar = document.getElementById('btn-finalizar');
const pistasContainer = document.getElementById('pistas-container');
const textoOficialP = document.getElementById('texto-oficial');
const inputDigitacao = document.getElementById('input-digitacao');

const listaRanking = document.getElementById('lista-ranking');
const secaoHistorico = document.getElementById('secao-historico');
const listaHistoricoTempos = document.getElementById('lista-historico-tempos');
const btnVoltarLobby = document.getElementById('btn-voltar-lobby');

let meuPapel = '';
let textoOficialAtual = '';
let intervaloCronometro = null;

function mostrarTela(tela) {
    telaLogin.classList.add('hidden');
    telaLobby.classList.add('hidden');
    telaCorrida.classList.add('hidden');
    telaResultado.classList.add('hidden');
    tela.classList.remove('hidden');
}

function iniciarCronometro(timestampInicio) {
    pararCronometro();
    intervaloCronometro = setInterval(() => {
        const segundos = ((Date.now() - timestampInicio) / 1000).toFixed(1);
        cronometroSala.textContent = `⏱️ ${segundos}s`;
    }, 100);
}

function pararCronometro() {
    if (intervaloCronometro) {
        clearInterval(intervaloCronometro);
        intervaloCronometro = null;
    }
}

setInterval(() => {
    if (socket.connected) {
        socket.emit('rede:ping', Date.now());
    }
}, 3000);

socket.on('rede:pong', (timestampEnvio) => {
    const latencia = Date.now() - timestampEnvio;
    indicadorPing.textContent = `Latência: ${latencia} ms`;
});

socket.on('connect', () => {
    statusConexao.textContent = '🟢 Conectado ao servidor';
    statusConexao.style.color = 'green';

    const sessaoSalva = sessionStorage.getItem('arena_sessao');
    if (sessaoSalva) {
        const dados = JSON.parse(sessaoSalva);
        socket.emit('sala:criar_ou_entrar', dados);
    }
});

socket.on('disconnect', () => {
    statusConexao.textContent = '🔴 Desconectado do servidor';
    statusConexao.style.color = 'red';
    pararCronometro();
});

btnEntrar.addEventListener('click', () => {
    const nomeUsuario = document.getElementById('nome').value.trim();
    const codigoSala = document.getElementById('sala').value.trim();
    if (nomeUsuario && codigoSala) {
        const tokenSessao = 'tok_' + Math.random().toString(36).substring(2, 10);
        const payload = { nomeUsuario, codigoSala, tokenSessao };
        sessionStorage.setItem('arena_sessao', JSON.stringify(payload));
        socket.emit('sala:criar_ou_entrar', payload);
    }
});

socket.on('sala:papel_atribuido', (data) => {
    meuPapel = data.papel;
    meuPapelSpan.textContent = data.papel;
    idSalaSpan.textContent = data.salaId;
    mostrarTela(telaLobby);

    if (meuPapel === 'Jogador 1') {
        btnIniciar.classList.remove('hidden');
        msgAguardando.classList.add('hidden');
    } else {
        btnIniciar.classList.add('hidden');
        msgAguardando.classList.remove('hidden');
    }
});

socket.on('sala:estado_atualizado', (data) => {
    if (data.estado === 'LOBBY') {
        pararCronometro();
        mostrarTela(telaLobby);
    } else if (data.estado === 'EM_ANDAMENTO' && data.textoOficial) {
        mostrarTela(telaCorrida);
        textoOficialAtual = data.textoOficial;
        textoOficialP.textContent = textoOficialAtual;
        renderizarPistas(data.jogadores);
        if (data.timestampInicio) iniciarCronometro(data.timestampInicio);
        if (meuPapel !== 'Espectador') inputDigitacao.disabled = false;
    }

    listaJogadores.innerHTML = '';
    data.jogadores.forEach(j => {
        const li = document.createElement('li');
        const badgeVitorias = j.vitorias > 0 ? `<span class="badge-vitorias">🏆 ${j.vitorias}</span>` : '';
        li.innerHTML = `<span><strong>${j.nome}</strong></span> <div>${badgeVitorias}<span class="badge">${j.papel}</span></div>`;
        listaJogadores.appendChild(li);
    });

    if (data.historicoTempos && data.historicoTempos.length > 0) {
        const melhor = data.historicoTempos[0];
        avisoRecordeLobby.textContent = `🏆 Melhor tempo da sala: ${melhor.tempo}s (${melhor.nome})`;
        avisoRecordeLobby.classList.remove('hidden');
    } else {
        avisoRecordeLobby.classList.add('hidden');
    }
});

function enviarMensagemChat() {
    const mensagem = inputChat.value.trim();
    if (mensagem) {
        socket.emit('sala:chat', { mensagem });
        inputChat.value = '';
    }
}

btnEnviarChat.addEventListener('click', enviarMensagemChat);
inputChat.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') enviarMensagemChat();
});

socket.on('sala:chat_mensagem', (data) => {
    const p = document.createElement('p');
    p.innerHTML = `<small>[${data.hora}]</small> <strong>${data.autor}:</strong> ${data.mensagem}`;
    chatMensagens.appendChild(p);
    chatMensagens.scrollTop = chatMensagens.scrollHeight;
});

btnIniciar.addEventListener('click', () => {
    socket.emit('jogo:iniciar');
});

socket.on('jogo:contagem', (data) => {
    mostrarTela(telaCorrida);
    pararCronometro();
    cronometroSala.textContent = '⏱️ 0.0s';
    inputDigitacao.value = '';
    inputDigitacao.disabled = true;
    inputDigitacao.classList.remove('borda-erro');
    textoOficialP.textContent = 'O texto aparecerá ao final da contagem...';

    let cont = data.segundos;
    statusCorrida.textContent = `Largada em ${cont}...`;

    const timer = setInterval(() => {
        cont--;
        if (cont > 0) {
            statusCorrida.textContent = `Largada em ${cont}...`;
        } else {
            clearInterval(timer);
        }
    }, 1000);
});

socket.on('jogo:comecar', (data) => {
    statusCorrida.textContent = '🏎️ VALENDO!';
    textoOficialAtual = data.textoOficial;
    textoOficialP.textContent = textoOficialAtual;
    renderizarPistas(data.jogadores);
    iniciarCronometro(data.timestampInicio);

    if (meuPapel !== 'Espectador') {
        inputDigitacao.disabled = false;
        inputDigitacao.placeholder = 'Comece a digitar aqui...';
        inputDigitacao.focus();
    } else {
        inputDigitacao.placeholder = 'Modo Espectador (apenas assistindo)';
    }
});

inputDigitacao.addEventListener('paste', (e) => {
    e.preventDefault();
    alert('Colar texto não é permitido!');
});

inputDigitacao.addEventListener('input', () => {
    socket.emit('jogo:digitar', { texto: inputDigitacao.value });
});

// Marcação exata: Verde enquanto acerta; Vermelho e trava na letra exata se errar
socket.on('jogo:feedback_texto', (data) => {
    const { acertos, temErro } = data;

    if (temErro) {
        inputDigitacao.classList.add('borda-erro');
        // Pinta o trecho alcançado até o ponto do erro em VERMELHO e para de preencher o restante
        const limiteErro = Math.min(acertos + 1, textoOficialAtual.length);
        const parteVermelha = textoOficialAtual.substring(0, limiteErro);
        const parteRestante = textoOficialAtual.substring(limiteErro);
        textoOficialP.innerHTML = `<span class="letra-errada">${parteVermelha}</span>${parteRestante}`;
    } else {
        inputDigitacao.classList.remove('borda-erro');
        // Pinta todo o trecho digitado corretamente em VERDE
        const parteVerde = textoOficialAtual.substring(0, acertos);
        const parteRestante = textoOficialAtual.substring(acertos);
        textoOficialP.innerHTML = `<span class="letra-correta">${parteVerde}</span>${parteRestante}`;
    }
});

socket.on('jogo:progresso_atualizado', (data) => {
    renderizarPistas(data.jogadores);
});

function renderizarPistas(jogadores) {
    pistasContainer.innerHTML = '';
    jogadores.filter(j => j.papel !== 'Espectador').forEach(j => {
        const div = document.createElement('div');
        div.className = 'pista-item';
        div.innerHTML = `
      <div class="pista-header">
        <span>${j.nome} (${j.papel})</span>
        <span>${j.progresso}% ${j.concluido ? '🏁' : ''}</span>
      </div>
      <div class="barra-fundo">
        <div class="barra-progresso" style="width: ${j.progresso}%"></div>
      </div>
    `;
        pistasContainer.appendChild(div);
    });
}

btnFinalizar.addEventListener('click', () => {
    socket.emit('jogo:finalizar');
});

socket.on('jogo:fim', (data) => {
    pararCronometro();
    inputDigitacao.disabled = true;
    mostrarTela(telaResultado);

    // Ranking da partida atual
    listaRanking.innerHTML = '';
    data.rankingRodada.forEach((j, index) => {
        const li = document.createElement('li');
        const tempoTxt = j.tempoFinal !== null ? `${j.tempoFinal}s (${j.ppm} PPM)` : 'Não concluiu';
        li.innerHTML = `<span><strong>${index + 1}º Lugar:</strong> ${j.nome}</span> <span class="badge">${tempoTxt}</span>`;
        listaRanking.appendChild(li);
    });

    // Ranking histórico de melhores tempos da sala (do menor para o maior)
    if (data.historicoTempos && data.historicoTempos.length > 0) {
        secaoHistorico.classList.remove('hidden');
        listaHistoricoTempos.innerHTML = '';
        data.historicoTempos.forEach((item, index) => {
            const li = document.createElement('li');
            li.innerHTML = `<span><strong>#${index + 1}</strong> — ${item.nome} <small>(${item.data})</small></span> <span class="badge">${item.tempo}s (${item.ppm} PPM)</span>`;
            listaHistoricoTempos.appendChild(li);
        });
    } else {
        secaoHistorico.classList.add('hidden');
    }
});

btnVoltarLobby.addEventListener('click', () => {
    socket.emit('jogo:voltar_lobby');
});

socket.on('sala:jogador_desconectou', (data) => {
    alert(data.mensagem);
    if (data.estado === 'LOBBY') {
        pararCronometro();
        mostrarTela(telaLobby);
    }
});

socket.on('erro:mensagem', (data) => alert(data.mensagem));