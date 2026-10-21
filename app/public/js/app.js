/**
 * ==============================================================================
 * VITACARE CENTRAL MULTIATENDENTE — FRONTEND CONTROLLER
 * ==============================================================================
 * Shinkō Systems — Laboratório de IA
 * ==============================================================================
 */

let token = localStorage.getItem('vitacare_token') || null;
let usuario = JSON.parse(localStorage.getItem('vitacare_user') || 'null');
let conversaAtivaId = null;
let setorFiltro = 'todos';
let kanbanSetorFiltro = 'todos';
let conversasPolling = null;
let mensagensPolling = null;
let debounceTimeout = null;

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
  if (token && usuario) {
    iniciarApp();
  } else {
    exibirLogin();
  }

  // Listener do Form de Login
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', tratarSubmitLogin);
  }

  // Listener de Envio do Chat
  const chatForm = document.getElementById('chat-send-form');
  if (chatForm) {
    chatForm.addEventListener('submit', tratarEnvioMensagem);
  }

  // Listener do Form de Transferir
  const formTransferir = document.getElementById('form-transferir');
  if (formTransferir) {
    formTransferir.addEventListener('submit', tratarSubmitTransferir);
  }

  // Listener do Form de Demanda Kanban
  const formDemanda = document.getElementById('form-demanda');
  if (formDemanda) {
    formDemanda.addEventListener('submit', tratarSubmitDemanda);
  }
});

// ------------------------------------------------------------------------------
// AUTENTICAÇÃO
// ------------------------------------------------------------------------------
function exibirLogin() {
  document.getElementById('login-view').classList.remove('hidden');
  document.getElementById('app-view').classList.add('hidden');
  if (conversasPolling) clearInterval(conversasPolling);
  if (mensagensPolling) clearInterval(mensagensPolling);
}

function iniciarApp() {
  document.getElementById('login-view').classList.add('hidden');
  document.getElementById('app-view').classList.remove('hidden');

  document.getElementById('header-user-nome').textContent = usuario.nome;
  document.getElementById('header-user-email').textContent = usuario.email;
  document.getElementById('header-user-setor').textContent = capitalizar(usuario.setor_padrao || 'Geral');

  // Carrega conversas imediatamente e agenda polling
  carregarConversas();
  conversasPolling = setInterval(carregarConversas, 3500);

  // Inicializa ícones Feather
  if (window.feather) feather.replace();
}

async function tratarSubmitLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const senha = document.getElementById('login-senha').value;
  const erroDiv = document.getElementById('login-erro');
  const submitBtn = document.getElementById('login-submit-btn');

  erroDiv.classList.add('hidden');
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span>Entrando...</span>';

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, senha }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Falha ao autenticar');
    }

    token = data.token;
    usuario = data.usuario;
    localStorage.setItem('vitacare_token', token);
    localStorage.setItem('vitacare_user', JSON.stringify(usuario));

    iniciarApp();
  } catch (err) {
    erroDiv.textContent = err.message;
    erroDiv.classList.remove('hidden');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<span>Entrar no Sistema</span><i data-feather="arrow-right" class="w-4 h-4"></i>';
    if (window.feather) feather.replace();
  }
}

function realizarLogout() {
  localStorage.removeItem('vitacare_token');
  localStorage.removeItem('vitacare_user');
  token = null;
  usuario = null;
  conversaAtivaId = null;
  exibirLogin();
}

// ------------------------------------------------------------------------------
// NAVEGAÇÃO ENTRE ABAS PRINCIPAIS
// ------------------------------------------------------------------------------
function trocarAbaPrincipal(aba) {
  const btnChat = document.getElementById('nav-btn-chat');
  const btnKanban = document.getElementById('nav-btn-kanban');
  const secChat = document.getElementById('chat-section');
  const secKanban = document.getElementById('kanban-section');

  if (aba === 'chat') {
    btnChat.className = 'px-3.5 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-2 bg-blue-600 text-white shadow-sm';
    btnKanban.className = 'px-3.5 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white transition flex items-center gap-2';
    secChat.classList.remove('hidden');
    secKanban.classList.add('hidden');
    carregarConversas();
  } else {
    btnKanban.className = 'px-3.5 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-2 bg-blue-600 text-white shadow-sm';
    btnChat.className = 'px-3.5 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white transition flex items-center gap-2';
    secKanban.classList.remove('hidden');
    secChat.classList.add('hidden');
    carregarKanban();
  }

  if (window.feather) feather.replace();
}

// ------------------------------------------------------------------------------
// CONVERSAS & CHAT
// ------------------------------------------------------------------------------
function filtrarSetor(setor) {
  setorFiltro = setor;
  ['todos', 'comercial', 'agendamento', 'tecnico'].forEach(s => {
    const el = document.getElementById(`pill-setor-${s}`);
    if (el) {
      if (s === setor) {
        el.className = 'px-2.5 py-1 rounded-md bg-blue-600 text-white shrink-0 font-semibold';
      } else {
        el.className = 'px-2.5 py-1 rounded-md bg-slate-800 text-slate-300 hover:bg-slate-700 shrink-0';
      }
    }
  });
  carregarConversas();
}

function debounceCarregarConversas() {
  clearTimeout(debounceTimeout);
  debounceTimeout = setTimeout(carregarConversas, 300);
}

async function carregarConversas() {
  if (!token) return;

  const busca = document.getElementById('filtro-busca')?.value || '';
  const url = `/api/conversas?setor=${setorFiltro}&busca=${encodeURIComponent(busca)}`;

  try {
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (res.status === 401) {
      realizarLogout();
      return;
    }

    const conversas = await res.json();
    renderizarListaConversas(conversas);
  } catch (err) {
    console.error('Erro ao carregar conversas:', err);
  }
}

function renderizarListaConversas(conversas) {
  const container = document.getElementById('lista-conversas');
  if (!container) return;

  if (conversas.length === 0) {
    container.innerHTML = `
      <div class="p-8 text-center text-xs text-slate-500">
        Nenhum atendimento encontrado neste filtro.
      </div>
    `;
    return;
  }

  let html = '';
  conversas.forEach(c => {
    const ativo = c.id === conversaAtivaId ? 'bg-slate-800/90 border-l-4 border-cyan-400' : 'hover:bg-slate-800/40 border-l-4 border-transparent';
    const iniciais = extrairIniciais(c.nome_contato || c.chat_id);
    const hora = formatarHora(c.ultima_mensagem_at);
    const naoLidas = parseInt(c.nao_lidas || 0, 10);

    let corSetor = 'text-cyan-400 bg-cyan-950/60 border-cyan-800/40';
    if (c.setor_atual === 'agendamento') corSetor = 'text-blue-400 bg-blue-950/60 border-blue-800/40';
    if (c.setor_atual === 'tecnico') corSetor = 'text-emerald-400 bg-emerald-950/60 border-emerald-800/40';

    html += `
      <div onclick="selecionarConversa('${c.id}')" 
        class="p-3.5 cursor-pointer transition flex items-start gap-3 ${ativo}">
        <div class="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-xs text-slate-200 shrink-0">
          ${iniciais}
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center justify-between mb-1">
            <h4 class="text-xs font-bold text-white truncate">${c.nome_contato || c.chat_id}</h4>
            <span class="text-[10px] text-slate-500 shrink-0">${hora}</span>
          </div>
          <div class="flex items-center justify-between">
            <p class="text-[11px] text-slate-400 truncate max-w-[180px]">
              ${c.ultima_mensagem_preview || 'Nova conversa iniciada'}
            </p>
            ${naoLidas > 0 ? `<span class="px-1.5 py-0.5 rounded-full bg-cyan-500 text-slate-950 text-[10px] font-bold">${naoLidas}</span>` : ''}
          </div>
          <div class="flex items-center gap-1.5 mt-2">
            <span class="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${corSetor}">
              ${c.setor_atual}
            </span>
            ${c.nome_fantasia ? `<span class="text-[9px] text-slate-400 truncate max-w-[120px]">🏢 ${c.nome_fantasia}</span>` : ''}
          </div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

async function selecionarConversa(id) {
  conversaAtivaId = id;
  document.getElementById('chat-empty-state').classList.add('hidden');
  document.getElementById('chat-active-state').classList.remove('hidden');

  // Polling de mensagens da conversa ativa
  if (mensagensPolling) clearInterval(mensagensPolling);
  await carregarMensagens(id);
  mensagensPolling = setInterval(() => carregarMensagens(id), 2500);

  // Atualiza destaque visual na lista
  carregarConversas();
}

async function carregarMensagens(conversaId) {
  if (!token || conversaId !== conversaAtivaId) return;

  try {
    const res = await fetch(`/api/conversas/${conversaId}/mensagens`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) return;

    const mensagens = await res.json();
    renderizarMensagens(mensagens);
  } catch (err) {
    console.error('Erro ao carregar mensagens:', err);
  }
}

function renderizarMensagens(mensagens) {
  const container = document.getElementById('mensagens-container');
  if (!container) return;

  const isAtBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 100;

  if (mensagens.length === 0) {
    container.innerHTML = `
      <div class="text-center p-8 text-xs text-slate-500">
        Nenhuma mensagem trocada ainda. Envie a primeira mensagem abaixo!
      </div>
    `;
    return;
  }

  let html = '';
  mensagens.forEach(m => {
    const isOut = m.direcao === 'outbound';
    const alignClass = isOut ? 'justify-end' : 'justify-start';
    const bubbleClass = isOut ? 'chat-bubble-out' : 'chat-bubble-in';
    const hora = formatarHora(m.created_at);

    html += `
      <div class="flex ${alignClass}">
        <div class="max-w-[75%] rounded-2xl p-3 shadow-md ${bubbleClass}">
          ${isOut && m.operador_nome ? `<div class="text-[10px] font-bold text-cyan-200 mb-0.5">${m.operador_nome}</div>` : ''}
          <div class="text-xs leading-relaxed whitespace-pre-wrap">${escapeHTML(m.conteudo)}</div>
          <div class="text-[9px] mt-1 text-right opacity-70 flex items-center justify-end gap-1">
            <span>${hora}</span>
            ${isOut ? '<i data-feather="check" class="w-2.5 h-2.5"></i>' : ''}
          </div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
  if (window.feather) feather.replace();

  if (isAtBottom) {
    container.scrollTop = container.scrollHeight;
  }
}

function tratarKeyDownChat(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    tratarEnvioMensagem(e);
  }
}

async function tratarEnvioMensagem(e) {
  if (e) e.preventDefault();
  if (!conversaAtivaId || !token) return;

  const input = document.getElementById('chat-input-text');
  const texto = input.value.trim();
  if (!texto) return;

  input.value = '';

  try {
    const res = await fetch(`/api/conversas/${conversaAtivaId}/mensagens`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ texto }),
    });

    if (res.ok) {
      await carregarMensagens(conversaAtivaId);
      const container = document.getElementById('mensagens-container');
      if (container) container.scrollTop = container.scrollHeight;
    }
  } catch (err) {
    console.error('Erro ao enviar mensagem:', err);
  }
}

// ------------------------------------------------------------------------------
// MODAL: TRANSFERÊNCIA DE SETOR
// ------------------------------------------------------------------------------
function abrirModalTransferir() {
  document.getElementById('modal-transferir').classList.remove('hidden');
}

function fecharModalTransferir() {
  document.getElementById('modal-transferir').classList.add('hidden');
}

async function tratarSubmitTransferir(e) {
  e.preventDefault();
  if (!conversaAtivaId || !token) return;

  const novoSetor = document.getElementById('select-novo-setor').value;

  try {
    const res = await fetch(`/api/conversas/${conversaAtivaId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ setor_atual: novoSetor }),
    });

    if (res.ok) {
      fecharModalTransferir();
      carregarConversas();
    }
  } catch (err) {
    console.error('Erro ao transferir setor:', err);
  }
}

// ------------------------------------------------------------------------------
// KANBAN & DEMANDAS
// ------------------------------------------------------------------------------
function filtrarKanbanSetor(setor) {
  kanbanSetorFiltro = setor;
  ['todos', 'comercial', 'agendamento', 'tecnico'].forEach(s => {
    const el = document.getElementById(`kfilter-${s}`);
    if (el) {
      if (s === setor) {
        el.className = 'px-2.5 py-1 rounded bg-blue-600 text-white font-semibold';
      } else {
        el.className = 'px-2.5 py-1 rounded bg-slate-800 text-slate-400 hover:text-white';
      }
    }
  });
  carregarKanban();
}

async function carregarKanban() {
  if (!token) return;

  try {
    const res = await fetch(`/api/kanban?setor=${kanbanSetorFiltro}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) return;

    const demandas = await res.json();
    renderizarKanban(demandas);
  } catch (err) {
    console.error('Erro ao carregar Kanban:', err);
  }
}

function renderizarKanban(demandas) {
  const colunas = {
    triagem: document.getElementById('coluna-triagem'),
    em_agendamento: document.getElementById('coluna-em_agendamento'),
    aguardando_exame: document.getElementById('coluna-aguardando_exame'),
    concluido: document.getElementById('coluna-concluido'),
  };

  const contadores = {
    triagem: 0,
    em_agendamento: 0,
    aguardando_exame: 0,
    concluido: 0,
  };

  Object.values(colunas).forEach(col => { if (col) col.innerHTML = ''; });

  demandas.forEach(d => {
    const colName = d.status_coluna || 'triagem';
    if (colunas[colName]) {
      contadores[colName]++;

      let badgePrio = 'bg-slate-800 text-slate-300';
      if (d.prioridade === 'alta') badgePrio = 'bg-amber-950 text-amber-400 border border-amber-800/40';
      if (d.prioridade === 'urgente') badgePrio = 'bg-rose-950 text-rose-400 border border-rose-800/40';

      const card = document.createElement('div');
      card.className = 'p-3.5 bg-slate-900 border border-slate-800 rounded-xl shadow hover:border-slate-700 transition space-y-2';
      card.innerHTML = `
        <div class="flex items-start justify-between gap-2">
          <h4 class="text-xs font-bold text-white leading-tight">${escapeHTML(d.titulo)}</h4>
          <span class="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded ${badgePrio}">${d.prioridade}</span>
        </div>
        ${d.descricao ? `<p class="text-[11px] text-slate-400 line-clamp-2">${escapeHTML(d.descricao)}</p>` : ''}
        <div class="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-800/80">
          <span>Setor: <strong class="text-slate-300 uppercase">${d.setor}</strong></span>
          <div class="flex items-center gap-1">
            ${colName !== 'triagem' ? `<button onclick="moverCardKanban('${d.id}', '${colunaAnterior(colName)}')" class="p-1 hover:text-cyan-400">◀</button>` : ''}
            ${colName !== 'concluido' ? `<button onclick="moverCardKanban('${d.id}', '${colunaProxima(colName)}')" class="p-1 hover:text-cyan-400">▶</button>` : ''}
          </div>
        </div>
      `;
      colunas[colName].appendChild(card);
    }
  });

  document.getElementById('badge-count-triagem').textContent = contadores.triagem;
  document.getElementById('badge-count-agendamento').textContent = contadores.em_agendamento;
  document.getElementById('badge-count-exame').textContent = contadores.aguardando_exame;
  document.getElementById('badge-count-concluido').textContent = contadores.concluido;
}

function colunaProxima(atual) {
  if (atual === 'triagem') return 'em_agendamento';
  if (atual === 'em_agendamento') return 'aguardando_exame';
  if (atual === 'aguardando_exame') return 'concluido';
  return 'concluido';
}

function colunaAnterior(atual) {
  if (atual === 'concluido') return 'aguardando_exame';
  if (atual === 'aguardando_exame') return 'em_agendamento';
  if (atual === 'em_agendamento') return 'triagem';
  return 'triagem';
}

async function moverCardKanban(id, novaColuna) {
  try {
    const res = await fetch(`/api/kanban/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ status_coluna: novaColuna }),
    });

    if (res.ok) {
      carregarKanban();
    }
  } catch (err) {
    console.error('Erro ao mover card:', err);
  }
}

function abrirModalCriarDemanda() {
  document.getElementById('modal-demanda').classList.remove('hidden');
}

function fecharModalDemanda() {
  document.getElementById('modal-demanda').classList.add('hidden');
  document.getElementById('form-demanda').reset();
}

async function tratarSubmitDemanda(e) {
  e.preventDefault();
  if (!token) return;

  const titulo = document.getElementById('demanda-titulo').value.trim();
  const setor = document.getElementById('demanda-setor').value;
  const prioridade = document.getElementById('demanda-prioridade').value;
  const descricao = document.getElementById('demanda-descricao').value.trim();

  try {
    const res = await fetch('/api/kanban', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        titulo,
        setor,
        prioridade,
        descricao,
        conversa_origem_id: conversaAtivaId || null,
      }),
    });

    if (res.ok) {
      fecharModalDemanda();
      carregarKanban();
    }
  } catch (err) {
    console.error('Erro ao criar demanda:', err);
  }
}

// ------------------------------------------------------------------------------
// HELPERS
// ------------------------------------------------------------------------------
function extrairIniciais(nome) {
  if (!nome) return 'VT';
  const parts = nome.trim().split(' ');
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return nome.substring(0, 2).toUpperCase();
}

function formatarHora(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function capitalizar(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function escapeHTML(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
