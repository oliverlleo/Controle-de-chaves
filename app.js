import {
  db, ensureAnonymousAuth, getFirebaseErrorCode, collection, addDoc, doc, getDoc, updateDoc, deleteDoc,
  serverTimestamp, query, orderBy, onSnapshot
} from './firebase.js';

const state = { uid: 'sem-auth', obras: [], portas: [], chaves: [], movimentacoes: [], authOk: false };
const STATUSES = ['disponivel_empresa', 'separada_cliente', 'separada_instalacao', 'requisitada', 'entregue_cliente', 'entregue_instalador', 'devolvida', 'indisponivel'];
const el = (id) => document.getElementById(id);
const toast = (msg) => { const t = el('toast'); t.textContent = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2200); };

function setAlert(msg) {
  const box = el('system-alert');
  if (!box) return;
  if (!msg) { box.hidden = true; box.textContent = ''; return; }
  box.hidden = false;
  box.textContent = msg;
}

function humanizeError(err) {
  const code = getFirebaseErrorCode(err);
  if (`${code}`.includes('auth/configuration-not-found')) return 'Autenticação anônima não habilitada no Firebase Console.';
  if (`${code}`.includes('auth/operation-not-allowed')) return 'Método de login anônimo está desabilitado no Firebase Auth.';
  if (`${code}`.includes('permission-denied')) return 'Firestore sem permissão para ler/gravar. Verifique regras/publicação.';
  return `Erro Firebase: ${code}`;
}

async function runDb(action, successMessage = '') {
  try {
    await action();
    if (successMessage) toast(successMessage);
  } catch (error) {
    const msg = humanizeError(error);
    toast(msg);
    setAlert(msg);
    throw error;
  }
}

function bindNavigation() {
  document.querySelectorAll('#main-nav button').forEach((btn) => btn.onclick = () => {
    document.querySelectorAll('#main-nav button').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
    el(btn.dataset.target).classList.add('active');
  });
}

function fmtDate(ts) {
  const d = ts?.toDate ? ts.toDate() : ts?.seconds ? new Date(ts.seconds * 1000) : ts ? new Date(ts) : null;
  return d ? d.toLocaleString('pt-BR') : '-';
}
function table(headers, rows) { return `<table class="table"><thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('') || '<tr><td colspan="99">Sem dados</td></tr>'}</tbody></table>`; }

function renderDashboard() {
  const count = (f) => state.chaves.filter(f).length;
  el('dashboard').innerHTML = `<div class="cards">${[
    ['Total de chaves cadastradas', state.chaves.length],
    ['Chaves na empresa', count((c) => c.disponivelAqui)],
    ['Separadas para cliente', count((c) => c.statusAtual === 'separada_cliente')],
    ['Separadas para instalação', count((c) => c.statusAtual === 'separada_instalacao')],
    ['Entregues ao cliente', count((c) => c.statusAtual === 'entregue_cliente')],
    ['Entregues ao instalador', count((c) => c.statusAtual === 'entregue_instalador')],
    ['Atualmente requisitadas', count((c) => c.requisitada)],
    ['Devolvidas', count((c) => c.statusAtual === 'devolvida')]
  ].map(([t, v]) => `<article class="card"><small>${t}</small><strong>${v}</strong></article>`).join('')}</div>
  <div class="panel"><h3>Últimas movimentações</h3><div class="timeline">${state.movimentacoes.slice(0, 6).map((m) => `<div class="timeline-item"><b>${m.tipoMovimentacao}</b> - ${m.nomePessoa || 'N/A'}<br/><small>${fmtDate(m.dataHora)}</small></div>`).join('') || '<small>Sem movimentações</small>'}</div></div>`;
  renderChart();
}

function renderObras() {
  el('obras-list').innerHTML = table(['Obra', 'Código', 'Cliente', 'Data', 'Ações'], state.obras.map((o) => `<tr><td>${o.nome}</td><td>${o.codigo || '-'}</td><td>${o.cliente || '-'}</td><td>${fmtDate(o.dataCadastro)}</td><td><button data-edit-obra="${o.id}">Editar</button> <button data-del-obra="${o.id}">Excluir</button></td></tr>`));
  const ops = '<option value="">Selecione a obra</option>' + state.obras.map((o) => `<option value="${o.id}">${o.nome}</option>`).join('');
  el('obra-select').innerHTML = ops;
  el('filter-obra').innerHTML = '<option value="">Todas as obras</option>' + state.obras.map((o) => `<option value="${o.id}">${o.nome}</option>`).join('');
}

function renderPortas() {
  const obraNome = (id) => state.obras.find((o) => o.id === id)?.nome || '-';
  el('portas-list').innerHTML = table(['Obra', 'Porta', 'Descrição', 'Padrão', 'Ações'], state.portas.map((p) => `<tr><td>${obraNome(p.obraId)}</td><td>${p.identificacao}</td><td>${p.descricao || '-'}</td><td>2 cliente / 1 instalação</td><td><button data-edit-porta="${p.id}">Editar</button> <button data-del-porta="${p.id}">Excluir</button></td></tr>`));
}

function renderChaves() {
  const destino = el('filter-destino').value;
  const status = el('filter-status').value;
  const obraId = el('filter-obra').value;
  const q = el('global-search').value.toLowerCase();
  const obraNome = (id) => state.obras.find((o) => o.id === id)?.nome || '-';
  const portaNome = (id) => state.portas.find((p) => p.id === id)?.identificacao || '-';
  const list = state.chaves.filter((c) => (!destino || c.tipoDestino === destino) && (!status || c.statusAtual === status) && (!obraId || c.obraId === obraId))
    .filter((c) => `${obraNome(c.obraId)} ${portaNome(c.portaId)} ${c.statusAtual} ${c.tipoDestino}`.toLowerCase().includes(q));

  el('chaves-list').innerHTML = table(['Obra', 'Porta', 'Destino', 'Status', 'Disponível Aqui', 'Ações'], list.map((c) => `<tr><td>${obraNome(c.obraId)}</td><td>${portaNome(c.portaId)}</td><td><span class="badge b-${c.tipoDestino}">${c.tipoDestino}</span></td><td><span class="badge b-status">${c.statusAtual}</span></td><td>${c.disponivelAqui ? 'Sim' : 'Não'}</td><td><button data-del-chave="${c.id}">Excluir</button></td></tr>`));
  el('mov-chave').innerHTML = '<option value="">Selecione a chave</option>' + list.map((c) => `<option value="${c.id}">${obraNome(c.obraId)} / ${portaNome(c.portaId)} / ${c.tipoDestino} / ${c.statusAtual}</option>`).join('');
}

function renderHistorico() {
  el('historico-list').innerHTML = `<div class="timeline">${state.movimentacoes.map((m) => `<div class="timeline-item"><b>${m.tipoMovimentacao}</b> • ${m.nomePessoa || 'Sem pessoa'}<br/><small>${m.observacao || 'Sem observação'} • ${fmtDate(m.dataHora)}</small></div>`).join('') || '<small>Sem histórico</small>'}</div>`;
}

function renderChart() {
  const ctx = el('status-chart');
  if (!ctx || !window.Chart) return;
  if (window._chart) window._chart.destroy();
  window._chart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Na empresa', 'Requisitada', 'Entregue Cliente', 'Entregue Instalador', 'Devolvida'],
      datasets: [{
        data: [
          state.chaves.filter((c) => c.disponivelAqui).length,
          state.chaves.filter((c) => c.requisitada).length,
          state.chaves.filter((c) => c.statusAtual === 'entregue_cliente').length,
          state.chaves.filter((c) => c.statusAtual === 'entregue_instalador').length,
          state.chaves.filter((c) => c.statusAtual === 'devolvida').length
        ],
        backgroundColor: ['#e0182d', '#ff6c7d', '#6d80ff', '#3ec6ff', '#15b67b']
      }]
    },
    options: { plugins: { legend: { display: false } } }
  });
}

function bindForms() {
  el('obra-form').onsubmit = async (e) => {
    e.preventDefault();
    await runDb(async () => {
      await addDoc(collection(db, 'obras'), { ...Object.fromEntries(new FormData(e.target)), dataCadastro: serverTimestamp() });
      e.target.reset();
    }, 'Obra cadastrada com sucesso');
  };

  el('porta-form').onsubmit = async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    await runDb(async () => {
      const portaRef = await addDoc(collection(db, 'portas'), { obraId: data.obraId, identificacao: data.identificacao, descricao: data.descricao || '', observacoes: data.observacoes || '', totalChaves: 3, qtdCliente: 2, qtdInstalacao: 1, dataCadastro: serverTimestamp() });
      const base = { obraId: data.obraId, portaId: portaRef.id, localAtual: 'empresa', disponivelAqui: true, entregue: false, requisitada: false, dataCadastro: serverTimestamp() };
      await addDoc(collection(db, 'chaves'), { ...base, tipoDestino: 'cliente', statusAtual: 'separada_cliente' });
      await addDoc(collection(db, 'chaves'), { ...base, tipoDestino: 'cliente', statusAtual: 'separada_cliente' });
      await addDoc(collection(db, 'chaves'), { ...base, tipoDestino: 'instalacao', statusAtual: 'separada_instalacao' });
      await addDoc(collection(db, 'movimentacoes'), { obraId: data.obraId, portaId: portaRef.id, tipoMovimentacao: 'cadastro', nomePessoa: 'sistema', categoriaPessoa: 'sistema', observacao: 'Porta cadastrada e 3 chaves geradas', dataHora: serverTimestamp(), usuarioAnonimoId: state.uid });
      e.target.reset();
    }, 'Porta e chaves criadas');
  };

  el('mov-form').onsubmit = async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    await runDb(async () => {
      const chaveRef = doc(db, 'chaves', data.chaveId);
      const snap = await getDoc(chaveRef);
      if (!snap.exists()) { toast('Chave não encontrada'); return; }
      const chave = snap.data();
      const patchMap = {
        requisicao: { statusAtual: 'requisitada', requisitada: true, disponivelAqui: false, localAtual: data.nomePessoa },
        devolucao: { statusAtual: 'devolvida', requisitada: false, disponivelAqui: true, localAtual: 'empresa' },
        entrega_cliente: { statusAtual: 'entregue_cliente', entregue: true, requisitada: false, disponivelAqui: false, localAtual: data.nomePessoa },
        entrega_instalador: { statusAtual: 'entregue_instalador', entregue: true, requisitada: false, disponivelAqui: false, localAtual: data.nomePessoa }
      };
      await updateDoc(chaveRef, patchMap[data.tipoMovimentacao]);
      await addDoc(collection(db, 'movimentacoes'), { chaveId: data.chaveId, obraId: chave.obraId, portaId: chave.portaId, tipoMovimentacao: data.tipoMovimentacao, nomePessoa: data.nomePessoa, categoriaPessoa: data.categoriaPessoa || '', observacao: data.observacao || '', dataHora: serverTimestamp(), usuarioAnonimoId: state.uid });
      e.target.reset();
    }, 'Movimentação registrada');
  };

  el('filter-destino').onchange = renderChaves;
  el('filter-status').onchange = renderChaves;
  el('filter-obra').onchange = renderChaves;
  el('global-search').oninput = renderChaves;
  el('filter-status').innerHTML = '<option value="">Todos os status</option>' + STATUSES.map((s) => `<option value="${s}">${s}</option>`).join('');
}

function bindActions() {
  document.body.addEventListener('click', async (e) => {
    const id = e.target.dataset.delObra;
    if (id && confirm('Excluir obra?')) await runDb(() => deleteDoc(doc(db, 'obras', id)), 'Obra excluída');

    const pid = e.target.dataset.delPorta;
    if (pid && confirm('Excluir porta?')) await runDb(() => deleteDoc(doc(db, 'portas', pid)), 'Porta excluída');

    const kid = e.target.dataset.delChave;
    if (kid && confirm('Excluir chave?')) await runDb(() => deleteDoc(doc(db, 'chaves', kid)), 'Chave excluída');

    const eid = e.target.dataset.editObra;
    if (eid) {
      const nome = prompt('Novo nome da obra:');
      if (nome) await runDb(() => updateDoc(doc(db, 'obras', eid), { nome }), 'Obra atualizada');
    }

    const ep = e.target.dataset.editPorta;
    if (ep) {
      const identificacao = prompt('Nova identificação da porta:');
      if (identificacao) await runDb(() => updateDoc(doc(db, 'portas', ep), { identificacao }), 'Porta atualizada');
    }
  });
}

function bindCollection(name, setter) {
  onSnapshot(
    query(collection(db, name), orderBy(name === 'movimentacoes' ? 'dataHora' : 'dataCadastro', 'desc')),
    (snap) => {
      setter(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      renderObras();
      renderPortas();
      renderChaves();
      renderDashboard();
      renderHistorico();
    },
    (error) => {
      const msg = humanizeError(error);
      setAlert(msg);
      toast(msg);
    }
  );
}

function subscribe() {
  bindCollection('obras', (rows) => { state.obras = rows; });
  bindCollection('portas', (rows) => { state.portas = rows; });
  bindCollection('chaves', (rows) => { state.chaves = rows; });
  bindCollection('movimentacoes', (rows) => { state.movimentacoes = rows; });
}

(async function init() {
  bindNavigation();
  bindForms();
  bindActions();

  const authResult = await ensureAnonymousAuth();
  if (authResult.ok && authResult.user) {
    state.authOk = true;
    state.uid = authResult.user.uid;
    el('uid-display').textContent = authResult.user.uid;
  } else {
    state.authOk = false;
    state.uid = 'sem-auth-configurada';
    el('uid-display').textContent = `${state.uid} (${authResult.code || 'erro'})`;
    setAlert('Auth anônima não configurada no Firebase. O sistema continua, mas o UID será local até habilitar: Firebase Console > Authentication > Sign-in method > Anonymous.');
  }

  subscribe();
})();
