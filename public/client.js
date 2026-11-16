const socket = io();

const telaLogin = document.getElementById('tela-login');
const telaJogo = document.getElementById('tela-jogo');
const btnEntrar = document.getElementById('btn-entrar');
const statusConexao = document.getElementById('status-conexao');
const meuPapelSpan = document.getElementById('meu-papel');
const idSalaSpan = document.getElementById('id-sala');
const listaJogadores = document.getElementById('lista-jogadores');

socket.on('connect', () => {
  statusConexao.textContent = '🟢 Conectado ao servidor';
  statusConexao.style.color = 'green';
});

socket.on('disconnect', () => {
  statusConexao.textContent = '🔴 Desconectado';
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
  meuPapelSpan.textContent = data.papel;
  idSalaSpan.textContent = data.salaId;
  telaLogin.classList.add('hidden');
  telaJogo.classList.remove('hidden');
});

socket.on('sala:estado_atualizado', (data) => {
  listaJogadores.innerHTML = '';
  data.jogadores.forEach(j => {
    const li = document.createElement('li');
    li.innerHTML = `<span><strong>${j.nome}</strong></span> <span class="badge">${j.papel}</span>`;
    listaJogadores.appendChild(li);
  });
});

socket.on('sala:jogador_desconectou', (data) => alert(data.mensagem));
socket.on('erro:mensagem', (data) => alert(data.mensagem));