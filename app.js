import {
  db, ensureAnonymousAuth, getFirebaseErrorCode, collection, addDoc, doc, getDoc, updateDoc, deleteDoc,
  serverTimestamp, query, orderBy, onSnapshot
} from './firebase.js';

const state = { uid: 'sem-auth', obras: [], portas: [], chaves: [], movimentacoes: [], authOk: false, pendingMove: null, dashboardMode: 'resumida', dashboardBuckets: {}, batchSelection: { cliente: new Set(), instalacao: new Set() } };
const STATUSES = ['separada_cliente', 'separada_instalacao', 'requisitada', 'entregue_cliente', 'indisponivel'];
const el = (id) => document.getElementById(id);
const toast = (msg) => { const t = el('toast'); t.textContent = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2200); };

function setAlert(msg) {
  const box = el('system-alert');
  if (!box) return;
  box.hidden = !msg;
  box.textContent = msg || '';
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

const obraNome = (id) => state.obras.find((o) => o.id === id)?.nome || '-';
const portaNome = (id) => state.portas.find((p) => p.id === id)?.identificacao || '-';
const fmtDate = (ts) => {
  const d = ts?.toDate ? ts.toDate() : ts?.seconds ? new Date(ts.seconds * 1000) : ts ? new Date(ts) : null;
  return d ? d.toLocaleString('pt-BR') : '-';
};
const isoLocal = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};


const STATUS_META = {
  separada_cliente: { label: 'Separada (Cliente)', cls: 'st-separada-cliente' },
  separada_instalacao: { label: 'Separada (Instalação)', cls: 'st-separada-instalacao' },
  requisitada: { label: 'Requisitada', cls: 'st-requisitada' },
  entregue_cliente: { label: 'Entregue ao Cliente', cls: 'st-entregue-cliente' },
  indisponivel: { label: 'Indisponível', cls: 'st-indisponivel' }
};
const statusLabel = (status) => STATUS_META[status]?.label || status;
const statusClass = (status) => STATUS_META[status]?.cls || 'st-default';

function table(headers, rows) {
  return `<table class="table"><thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('') || '<tr><td colspan="99">Sem dados</td></tr>'}</tbody></table>`;
}

function keyBuckets() {
  return {
    clienteAqui: state.chaves.filter((c) => c.disponivelAqui && c.tipoDestino === 'cliente' && c.statusAtual !== 'entregue_cliente'),
    instalacaoAqui: state.chaves.filter((c) => c.disponivelAqui && c.tipoDestino === 'instalacao' && c.statusAtual !== 'entregue_cliente'),
    entregueCliente: state.chaves.filter((c) => c.statusAtual === 'entregue_cliente'),
    instalacaoEntregueCliente: state.chaves.filter((c) => c.tipoDestino === 'instalacao' && c.statusAtual === 'entregue_cliente'),
    requisitadas: state.chaves.filter((c) => c.statusAtual === 'requisitada'),
    devolvidasRecentes: state.movimentacoes.filter((m) => m.tipoMovimentacao === 'devolucao').slice(0, 8)
  };
}


function openClientModal(cliente, categoria, chaves) {
  if (!chaves?.length) return toast('Nenhuma chave encontrada para este cliente nesta categoria');
  el('client-modal-title').textContent = `${categoria} • ${cliente}`;
  el('client-modal-body').innerHTML = table(
    ['Obra', 'Porta', 'Destino', 'Status', 'Local'],
    chaves.map((c) => `<tr><td>${obraNome(c.obraId)}</td><td>${portaNome(c.portaId)}</td><td>${c.tipoDestino}</td><td><span class="badge b-status ${statusClass(c.statusAtual)}">${statusLabel(c.statusAtual)}</span></td><td>${c.localAtual || '-'}</td></tr>`)
  );
  el('client-keys-modal').hidden = false;
  setBodyModalLock();
}

function closeClientModal() {
  el('client-keys-modal').hidden = true;
  setBodyModalLock();
}


function setBodyModalLock() {
  const anyOpen = [...document.querySelectorAll('.modal')].some((m) => !m.hidden);
  document.body.classList.toggle('modal-open', anyOpen);
}

function setupModalBackdropClose() {
  document.querySelectorAll('.modal').forEach((modal) => {
    modal.addEventListener('click', (e) => {
      if (e.target !== modal) return;
      if (modal.id === 'movement-modal') closeModal();
      if (modal.id === 'client-keys-modal') closeClientModal();
      if (modal.id === 'batch-movement-modal') closeBatchModal();
      if (modal.id === 'key-history-modal') closeKeyHistory();
    });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    closeModal();
    closeClientModal();
    closeBatchModal();
    closeKeyHistory();
  });
}

function renderDashboard() {
  const b = keyBuckets();
  state.dashboardBuckets = b;
  const modeButton = state.dashboardMode === 'resumida'
    ? '<button class="dash-toggle" data-dashboard-mode="completa">Ver visualização completa</button>'
    : '<button class="dash-toggle" data-dashboard-mode="resumida">Ver visualização resumida</button>';

  const header = `<div class="panel dashboard-head"><h3>Dashboard (${state.dashboardMode})</h3>${modeButton}</div>`;

  const metrics = `
    <div class="cards">
      <article class="card"><small>Cliente disponíveis aqui</small><strong>${b.clienteAqui.length}</strong></article>
      <article class="card"><small>Instalação disponíveis aqui</small><strong>${b.instalacaoAqui.length}</strong></article>
      <article class="card"><small>Entregues ao cliente</small><strong>${b.entregueCliente.length}</strong></article>
      <article class="card"><small>Chaves de instalação entregues ao cliente</small><strong>${b.instalacaoEntregueCliente.length}</strong></article>
      <article class="card"><small>Atualmente requisitadas</small><strong>${b.requisitadas.length}</strong></article>
      <article class="card"><small>Devoluções recentes</small><strong>${b.devolvidasRecentes.length}</strong></article>
    </div>`;

  if (state.dashboardMode === 'resumida') {
    const resumoPorCategoria = `
      <div class="dashboard-grid">
        <div class="panel"><h3>Chaves do Cliente</h3>${renderClientSummaryByCategory(b.clienteAqui, 'clienteAqui', 'Chaves do Cliente')}</div>
        <div class="panel"><h3>Chaves da Instalação</h3>${renderClientSummaryByCategory(b.instalacaoAqui, 'instalacaoAqui', 'Chaves da Instalação')}</div>
        <div class="panel"><h3>Chaves Entregues ao Cliente</h3>${renderClientSummaryByCategory(b.entregueCliente, 'entregueCliente', 'Chaves Entregues ao Cliente')}</div>
        <div class="panel"><h3>Chaves de Instalação Entregues ao Cliente</h3>${renderClientSummaryByCategory(b.instalacaoEntregueCliente, 'instalacaoEntregueCliente', 'Chaves de Instalação Entregues ao Cliente')}</div>
        <div class="panel"><h3>Chaves Requisitadas</h3>${renderClientSummaryByCategory(b.requisitadas, 'requisitadas', 'Chaves Requisitadas')}</div>
        <div class="panel"><h3>Devoluções Recentes</h3>${renderMoveMiniList(b.devolvidasRecentes)}</div>
      </div>`;
    el('dashboard').innerHTML = `${header}${metrics}${resumoPorCategoria}`;
    renderChart();
    return;
  }

  const kaban = `
    <div class="dashboard-grid">
      <div class="panel"><h3>Chaves do Cliente</h3>${renderKeyMiniList(b.clienteAqui)}</div>
      <div class="panel"><h3>Chaves da Instalação</h3>${renderKeyMiniList(b.instalacaoAqui)}</div>
      <div class="panel"><h3>Chaves Entregues ao Cliente</h3>${renderKeyMiniList(b.entregueCliente)}</div>
      <div class="panel"><h3>Chaves de Instalação Entregues ao Cliente</h3>${renderKeyMiniList(b.instalacaoEntregueCliente)}</div>
      <div class="panel"><h3>Chaves Requisitadas</h3>${renderKeyMiniList(b.requisitadas)}</div>
      <div class="panel"><h3>Devoluções Recentes</h3>${renderMoveMiniList(b.devolvidasRecentes)}</div>
    </div>`;

  const completaExtra = `<div class="panel"><h3>Lista completa de chaves</h3>${table(['Obra','Porta','Cliente','Destino','Status','Local'], state.chaves.map((c)=>`<tr><td>${obraNome(c.obraId)}</td><td>${portaNome(c.portaId)}</td><td>${state.obras.find((o)=>o.id===c.obraId)?.cliente || '-'}</td><td>${c.tipoDestino}</td><td><span class="badge b-status ${statusClass(c.statusAtual)}">${statusLabel(c.statusAtual)}</span></td><td>${c.localAtual || '-'}</td></tr>`))}</div>`;

  el('dashboard').innerHTML = `${header}${metrics}${kaban}${completaExtra}`;
  renderChart();
}

function renderClientSummaryByCategory(list, bucketName, categoriaTitulo) {
  if (!list.length) return '<small>Sem chaves nesta categoria.</small>';
  const summary = new Map();
  list.forEach((c) => {
    const cliente = (state.obras.find((o) => o.id === c.obraId)?.cliente || 'Sem cliente').trim() || 'Sem cliente';
    if (!summary.has(cliente)) summary.set(cliente, []);
    summary.get(cliente).push(c);
  });

  const byClient = [...summary.entries()]
    .map(([cliente, chaves]) => ({ cliente, chaves, total: chaves.length }))
    .sort((a, b) => b.total - a.total || a.cliente.localeCompare(b.cliente, 'pt-BR'));

  return `<div class="mini-list">${byClient.map((item, idx) => `<button type="button" class="mini-item mini-item-action" data-client-summary="${item.cliente}" data-client-bucket="${bucketName}" data-client-category="${categoriaTitulo}" style="animation-delay:${idx * 40}ms"><strong>${item.cliente}</strong> • ${item.total} chave(s)</button>`).join('')}</div>`;
}

function renderKeyMiniList(list) {
  if (!list.length) return '<small>Sem chaves nesta categoria.</small>';
  return `<div class="mini-list">${list.slice(0, 8).map((c) => `<div class="mini-item">${obraNome(c.obraId)} • ${portaNome(c.portaId)} <span class="badge b-${c.tipoDestino}">${c.tipoDestino}</span></div>`).join('')}</div>`;
}

function renderMoveMiniList(list) {
  if (!list.length) return '<small>Sem devoluções recentes.</small>';
  return `<div class="mini-list">${list.map((m) => `<div class="mini-item">${m.nomePessoa || '-'} • ${fmtDate(m.dataHora)}</div>`).join('')}</div>`;
}

function renderObras() {
  el('obras-list').innerHTML = table(['Obra', 'Código', 'Cliente', 'Endereço', 'Data', 'Ações'], state.obras.map((o) => `<tr><td>${o.nome}</td><td>${o.codigo || '-'}</td><td>${o.cliente || '-'}</td><td>${o.endereco || '-'}</td><td>${fmtDate(o.dataCadastro)}</td><td><button data-edit-obra="${o.id}">Editar</button> <button data-del-obra="${o.id}">Excluir</button></td></tr>`));
  const ops = '<option value="">Selecione a obra</option>' + state.obras.map((o) => `<option value="${o.id}">${o.nome}</option>`).join('');
  el('obra-select').innerHTML = ops;
  el('filter-obra').innerHTML = '<option value="">Todas as obras</option>' + state.obras.map((o) => `<option value="${o.id}">${o.nome}</option>`).join('');
}

function renderPortas() {
  const q = (el('global-search')?.value || '').toLowerCase().trim();
  const list = state.portas.filter((p) => {
    if (!q) return true;
    return `${obraNome(p.obraId)} ${p.identificacao || ''} ${p.descricao || ''}`.toLowerCase().includes(q);
  });

  el('portas-list').innerHTML = table(['Obra', 'Porta', 'Descrição', 'Chaves', 'Ações'], list.map((p) => `<tr><td>${obraNome(p.obraId)}</td><td>${p.identificacao}</td><td>${p.descricao || '-'}</td><td>${p.qtdCliente || 0} cliente / ${p.qtdInstalacao || 0} instalação (${p.totalChaves || ((p.qtdCliente || 0) + (p.qtdInstalacao || 0))} total)</td><td><button data-edit-porta="${p.id}">Editar</button> <button data-del-porta="${p.id}">Excluir</button></td></tr>`));
}

function renderChaves() {
  const destino = el('filter-destino').value;
  const status = el('filter-status').value;
  const obraId = el('filter-obra').value;
  const q = el('global-search').value.toLowerCase();
  const list = state.chaves.filter((c) => (!destino || c.tipoDestino === destino) && (!status || c.statusAtual === status) && (!obraId || c.obraId === obraId))
    .filter((c) => `${obraNome(c.obraId)} ${portaNome(c.portaId)} ${c.statusAtual} ${c.tipoDestino}`.toLowerCase().includes(q));

  el('chaves-list').innerHTML = table(['Obra', 'Porta', 'Destino', 'Status', 'Aqui?', 'Local atual', 'Ações'], list.map((c) => `<tr><td>${obraNome(c.obraId)}</td><td>${portaNome(c.portaId)}</td><td><span class="badge b-${c.tipoDestino}">${c.tipoDestino}</span></td><td><span class="badge b-status ${statusClass(c.statusAtual)}">${statusLabel(c.statusAtual)}</span></td><td>${c.disponivelAqui ? 'Sim' : 'Não'}</td><td>${c.localAtual || '-'}</td><td><button data-del-chave="${c.id}">Excluir</button></td></tr>`));
}

function getAllowedActions(chave) {
  const actions = [];
  const isCliente = chave.tipoDestino === 'cliente';
  const isInst = chave.tipoDestino === 'instalacao';

  if (chave.statusAtual === 'requisitada') {
    actions.push({ type: 'devolucao', label: 'Devolver' });
    if (isCliente) actions.push({ type: 'entrega_cliente', label: 'Confirmar entrega' });
  }

  if (chave.disponivelAqui && chave.statusAtual !== 'requisitada' && chave.statusAtual !== 'entregue_cliente') {
    if (isCliente) actions.push({ type: 'requisicao', label: 'Requisitar (Cliente)' });
    if (isInst) actions.push({ type: 'requisicao', label: 'Entregue ao Instalador' });
  }

  return actions;
}

function renderMovimentacoes() {
  const q = (el('mov-search').value || '').toLowerCase();
  const cards = state.chaves
    .filter((c) => `${obraNome(c.obraId)} ${portaNome(c.portaId)} ${c.tipoDestino} ${c.statusAtual}`.toLowerCase().includes(q))
    .map((c) => {
      const actions = getAllowedActions(c).map((a) => `<button data-move-key="${c.id}" data-move-type="${a.type}">${a.label}</button>`).join('');
      const historyBtn = `<button class="ghost-btn" data-key-history="${c.id}">Histórico</button>`;
      return `<article class="key-card"><h4>${obraNome(c.obraId)} • ${portaNome(c.portaId)}</h4><p><span class="badge b-${c.tipoDestino}">${c.tipoDestino}</span> <span class="badge b-status ${statusClass(c.statusAtual)}">${statusLabel(c.statusAtual)}</span></p><small>Local: ${c.localAtual || 'empresa'}</small><div class="key-actions">${actions || ''}${historyBtn}</div></article>`;
    }).join('');
  el('mov-cards').innerHTML = cards || '<small>Nenhuma chave encontrada.</small>';
}

function renderBatchMovementModal() {
  const obraSelect = el('batch-obra-select');
  if (!obraSelect) return;
  const current = obraSelect.value;
  obraSelect.innerHTML = '<option value="">Selecione a obra</option>' + state.obras.map((o) => `<option value="${o.id}">${o.nome}</option>`).join('');
  obraSelect.value = state.obras.some((o) => o.id === current) ? current : '';
  renderBatchKeys();
}

function selectedKeyIds() {
  return {
    cliente: [...state.batchSelection.cliente],
    instalacao: [...state.batchSelection.instalacao]
  };
}

function renderBatchKeys() {
  const host = el('batch-keys-grid');
  if (!host) return;
  const obraId = el('batch-obra-select').value;
  if (!obraId) {
    host.innerHTML = '<small>Selecione uma obra para listar as chaves disponíveis.</small>';
    updateBatchButtons();
    return;
  }

  const available = state.chaves.filter((c) => c.obraId === obraId && c.statusAtual !== 'entregue_cliente');
  const byType = (tipo) => available.filter((c) => c.tipoDestino === tipo);

  const col = (tipo, title, css) => {
    const rows = byType(tipo).map((c) => {
      const checked = state.batchSelection[tipo].has(c.id) ? 'checked' : '';
      return `<label class="batch-item ${css}"><input type="checkbox" data-batch-key="${c.id}" data-batch-type="${tipo}" ${checked} /> <span>${portaNome(c.portaId)} • ${statusLabel(c.statusAtual)}</span></label>`;
    }).join('') || '<small>Sem chaves</small>';
    return `<div class="batch-col ${css}"><h4>${title}</h4>${rows}</div>`;
  };

  host.innerHTML = `${col('cliente', 'Cliente', 'batch-client')}${col('instalacao', 'Instalação', 'batch-inst')}`;
  updateBatchButtons();
}

function updateBatchButtons() {
  const ids = selectedKeyIds();
  const keys = state.chaves.filter((c) => ids.cliente.includes(c.id) || ids.instalacao.includes(c.id));
  const clientKeys = keys.filter((c) => c.tipoDestino === 'cliente');
  const instKeys = keys.filter((c) => c.tipoDestino === 'instalacao');

  const canRequestClient = clientKeys.some((c) => c.disponivelAqui && c.statusAtual !== 'requisitada' && c.statusAtual !== 'entregue_cliente');
  const canConfirmClient = clientKeys.some((c) => c.statusAtual === 'requisitada');
  const canRequestInst = instKeys.some((c) => c.disponivelAqui && c.statusAtual !== 'requisitada' && c.statusAtual !== 'entregue_cliente');
  const canDevolver = keys.some((c) => c.statusAtual === 'requisitada');

  el('batch-request-client').disabled = !canRequestClient;
  el('batch-confirm-client').disabled = !canConfirmClient;
  el('batch-request-inst').disabled = !canRequestInst;
  el('batch-devolver').disabled = !canDevolver;
}

function openBatchModal() {
  state.batchSelection = { cliente: new Set(), instalacao: new Set() };
  el('batch-person').value = '';
  el('batch-role').value = '';
  el('batch-note').value = '';
  el('batch-datetime').value = isoLocal();
  renderBatchMovementModal();
  el('batch-movement-modal').hidden = false;
  setBodyModalLock();
}

function closeBatchModal() {
  el('batch-movement-modal').hidden = true;
  setBodyModalLock();
}

async function applyBatchMovement(type, ids) {
  const payload = {
    nomePessoa: el('batch-person').value.trim(),
    categoriaPessoa: el('batch-role').value.trim(),
    observacao: el('batch-note').value.trim(),
    dataHoraISO: el('batch-datetime').value
  };
  if (!payload.nomePessoa || !payload.dataHoraISO) return toast('Informe responsável e data/hora.');
  if (!ids.length) return toast('Selecione ao menos uma chave.');

  await runDb(async () => {
    for (const id of ids) await applyMovement(id, type, payload);
  }, `${ids.length} movimentação(ões) registrada(s)`);
  closeBatchModal();
}

function openKeyHistory(keyId) {
  const chave = state.chaves.find((c) => c.id === keyId);
  const title = chave ? `${obraNome(chave.obraId)} • ${portaNome(chave.portaId)}` : 'Histórico da chave';
  el('key-history-title').textContent = `Histórico da chave - ${title}`;

  const rows = state.movimentacoes
    .filter((m) => m.chaveId === keyId)
    .sort((a, b) => {
      const da = a.dataHora?.toDate ? a.dataHora.toDate() : new Date(a.dataHora || 0);
      const db = b.dataHora?.toDate ? b.dataHora.toDate() : new Date(b.dataHora || 0);
      return da - db;
    })
    .map((m) => `<div class="timeline-item"><b>${m.tipoMovimentacao}</b> • ${m.nomePessoa || 'Sem pessoa'}<br><small>${m.categoriaPessoa || '-'} • ${fmtDate(m.dataHora)}</small><br><small>${m.observacao || 'Sem observação'}</small></div>`)
    .join('') || '<small>Sem histórico para esta chave.</small>';

  el('key-history-body').innerHTML = `<div class="timeline">${rows}</div>`;
  el('key-history-modal').hidden = false;
  setBodyModalLock();
}

function closeKeyHistory() {
  el('key-history-modal').hidden = true;
  setBodyModalLock();
}

function renderHistorico() {
  el('historico-list').innerHTML = `<div class="timeline">${state.movimentacoes.map((m) => `<div class="timeline-item"><b>${m.tipoMovimentacao}</b> • ${m.nomePessoa || 'Sem pessoa'}<br/><small>${m.observacao || 'Sem observação'} • ${fmtDate(m.dataHora)}</small></div>`).join('') || '<small>Sem histórico</small>'}</div>`;
}

function renderChart() {
  const ctx = el('status-chart');
  if (!ctx || !window.Chart) return;
  if (window._chart) window._chart.destroy();
  window._chart = new Chart(ctx, { type: 'bar', data: { labels: ['Aqui', 'Requisitada', 'Entregue ao Cliente'], datasets: [{ data: [
    state.chaves.filter((c) => c.disponivelAqui).length,
    state.chaves.filter((c) => c.statusAtual === 'requisitada').length,
    state.chaves.filter((c) => c.statusAtual === 'entregue_cliente').length
  ], backgroundColor: ['#e0182d', '#ff6c7d', '#6d80ff'] }] }, options: { plugins: { legend: { display: false } } } });
}

async function applyMovement(chaveId, type, payload) {
  const chaveRef = doc(db, 'chaves', chaveId);
  const snap = await getDoc(chaveRef);
  if (!snap.exists()) return toast('Chave não encontrada');
  const chave = snap.data();


  const resetStatus = chave.tipoDestino === 'cliente' ? 'separada_cliente' : 'separada_instalacao';
  const movementType = type === 'entrega_instalador' ? 'entrega_cliente' : type;

  const patch = {
    requisicao: { statusAtual: 'requisitada', requisitada: true, disponivelAqui: false, localAtual: payload.nomePessoa },
    devolucao: { statusAtual: resetStatus, requisitada: false, disponivelAqui: true, localAtual: 'empresa', dataUltimaDevolucao: payload.dataHoraISO, quemDevolveu: payload.nomePessoa },
    entrega_cliente: { statusAtual: 'entregue_cliente', entregue: true, requisitada: false, disponivelAqui: false, localAtual: payload.nomePessoa }
  };

  await updateDoc(chaveRef, patch[movementType]);
  await addDoc(collection(db, 'movimentacoes'), {
    chaveId,
    obraId: chave.obraId,
    portaId: chave.portaId,
    tipoMovimentacao: movementType,
    nomePessoa: payload.nomePessoa,
    categoriaPessoa: payload.categoriaPessoa || '',
    observacao: payload.observacao || '',
    dataHora: new Date(payload.dataHoraISO),
    usuarioAnonimoId: state.uid
  });
}



function sanitizeKeyCount(value) {
  const num = Number.parseInt(value, 10);
  return Number.isFinite(num) ? Math.max(0, Math.min(20, num)) : 0;
}

function makePortaRow(values = {}) {
  const row = document.createElement('div');
  row.className = 'porta-row';
  row.innerHTML = `
    <input class="row-identificacao" required placeholder="Identificação da porta (ex.: P01)" value="${values.identificacao || ''}" />
    <input class="row-descricao" placeholder="Descrição" value="${values.descricao || ''}" />
    <input class="row-qtd-cliente" type="number" min="0" max="20" value="${values.qtdCliente ?? 2}" aria-label="Quantidade de chaves do cliente" title="Quantidade de chaves do cliente" />
    <input class="row-qtd-instalacao" type="number" min="0" max="20" value="${values.qtdInstalacao ?? 1}" aria-label="Quantidade de chaves da instalação" title="Quantidade de chaves da instalação" />
    <input class="row-total" type="number" value="0" readonly />
    <button type="button" class="row-remove">−</button>
  `;
  return row;
}

function refreshPortaRowsSummary() {
  const rows = [...document.querySelectorAll('.porta-row')];
  const submitBtn = el('save-porta-btn');
  if (!submitBtn) return;

  let totalKeys = 0;
  rows.forEach((row) => {
    const qtdCliente = sanitizeKeyCount(row.querySelector('.row-qtd-cliente').value);
    const qtdInstalacao = sanitizeKeyCount(row.querySelector('.row-qtd-instalacao').value);
    row.querySelector('.row-qtd-cliente').value = qtdCliente;
    row.querySelector('.row-qtd-instalacao').value = qtdInstalacao;
    const total = qtdCliente + qtdInstalacao;
    row.querySelector('.row-total').value = total;
    totalKeys += total;
  });

  submitBtn.disabled = rows.length === 0 || totalKeys === 0;
  submitBtn.textContent = totalKeys ? `Salvar ${rows.length} porta(s) • ${totalKeys} chave(s)` : 'Informe ao menos 1 chave por formulário';
}

function addPortaRowFromLast() {
  const rowsHost = el('porta-rows');
  if (!rowsHost) return;
  const rows = [...rowsHost.querySelectorAll('.porta-row')];
  const last = rows[rows.length - 1];
  const cloneValues = last ? {
    descricao: last.querySelector('.row-descricao').value,
    qtdCliente: last.querySelector('.row-qtd-cliente').value,
    qtdInstalacao: last.querySelector('.row-qtd-instalacao').value
  } : {};
  const row = makePortaRow(cloneValues);
  rowsHost.appendChild(row);
  refreshPortaRowsSummary();
  row.querySelector('.row-identificacao').focus();
}

function initPortaRows() {
  const rowsHost = el('porta-rows');
  if (!rowsHost) return;
  rowsHost.innerHTML = '';
  rowsHost.appendChild(makePortaRow());
  refreshPortaRowsSummary();
}

function bindForms() {
  initPortaRows();

  el('obra-form').onsubmit = async (e) => {
    e.preventDefault();
    await runDb(async () => {
      await addDoc(collection(db, 'obras'), { ...Object.fromEntries(new FormData(e.target)), dataCadastro: serverTimestamp() });
      e.target.reset();
    }, 'Obra cadastrada com sucesso');
  };

  el('porta-form').onsubmit = async (e) => {
    e.preventDefault();
    const form = e.target;
    const obraId = form.obraId.value;
    const observacoes = form.observacoes.value || '';
    const rows = [...form.querySelectorAll('.porta-row')];

    const parsedRows = rows.map((row) => ({
      identificacao: row.querySelector('.row-identificacao').value.trim(),
      descricao: row.querySelector('.row-descricao').value.trim(),
      qtdCliente: sanitizeKeyCount(row.querySelector('.row-qtd-cliente').value),
      qtdInstalacao: sanitizeKeyCount(row.querySelector('.row-qtd-instalacao').value)
    }));

    if (!parsedRows.length) return toast('Adicione pelo menos uma porta.');
    if (parsedRows.some((r) => !r.identificacao)) return toast('Informe a identificação de todas as portas.');
    if (parsedRows.some((r) => (r.qtdCliente + r.qtdInstalacao) === 0)) return toast('Cada porta precisa ter ao menos 1 chave.');

    await runDb(async () => {
      for (const item of parsedRows) {
        const totalChaves = item.qtdCliente + item.qtdInstalacao;
        const portaRef = await addDoc(collection(db, 'portas'), {
          obraId,
          identificacao: item.identificacao,
          descricao: item.descricao,
          observacoes,
          totalChaves,
          qtdCliente: item.qtdCliente,
          qtdInstalacao: item.qtdInstalacao,
          dataCadastro: serverTimestamp()
        });
        const base = { obraId, portaId: portaRef.id, localAtual: 'empresa', disponivelAqui: true, entregue: false, requisitada: false, dataCadastro: serverTimestamp() };
        for (let i = 0; i < item.qtdCliente; i += 1) await addDoc(collection(db, 'chaves'), { ...base, tipoDestino: 'cliente', statusAtual: 'separada_cliente' });
        for (let i = 0; i < item.qtdInstalacao; i += 1) await addDoc(collection(db, 'chaves'), { ...base, tipoDestino: 'instalacao', statusAtual: 'separada_instalacao' });

        await addDoc(collection(db, 'movimentacoes'), {
          obraId,
          portaId: portaRef.id,
          tipoMovimentacao: 'cadastro',
          nomePessoa: 'sistema',
          categoriaPessoa: 'sistema',
          observacao: `Porta ${item.identificacao} cadastrada com ${totalChaves} chave(s) (${item.qtdCliente} cliente / ${item.qtdInstalacao} instalação)`,
          dataHora: serverTimestamp(),
          usuarioAnonimoId: state.uid
        });
      }

      form.querySelector('[name="observacoes"]').value = '';
      initPortaRows();
    }, `${parsedRows.length} porta(s) criada(s)`);
  };

  el('add-porta-row').onclick = addPortaRowFromLast;
  el('porta-rows').addEventListener('input', (e) => {
    if (e.target.closest('.porta-row')) refreshPortaRowsSummary();
  });
  el('porta-rows').addEventListener('click', (e) => {
    const btn = e.target.closest('.row-remove');
    if (!btn) return;
    const rows = [...document.querySelectorAll('.porta-row')];
    if (rows.length <= 1) return toast('Mantenha ao menos uma linha de porta.');
    btn.closest('.porta-row')?.remove();
    refreshPortaRowsSummary();
  });

  el('filter-destino').onchange = renderChaves;
  el('filter-status').onchange = renderChaves;
  el('filter-obra').onchange = renderChaves;
  el('global-search').oninput = () => { renderChaves(); renderMovimentacoes(); };
  el('global-search').addEventListener('input', renderPortas);
  el('mov-search').oninput = renderMovimentacoes;

  el('open-batch-move').onclick = openBatchModal;
  el('batch-close').onclick = closeBatchModal;
  el('close-key-history').onclick = closeKeyHistory;
  el('batch-obra-select').onchange = () => {
    state.batchSelection = { cliente: new Set(), instalacao: new Set() };
    renderBatchKeys();
  };
  el('batch-keys-grid').addEventListener('change', (e) => {
    const box = e.target.closest('[data-batch-key]');
    if (!box) return;
    const { batchKey, batchType } = box.dataset;
    if (box.checked) state.batchSelection[batchType].add(batchKey);
    else state.batchSelection[batchType].delete(batchKey);
    updateBatchButtons();
  });

  el('batch-request-client').onclick = () => {
    const ids = [...state.batchSelection.cliente].filter((id) => {
      const c = state.chaves.find((k) => k.id === id);
      return c && c.disponivelAqui && c.statusAtual !== 'requisitada' && c.statusAtual !== 'entregue_cliente';
    });
    applyBatchMovement('requisicao', ids);
  };
  el('batch-confirm-client').onclick = () => {
    const ids = [...state.batchSelection.cliente].filter((id) => state.chaves.find((c) => c.id === id)?.statusAtual === 'requisitada');
    applyBatchMovement('entrega_cliente', ids);
  };
  el('batch-request-inst').onclick = () => {
    const ids = [...state.batchSelection.instalacao].filter((id) => {
      const c = state.chaves.find((k) => k.id === id);
      return c && c.disponivelAqui && c.statusAtual !== 'requisitada' && c.statusAtual !== 'entregue_cliente';
    });
    applyBatchMovement('requisicao', ids);
  };
  el('batch-devolver').onclick = () => {
    const ids = [...state.batchSelection.cliente, ...state.batchSelection.instalacao].filter((id) => state.chaves.find((c) => c.id === id)?.statusAtual === 'requisitada');
    applyBatchMovement('devolucao', ids);
  };
  el('filter-status').innerHTML = '<option value="">Todos os status</option>' + STATUSES.map((s) => `<option value="${s}">${s}</option>`).join('');

  el('movement-form').onsubmit = async (e) => {
    e.preventDefault();
    if (!state.pendingMove) return;
    const payload = {
      nomePessoa: el('mv-person').value.trim(),
      categoriaPessoa: el('mv-role').value.trim(),
      observacao: el('mv-note').value.trim(),
      dataHoraISO: el('mv-datetime').value
    };
    if (!payload.nomePessoa || !payload.dataHoraISO) return toast('Informe nome e data/hora.');
    await runDb(() => applyMovement(state.pendingMove.keyId, state.pendingMove.type, payload), 'Movimentação registrada');
    closeModal();
  };

  el('cancel-movement').onclick = closeModal;
  el('close-client-modal').onclick = closeClientModal;
}

function openModal(keyId, type) {
  state.pendingMove = { keyId, type };
  const labels = { requisicao: 'Requisitar chave', devolucao: 'Confirmar devolução', entrega_cliente: 'Confirmar entrega ao cliente' };
  el('modal-title').textContent = labels[type] || `Confirmar ${type.replace('_', ' ')}`;
  el('mv-person').value = '';
  el('mv-role').value = '';
  el('mv-note').value = '';
  el('mv-datetime').value = isoLocal();
  el('movement-modal').hidden = false;
  setBodyModalLock();
}

function closeModal() {
  state.pendingMove = null;
  el('movement-modal').hidden = true;
  setBodyModalLock();
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
      const obra = state.obras.find((o) => o.id === eid);
      if (!obra) return toast('Obra não encontrada');

      const nome = prompt('Nome da obra:', obra.nome || '');
      if (nome === null) return;
      const codigo = prompt('Código da obra (opcional):', obra.codigo || '');
      if (codigo === null) return;
      const cliente = prompt('Cliente (opcional):', obra.cliente || '');
      if (cliente === null) return;
      const endereco = prompt('Endereço (opcional):', obra.endereco || '');
      if (endereco === null) return;
      const observacoes = prompt('Observações (opcional):', obra.observacoes || '');
      if (observacoes === null) return;

      await runDb(
        () => updateDoc(doc(db, 'obras', eid), {
          nome: nome.trim(),
          codigo: codigo.trim(),
          cliente: cliente.trim(),
          endereco: endereco.trim(),
          observacoes: observacoes.trim()
        }),
        'Obra atualizada'
      );
    }

    const ep = e.target.dataset.editPorta;
    if (ep) {
      const identificacao = prompt('Nova identificação da porta:');
      if (identificacao) await runDb(() => updateDoc(doc(db, 'portas', ep), { identificacao }), 'Porta atualizada');
    }


    const mode = e.target.dataset.dashboardMode;
    if (mode) {
      state.dashboardMode = mode;
      renderDashboard();
    }

    const clientSummary = e.target.closest('[data-client-summary]');
    if (clientSummary) {
      const cliente = clientSummary.dataset.clientSummary;
      const bucketName = clientSummary.dataset.clientBucket;
      const categoria = clientSummary.dataset.clientCategory;
      const list = state.dashboardBuckets[bucketName] || [];
      const chavesCliente = list.filter((c) => ((state.obras.find((o) => o.id === c.obraId)?.cliente || 'Sem cliente').trim() || 'Sem cliente') === cliente);
      openClientModal(cliente, categoria, chavesCliente);
    }
    const historyKey = e.target.dataset.keyHistory;
    if (historyKey) openKeyHistory(historyKey);

    const moveKey = e.target.dataset.moveKey;
    const moveType = e.target.dataset.moveType;
    if (moveKey && moveType) openModal(moveKey, moveType);
  });
}

function bindCollection(name, setter) {
  onSnapshot(query(collection(db, name), orderBy(name === 'movimentacoes' ? 'dataHora' : 'dataCadastro', 'desc')), (snap) => {
    setter(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    renderObras();
    renderPortas();
    renderChaves();
    renderDashboard();
    renderHistorico();
    renderMovimentacoes();
    renderBatchMovementModal();
  }, (error) => {
    const msg = humanizeError(error);
    setAlert(msg);
    toast(msg);
  });
}

function subscribe() {
  bindCollection('obras', (rows) => { state.obras = rows; });
  bindCollection('portas', (rows) => { state.portas = rows; });
  bindCollection('chaves', (rows) => { state.chaves = rows; });
  bindCollection('movimentacoes', (rows) => { state.movimentacoes = rows; });
}

function bindNavigation() {
  document.querySelectorAll('#main-nav button').forEach((btn) => btn.onclick = () => {
    document.querySelectorAll('#main-nav button').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
    el(btn.dataset.target).classList.add('active');
  });
}

(async function init() {
  bindNavigation();
  bindForms();
  bindActions();
  setupModalBackdropClose();

  const authResult = await ensureAnonymousAuth();
  if (authResult.ok && authResult.user) {
    state.authOk = true;
    state.uid = authResult.user.uid;
    el('uid-display').textContent = authResult.user.uid;
  } else {
    state.authOk = false;
    const code = authResult.code || 'erro-desconhecido';
    state.uid = 'sem-auth';
    el('uid-display').textContent = `${state.uid} (${code})`;
    setAlert(`Falha ao autenticar anonimamente: ${humanizeError(authResult.error || { code })} (código: ${code}).`);
  }

  subscribe();
})();
