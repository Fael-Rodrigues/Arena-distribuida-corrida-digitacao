const socket = io();

const telaLogin = document.getElementById('tela-login');
const telaLobby = document.getElementById('tela-lobby');
const telaCorrida = document.getElementById('tela-corrida');
const telaResultado = document.getElementById('tela-resultado');

const statusConexao = document.getElementById('status-conexao');
const meuPapelSpan = document.getElementById('meu-papel');
const idSalaSpan = document.getElementById('id-sala');
const listaJogadores = document.getElementById('lista-jogadores');
const btnEntrar = document.getElementById('btn-entrar');
const btnIniciar = document.getElementById('btn-iniciar');
const msgAguardando = document.getElementById('msg-aguardando');
const avisoRecordeLobby = document.getElementById('aviso-recorde-lobby');

const statusCorrida = document.getElementById('status-corrida');
const btnFinalizar = document.getElementById('btn-finalizar');
const pistasContainer = document.getElementById('pistas-container');
const textoOficialP = document.getElementById('texto-oficial');
const inputDigitacao = document.getElementById('input-digitacao');

const listaRanking = document.getElementById('lista-ranking');
const boxRecordeFinal = document.getElementById('box-recorde-final');
const btnVoltarLobby = document.getElementById('btn-voltar-lobby');

let meuPapel = '';
let textoOficialAtual = '';

function mostrarTela(tela) {
    telaLogin.classList.add('hidden');
    telaLobby.classList.add('hidden');
    telaCorrida.classList.add('hidden');
    telaResultado.classList.add('hidden');
    tela.classList.remove('hidden');
}

socket.on('connect', () => {
    statusConexao.textContent = '🟢 Conectado ao servidor';
    statusConexao.style.color = 'green';
});

socket.on('disconnect', () => {
    statusConexao.textContent = '🔴 Desconectado do servidor';
    statusConexao.style.color = 'red';
});

btnEntrar.addEventListener('click', () => {
    const nomeUsuario = document.getElementById('nome').value.trim();
    const codigoSala = document.getElementById('sala').value.trim();
    if (nomeUsuario && codigoSala) {
        socket.emit('sala:criar_ou_entrar', { nomeUsuario, codigoSala });
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
        mostrarTela(telaLobby);
    }

    listaJogadores.innerHTML = '';
    data.jogadores.forEach(j => {
        const li = document.createElement('li');
        const badgeVitorias = j.vitorias > 0 ? `<span class="badge-vitorias">🏆 ${j.vitorias}</span>` : '';
        li.innerHTML = `<span><strong>${j.nome}</strong></span> <div>${badgeVitorias}<span class="badge">${j.papel}</span></div>`;
        listaJogadores.appendChild(li);
    });

    if (data.melhorTempoSolo !== null && data.jogadores.length === 1) {
        avisoRecordeLobby.textContent = `⏱️ Seu recorde atual nesta sala: ${data.melhorTempoSolo}s. Clique em Iniciar para tentar superá-lo!`;
        avisoRecordeLobby.classList.remove('hidden');
    } else {
        avisoRecordeLobby.classList.add('hidden');
    }
});

btnIniciar.addEventListener('click', () => {
    socket.emit('jogo:iniciar');
});

socket.on('jogo:contagem', (data) => {
    mostrarTela(telaCorrida);
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
    statusCorrida.textContent = '🏎️ VALENDO! Digite o texto abaixo:';
    textoOficialAtual = data.textoOficial;
    textoOficialP.textContent = textoOficialAtual;
    renderizarPistas(data.jogadores);

    if (meuPapel !== 'Espectador') {
        inputDigitacao.disabled = false;
        inputDigitacao.placeholder = 'Comece a digitar aqui...';
        inputDigitacao.focus();
    } else {
        inputDigitacao.placeholder = 'Modo Espectador (apenas assistindo)';
    }
});

// Bloqueia Ctrl+V / Colar no campo de texto
inputDigitacao.addEventListener('paste', (e) => {
    e.preventDefault();
    alert('Colar texto não é permitido!');
});

inputDigitacao.addEventListener('input', () => {
    socket.emit('jogo:digitar', { texto: inputDigitacao.value });
});

socket.on('jogo:feedback_texto', (data) => {
    const { acertos, temErro, tamanhoDigitado } = data;

    if (temErro) {
        inputDigitacao.classList.add('borda-erro');
    } else {
        inputDigitacao.classList.remove('borda-erro');
    }

    const parteCorreta = textoOficialAtual.substring(0, acertos);
    const parteErrada = temErro ? textoOficialAtual.substring(acertos, tamanhoDigitado) : '';
    const parteRestante = textoOficialAtual.substring(temErro ? tamanhoDigitado : acertos);

    textoOficialP.innerHTML =
        `<span class="letra-correta">${parteCorreta}</span>` +
        `<span class="letra-errada">${parteErrada}</span>` +
        `${parteRestante}`;
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
    inputDigitacao.disabled = true;
    mostrarTela(telaResultado);

    if (data.mensagemRecorde) {
        boxRecordeFinal.textContent = data.mensagemRecorde;
        boxRecordeFinal.classList.remove('hidden');
    } else {
        boxRecordeFinal.classList.add('hidden');
    }

    listaRanking.innerHTML = '';
    data.ranking.forEach((j, index) => {
        const li = document.createElement('li');
        const tempoTxt = j.tempoFinal !== null ? `${j.tempoFinal}s (${j.ppm} PPM)` : 'Não concluiu';
        li.innerHTML = `<span><strong>${index + 1}º Lugar:</strong> ${j.nome}</span> <span class="badge">${tempoTxt}</span>`;
        listaRanking.appendChild(li);
    });
});

btnVoltarLobby.addEventListener('click', () => {
    socket.emit('jogo:voltar_lobby');
});

socket.on('sala:jogador_desconectou', (data) => {
    alert(data.mensagem);
    if (data.estado === 'LOBBY') {
        mostrarTela(telaLobby);
    }
});

socket.on('erro:mensagem', (data) => alert(data.mensagem));