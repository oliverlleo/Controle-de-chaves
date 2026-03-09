import { ensureAnonAuth } from "./firebase.js";
import { createObra, createPorta, listenAll, moveChave } from "./store.js";
import { renderSummary, renderKanban, renderSimpleList, toast, getAllowedActions } from "./ui.js";

let state = { obras: [], portas: [], chaves: [], movimentacoes: [] };
let uid = "";
const filters = { search: "", obraId: "", tipo: "", status: "" };

const views = {
  dashboard: document.getElementById("dashboardView"),
  obras: document.getElementById("obrasView"),
  portas: document.getElementById("portasView"),
  historico: document.getElementById("historicoView")
};

function switchView(name) {
  Object.values(views).forEach((v) => v.classList.remove("active"));
  views[name].classList.add("active");
  document.querySelectorAll(".nav-btn").forEach((b) => b.classList.toggle("active", b.dataset.view === name));
}

document.querySelectorAll(".nav-btn").forEach((b) => b.addEventListener("click", () => switchView(b.dataset.view)));

async function init() {
  const user = await ensureAnonAuth();
  uid = user.uid;
  document.getElementById("anonUid").textContent = uid;
  document.getElementById("connectionStatus").textContent = "Conectado";

  listenAll((data) => {
    state = data;
    render();
  });
}

function render() {
  renderSummary(document.getElementById("summaryGrid"), state);
  renderKanban(document.getElementById("kanbanBoard"), state, filters, openActionModal);

  renderSimpleList(document.getElementById("obrasList"), state.obras, (o) => `${o.nome} ${o.codigo ? `(${o.codigo})` : ""} - ${o.cliente || "Sem cliente"}`);
  renderSimpleList(document.getElementById("portasList"), state.portas, (p) => {
    const obra = state.obras.find((o) => o.id === p.obraId);
    return `${obra?.nome || "Obra"} • ${p.identificacao} (${p.descricao || "sem descrição"})`;
  });
  renderSimpleList(document.getElementById("historicoList"), state.movimentacoes, (m) => `${m.acao} • ${m.nomePessoa} • ${m.data} ${m.hora}`);

  const obraOptions = `<option value="">Todas as obras</option>${state.obras.map((o) => `<option value="${o.id}">${o.nome}</option>`).join("")}`;
  document.getElementById("obraFilter").innerHTML = obraOptions;
  document.getElementById("portaObraSelect").innerHTML = `<option value="">Selecione a obra</option>${state.obras.map((o) => `<option value="${o.id}">${o.nome}</option>`).join("")}`;
}

document.getElementById("obraForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  await createObra(Object.fromEntries(form.entries()));
  e.target.reset();
  toast("Obra cadastrada");
});

document.getElementById("portaForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const payload = Object.fromEntries(new FormData(e.target).entries());
  await createPorta(payload, uid);
  e.target.reset();
  toast("Porta cadastrada com 3 chaves automáticas");
});

["searchInput", "obraFilter", "tipoFilter", "statusFilter"].forEach((id) => {
  document.getElementById(id).addEventListener("input", (e) => {
    if (id === "searchInput") filters.search = e.target.value;
    if (id === "obraFilter") filters.obraId = e.target.value;
    if (id === "tipoFilter") filters.tipo = e.target.value;
    if (id === "statusFilter") filters.status = e.target.value;
    render();
  });
});

function openActionModal(chaveId) {
  const chave = state.chaves.find((c) => c.id === chaveId);
  if (!chave) return;
  const actions = getAllowedActions(chave);
  if (!actions.length) return toast("Sem ações permitidas");

  const dialog = document.getElementById("actionDialog");
  const form = document.getElementById("actionForm");
  document.getElementById("dialogTitle").textContent = `Movimentar chave ${chave.tipo}`;
  document.getElementById("dialogSubtitle").textContent = `Status atual: ${chave.statusAtual}`;

  const existing = form.querySelector("select[name='acao']");
  if (existing) existing.remove();
  const select = document.createElement("select");
  select.name = "acao";
  select.required = true;
  select.innerHTML = actions.map((a) => `<option value="${a.value}">${a.label}</option>`).join("");
  form.insertBefore(select, form.querySelector("input[name='nomePessoa']"));

  form.chaveId.value = chave.id;
  const now = new Date();
  form.data.value = now.toISOString().slice(0, 10);
  form.hora.value = now.toTimeString().slice(0, 5);

  dialog.showModal();

  form.onsubmit = async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    try {
      await moveChave(chave, data, uid);
      toast("Movimentação registrada");
      dialog.close();
      form.reset();
    } catch (err) {
      toast(err.message);
    }
  };
}

init();
