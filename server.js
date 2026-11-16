const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static('public'));

const salas = {};

io.on('connection', (socket) => {
  console.log(`[LOG] Cliente conectado: ${socket.id}`);

  socket.on('sala:criar_ou_entrar', (data) => {
    try {
      const { nomeUsuario, codigoSala } = data;
      const salaId = codigoSala || 'SALA-1';
      
      socket.join(salaId);
      socket.salaId = salaId;
      socket.nomeUsuario = nomeUsuario || 'Jogador';

      if (!salas[salaId]) {
        salas[salaId] = { jogadores: [], estado: 'LOBBY' };
      }

      const sala = salas[salaId];
      let papel = 'Espectador';

      const qtdJogadores = sala.jogadores.filter(p => p.papel !== 'Espectador').length;
      if (qtdJogadores === 0) papel = 'Jogador 1';
      else if (qtdJogadores === 1) papel = 'Jogador 2';

      socket.papel = papel;
      sala.jogadores.push({ id: socket.id, nome: socket.nomeUsuario, papel });

      console.log(`[SALA ${salaId}] ${socket.nomeUsuario} entrou como ${papel}`);

      socket.emit('sala:papel_atribuido', { papel, salaId });
      io.to(salaId).emit('sala:estado_atualizado', { jogadores: sala.jogadores, estado: sala.estado });
    } catch (err) {
      console.error(`[ERRO]`, err.message);
      socket.emit('erro:mensagem', { mensagem: 'Erro interno ao entrar na sala.' });
    }
  });

  socket.on('disconnect', () => {
    console.log(`[LOG] Cliente desconectado: ${socket.id}`);
    const salaId = socket.salaId;

    if (salaId && salas[salaId]) {
      const sala = salas[salaId];
      sala.jogadores = sala.jogadores.filter(j => j.id !== socket.id);

      io.to(salaId).emit('sala:jogador_desconectou', {
        mensagem: `O jogador ${socket.nomeUsuario} desconectou.`,
        jogadores: sala.jogadores
      });

      if (sala.jogadores.length === 0) {
        delete salas[salaId];
        console.log(`[SALA ${salaId}] Sala encerrada (vazia).`);
      }
    }
  });
});

const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n==================================================`);
  console.log(` Servidor Arena Distribuida rodando na porta ${PORT}`);
  console.log(` Local: http://localhost:${PORT}`);
  console.log(`==================================================\n`);
});