# Controle de Chaves Operacional

Sistema web focado em operação rápida com quadro estilo kanban para visualizar e movimentar chaves por status.

## Tecnologias
- HTML, CSS, JavaScript (SPA simples)
- Firebase (App + Analytics)
- Firebase Authentication (anônimo)
- Firestore Cloud

## Como executar
1. Suba os arquivos em um servidor estático (ex.: Firebase Hosting, Vercel ou `python3 -m http.server`).
2. Garanta que no Firebase estejam habilitados:
   - Authentication -> Anonymous
   - Firestore Database
3. Abra a aplicação no navegador.

## Fluxo principal
- Cadastre obra
- Cadastre porta (gera automaticamente 3 chaves: 2 cliente + 1 instalação)
- Use o dashboard para movimentar pelo card
- O modal mostra apenas ações válidas por tipo e status
- Todas as ações viram histórico

## Estrutura
- `index.html`: layout e seções principais
- `styles.css`: estilo moderno (vermelho/preto/branco) + animações
- `app.js`: regras de negócio, Firebase, CRUD, kanban e movimentações
