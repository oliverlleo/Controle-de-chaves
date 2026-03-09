import {
  collection,
  addDoc,
  doc,
  updateDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  where,
  getDocs
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";
import { db } from "./firebase.js";

const c = (name) => collection(db, name);

export const listenAll = (callback) => {
  const state = { obras: [], portas: [], chaves: [], movimentacoes: [] };
  const unsub = [];
  const notify = () => callback(structuredClone(state));

  unsub.push(onSnapshot(query(c("obras"), orderBy("createdAt", "desc")), (s) => {
    state.obras = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    notify();
  }));
  unsub.push(onSnapshot(query(c("portas"), orderBy("createdAt", "desc")), (s) => {
    state.portas = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    notify();
  }));
  unsub.push(onSnapshot(query(c("chaves"), orderBy("createdAt", "desc")), (s) => {
    state.chaves = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    notify();
  }));
  unsub.push(onSnapshot(query(c("movimentacoes"), orderBy("createdAt", "desc")), (s) => {
    state.movimentacoes = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    notify();
  }));

  return () => unsub.forEach((u) => u());
};

export async function createObra(payload) {
  await addDoc(c("obras"), { ...payload, createdAt: serverTimestamp() });
}

export async function createPorta(payload, uid) {
  const portaRef = await addDoc(c("portas"), { ...payload, createdAt: serverTimestamp() });
  const presets = ["cliente", "cliente", "instalacao"];
  for (const tipo of presets) {
    const chaveRef = await addDoc(c("chaves"), {
      obraId: payload.obraId,
      portaId: portaRef.id,
      tipo,
      statusAtual: "empresa",
      comQuem: "Empresa",
      dataUltimaMovimentacao: new Date().toISOString(),
      createdAt: serverTimestamp()
    });
    await addDoc(c("movimentacoes"), {
      chaveId: chaveRef.id,
      obraId: payload.obraId,
      portaId: portaRef.id,
      tipoChave: tipo,
      acao: "cadastro",
      origem: "sistema",
      destino: "empresa",
      nomePessoa: "Sistema",
      data: new Date().toISOString().slice(0, 10),
      hora: new Date().toTimeString().slice(0, 5),
      observacao: "Geração automática",
      userUid: uid,
      createdAt: serverTimestamp()
    });
  }
}

export async function moveChave(chave, data, uid) {
  const allowed = {
    cliente: ["entrega_cliente", "saida_temporaria", "devolucao"],
    instalacao: ["entrega_instalador", "saida_temporaria", "devolucao"]
  };
  if (!allowed[chave.tipo].includes(data.acao)) throw new Error("Ação inválida para o tipo da chave");

  const nextStatus = {
    entrega_cliente: "entregue_cliente",
    entrega_instalador: "com_instalador",
    saida_temporaria: "fora_devolucao",
    devolucao: "empresa"
  }[data.acao];

  if ((chave.tipo === "cliente" && data.acao === "entrega_instalador") || (chave.tipo === "instalacao" && data.acao === "entrega_cliente")) {
    throw new Error("Fluxo bloqueado por regra de negócio");
  }

  await updateDoc(doc(db, "chaves", chave.id), {
    statusAtual: nextStatus,
    comQuem: data.nomePessoa,
    dataUltimaMovimentacao: `${data.data}T${data.hora}:00`
  });

  await addDoc(c("movimentacoes"), {
    chaveId: chave.id,
    obraId: chave.obraId,
    portaId: chave.portaId,
    tipoChave: chave.tipo,
    acao: data.acao,
    origem: chave.statusAtual,
    destino: nextStatus,
    nomePessoa: data.nomePessoa,
    data: data.data,
    hora: data.hora,
    observacao: data.observacao || "",
    userUid: uid,
    createdAt: serverTimestamp()
  });
}

export async function getRecentMovementsByKey(chaveId) {
  const snapshot = await getDocs(query(c("movimentacoes"), where("chaveId", "==", chaveId), orderBy("createdAt", "desc")));
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() })).slice(0, 5);
}
