import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-analytics.js";
import {
  getFirestore,
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  updateDoc,
  doc,
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyBiGS53kParCv5nteabPHv26dYk25kDhbI",
  authDomain: "chaveprojeto-bddf0.firebaseapp.com",
  projectId: "chaveprojeto-bddf0",
  storageBucket: "chaveprojeto-bddf0.firebasestorage.app",
  messagingSenderId: "1010959432985",
  appId: "1:1010959432985:web:a6fabb0a4a84c7c42e9988",
  measurementId: "G-1W1DN1S074",
};

const app = initializeApp(firebaseConfig);
getAnalytics(app);
const db = getFirestore(app);
const auth = getAuth(app);

const state = { obras: [], portas: [], chaves: [], movs: [], uid: null, modalCtx: null };
const $ = (s) => document.querySelector(s);

signInAnonymously(auth);
onAuthStateChanged(auth, (user) => {
  if (!user) return;
  state.uid = user.uid;
  $("#uid-label").textContent = user.uid;
});

onSnapshot(collection(db, "obras"), (snap) => {
  state.obras = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  renderObras();
  fillObraSelects();
  renderAll();
});
onSnapshot(collection(db, "portas"), (snap) => {
  state.portas = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  renderPortas();
  fillPortaFilter();
  renderAll();
});
onSnapshot(collection(db, "chaves"), (snap) => {
  state.chaves = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  renderAll();
});
onSnapshot(query(collection(db, "movimentacoes"), orderBy("createdAt", "desc")), (snap) => {
  state.movs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  renderHistorico();
  renderAll();
});

document.querySelectorAll(".nav-btn").forEach((b) =>
  b.addEventListener("click", () => {
    document.querySelectorAll(".nav-btn").forEach((x) => x.classList.remove("active"));
    document.querySelectorAll(".view").forEach((x) => x.classList.remove("active"));
    b.classList.add("active");
    document.getElementById(b.dataset.view).classList.add("active");
  })
);

$("#obra-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  await addDoc(collection(db, "obras"), {
    nome: f.get("nome"), codigo: f.get("codigo"), cliente: f.get("cliente"), endereco: f.get("endereco"), observacao: f.get("observacao"), createdAt: serverTimestamp(),
  });
  e.target.reset(); toast("Obra cadastrada");
});

$("#porta-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const obraId = f.get("obraId");
  const portaRef = await addDoc(collection(db, "portas"), {
    obraId, identificacao: f.get("identificacao"), descricao: f.get("descricao"), createdAt: serverTimestamp(),
  });
  const defs = ["cliente", "cliente", "instalacao"];
  for (const tipo of defs) {
    await addDoc(collection(db, "chaves"), {
      obraId,
      portaId: portaRef.id,
      tipo,
      statusAtual: "empresa",
      comQuem: "Empresa",
      dataUltimaMovimentacao: new Date().toISOString(),
      createdAt: serverTimestamp(),
    });
  }
  e.target.reset(); toast("Porta cadastrada e 3 chaves geradas");
});

["#global-search", "#filtro-obra", "#filtro-porta", "#filtro-tipo", "#filtro-status"].forEach((id) =>
  $(id).addEventListener("input", renderAll)
);

function renderAll() { renderSummary(); renderKanban(); }
function applyFilters(chaves) {
  const q = $("#global-search").value.toLowerCase();
  return chaves.filter((c) => {
    const obra = state.obras.find((o) => o.id === c.obraId)?.nome || "";
    const porta = state.portas.find((p) => p.id === c.portaId)?.identificacao || "";
    const matchQ = !q || [obra, porta, c.tipo, c.statusAtual, c.comQuem || ""].join(" ").toLowerCase().includes(q);
    const okObra = !$("#filtro-obra").value || c.obraId === $("#filtro-obra").value;
    const okPorta = !$("#filtro-porta").value || c.portaId === $("#filtro-porta").value;
    const okTipo = !$("#filtro-tipo").value || c.tipo === $("#filtro-tipo").value;
    const okStatus = !$("#filtro-status").value || c.statusAtual === $("#filtro-status").value;
    return matchQ && okObra && okPorta && okTipo && okStatus;
  });
}

function renderSummary() {
  const c = state.chaves;
  const data = [
    ["Na empresa", c.filter((x) => x.statusAtual === "empresa").length],
    ["Entregues ao cliente", c.filter((x) => x.statusAtual === "entregue_cliente").length],
    ["Com instalador", c.filter((x) => x.statusAtual === "com_instalador").length],
    ["Aguardando devolução", c.filter((x) => x.statusAtual === "fora_devolucao").length],
    ["Devolvidas hoje", state.movs.filter((m) => m.acao === "devolucao" && isToday(m.dataHora)).length],
    ["Obras ativas", state.obras.length],
  ];
  $("#summary-cards").innerHTML = data.map(([t, v]) => `<div class="card"><small>${t}</small><strong>${v}</strong></div>`).join("");
}

function renderKanban() {
  const filtered = applyFilters(state.chaves);
  const colMap = {
    empresa: "Na empresa",
    entregue_cliente: "Entregues ao cliente",
    com_instalador: "Com instalador",
    fora_devolucao: "Aguardando devolução",
    devolvidas: "Devolvidas recentemente",
  };
  const devolvidas = state.movs.filter((m) => m.acao === "devolucao").slice(0, 20);
  $("#kanban-columns").innerHTML = Object.entries(colMap)
    .map(([key, title]) => {
      const items = key === "devolvidas" ? devolvidas.map((m) => movCard(m)).join("") : filtered.filter((c) => c.statusAtual === key).map((c) => keyCard(c)).join("");
      return `<div class="column"><h3>${title}</h3>${items || '<small>Nenhum item</small>'}</div>`;
    })
    .join("");
  document.querySelectorAll(".key-card[data-id]").forEach((el) => el.addEventListener("click", () => openActionModal(el.dataset.id)));
}

function keyCard(c) {
  const obra = state.obras.find((o) => o.id === c.obraId)?.nome || "Sem obra";
  const porta = state.portas.find((p) => p.id === c.portaId)?.identificacao || "Sem porta";
  const typeClass = c.tipo === "cliente" ? "tipo-cliente" : "tipo-instalacao";
  const st = c.statusAtual === "fora_devolucao" ? "status-alerta" : "status-ok";
  return `<div class="key-card" data-id="${c.id}">
    <div><span class="badge ${typeClass}">${c.tipo}</span><span class="badge ${st}">${c.statusAtual}</span></div>
    <strong>${obra}</strong><br/><small>Porta ${porta}</small>
    <div><small>Com: ${c.comQuem || "Empresa"}</small></div>
  </div>`;
}

function movCard(m) {
  const obra = state.obras.find((o) => o.id === m.obraId)?.nome || "";
  const porta = state.portas.find((p) => p.id === m.portaId)?.identificacao || "";
  return `<div class="key-card"><strong>${obra}</strong><br/><small>${m.acao} · ${porta}</small><br/><small>${m.nomePessoa || "-"} · ${m.dataHora || ""}</small></div>`;
}

function openActionModal(keyId) {
  const key = state.chaves.find((k) => k.id === keyId);
  const obra = state.obras.find((o) => o.id === key.obraId)?.nome || "";
  const porta = state.portas.find((p) => p.id === key.portaId)?.identificacao || "";
  const actions = [];
  if (key.statusAtual === "empresa") {
    if (key.tipo === "cliente") actions.push(["entrega_cliente", "Entregar ao cliente"]);
    if (key.tipo === "instalacao") actions.push(["entrega_instalador", "Entregar ao instalador"]);
    actions.push(["saida_temporaria", "Registrar saída temporária"]);
  }
  if (["fora_devolucao", "entregue_cliente", "com_instalador"].includes(key.statusAtual)) actions.push(["devolucao", "Devolver chave"]);
  if (!actions.length) return;
  state.modalCtx = { key, action: actions[0][0] };
  $("#modal-title").textContent = actions[0][1];
  $("#modal-key-info").textContent = `${obra} · Porta ${porta} · ${key.tipo}`;
  const actionButtons = actions
    .map(([a, t]) => `<button type="button" class="ghost action-switch" data-action="${a}" data-label="${t}">${t}</button>`)
    .join(" ");
  $("#modal-key-info").insertAdjacentHTML("beforeend", `<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">${actionButtons}</div>`);
  document.querySelectorAll(".action-switch").forEach((b) => b.addEventListener("click", () => {
    state.modalCtx.action = b.dataset.action; $("#modal-title").textContent = b.dataset.label;
  }));
  const now = new Date();
  $("#action-form [name=data]").value = now.toISOString().slice(0, 10);
  $("#action-form [name=hora]").value = now.toTimeString().slice(0, 5);
  $("#action-modal").classList.remove("hidden");
}

$("#cancel-modal").addEventListener("click", closeModal);
function closeModal() { $("#action-modal").classList.add("hidden"); $("#action-form").reset(); state.modalCtx = null; }

$("#action-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!state.modalCtx) return;
  const f = new FormData(e.target);
  const { key, action } = state.modalCtx;
  const nomePessoa = f.get("nomePessoa");
  const dataHora = `${f.get("data")} ${f.get("hora")}`;
  let novoStatus = key.statusAtual;
  if (action === "entrega_cliente") novoStatus = "entregue_cliente";
  if (action === "entrega_instalador") novoStatus = "com_instalador";
  if (action === "saida_temporaria") novoStatus = "fora_devolucao";
  if (action === "devolucao") novoStatus = "empresa";

  await addDoc(collection(db, "movimentacoes"), {
    chaveId: key.id,
    obraId: key.obraId,
    portaId: key.portaId,
    tipoChave: key.tipo,
    acao: action,
    nomePessoa,
    observacao: f.get("observacao"),
    dataHora,
    userUid: state.uid,
    createdAt: serverTimestamp(),
  });

  await updateDoc(doc(db, "chaves", key.id), {
    statusAtual: novoStatus,
    comQuem: novoStatus === "empresa" ? "Empresa" : nomePessoa,
    dataUltimaMovimentacao: dataHora,
  });

  toast("Movimentação registrada");
  closeModal();
});

function renderObras() {
  $("#obras-list").innerHTML = state.obras.map((o) => `<div class="card"><strong>${o.nome}</strong><br/><small>${o.codigo || ""} · ${o.cliente || ""}</small></div>`).join("");
}
function renderPortas() {
  $("#portas-list").innerHTML = state.portas
    .map((p) => `<div class="card"><strong>${p.identificacao}</strong><br/><small>${state.obras.find((o) => o.id === p.obraId)?.nome || ""}</small></div>`)
    .join("");
}
function renderHistorico() {
  $("#mov-list").innerHTML = state.movs.slice(0, 200).map((m) => `<div class="card"><strong>${m.acao}</strong><br/><small>${m.nomePessoa || "-"} · ${m.dataHora || ""}</small></div>`).join("");
}
function fillObraSelects() {
  const opts = '<option value="">Selecione a obra</option>' + state.obras.map((o) => `<option value="${o.id}">${o.nome}</option>`).join("");
  $("#porta-obra-select").innerHTML = opts;
  $("#filtro-obra").innerHTML = '<option value="">Todas as obras</option>' + state.obras.map((o) => `<option value="${o.id}">${o.nome}</option>`).join("");
}
function fillPortaFilter() {
  $("#filtro-porta").innerHTML = '<option value="">Todas as portas</option>' + state.portas.map((p) => `<option value="${p.id}">${p.identificacao}</option>`).join("");
}
function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.classList.remove("hidden"); setTimeout(() => t.classList.add("hidden"), 1800);
}
function isToday(s) { return s?.startsWith(new Date().toISOString().slice(0, 10)); }
