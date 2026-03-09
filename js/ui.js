const columns = [
  ["empresa", "Na empresa"],
  ["entregue_cliente", "Entregues ao cliente"],
  ["com_instalador", "Com instalador"],
  ["fora_devolucao", "Aguardando devolução"],
  ["devolvida_recente", "Devolvidas recentemente"]
];

const labels = {
  empresa: "Na empresa",
  entregue_cliente: "Entregue ao cliente",
  com_instalador: "Com instalador",
  fora_devolucao: "Fora/Devolução",
  devolvida_recente: "Devolvida"
};

export function renderSummary(root, data) {
  const m = {
    "Na empresa": data.chaves.filter((c) => c.statusAtual === "empresa").length,
    "Entregues cliente": data.chaves.filter((c) => c.statusAtual === "entregue_cliente").length,
    "Com instalador": data.chaves.filter((c) => c.statusAtual === "com_instalador").length,
    "Fora": data.chaves.filter((c) => c.statusAtual === "fora_devolucao").length,
    "Devolvidas hoje": data.movimentacoes.filter((m) => m.acao === "devolucao" && m.data === new Date().toISOString().slice(0, 10)).length,
    "Obras ativas": data.obras.length
  };
  root.innerHTML = Object.entries(m).map(([k, v]) => `<article class="summary-card"><span>${k}</span><strong>${v}</strong></article>`).join("");
}

export function renderKanban(root, data, filters, onCardClick) {
  const works = new Map(data.obras.map((o) => [o.id, o]));
  const doors = new Map(data.portas.map((p) => [p.id, p]));

  let filtered = data.chaves.map((k) => ({ ...k, obra: works.get(k.obraId), porta: doors.get(k.portaId) }));
  if (filters.search) {
    const s = filters.search.toLowerCase();
    filtered = filtered.filter((x) => [x.obra?.nome, x.porta?.identificacao, x.comQuem, x.statusAtual, x.tipo].join(" ").toLowerCase().includes(s));
  }
  if (filters.obraId) filtered = filtered.filter((x) => x.obraId === filters.obraId);
  if (filters.tipo) filtered = filtered.filter((x) => x.tipo === filters.tipo);
  if (filters.status) filtered = filtered.filter((x) => (filters.status === "devolvida_recente" ? false : x.statusAtual === filters.status));

  const recentDevolvidas = data.movimentacoes
    .filter((m) => m.acao === "devolucao")
    .slice(0, 20)
    .map((m) => m.chaveId);

  root.innerHTML = columns
    .map(([id, title]) => {
      const cards = id === "devolvida_recente" ? filtered.filter((c) => recentDevolvidas.includes(c.id)) : filtered.filter((c) => c.statusAtual === id);
      return `<section class="column"><h3>${title} (${cards.length})</h3>${
        cards.length
          ? cards
              .map(
                (c) => `<article class="card" data-id="${c.id}">
                <div><span class="badge ${c.tipo}">${c.tipo}</span><span class="badge status">${labels[c.statusAtual] || c.statusAtual}</span></div>
                <strong>${c.obra?.nome || "Obra"} • ${c.porta?.identificacao || "Porta"}</strong>
                <small>Com: ${c.comQuem || "Empresa"}</small><br/><small>${new Date(c.dataUltimaMovimentacao).toLocaleString()}</small>
              </article>`
              )
              .join("")
          : "<p>Nenhuma chave</p>"
      }</section>`;
    })
    .join("");

  root.querySelectorAll(".card").forEach((el) => el.addEventListener("click", () => onCardClick(el.dataset.id)));
}

export function renderSimpleList(root, items, mapFn) {
  root.innerHTML = items.length ? items.map((i) => `<div class="row-item">${mapFn(i)}</div>`).join("") : "<div class='row-item'>Sem dados</div>";
}

export function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2000);
}

export function getAllowedActions(chave) {
  if (chave.statusAtual === "fora_devolucao") return [{ value: "devolucao", label: "Devolver chave" }];
  if (chave.statusAtual === "empresa") {
    return chave.tipo === "cliente"
      ? [
          { value: "entrega_cliente", label: "Entregar ao cliente" },
          { value: "saida_temporaria", label: "Saída temporária" }
        ]
      : [
          { value: "entrega_instalador", label: "Entregar ao instalador" },
          { value: "saida_temporaria", label: "Saída temporária" }
        ];
  }
  if (["entregue_cliente", "com_instalador"].includes(chave.statusAtual)) return [{ value: "devolucao", label: "Registrar devolução" }];
  return [];
}
