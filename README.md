# Controle de Chaves - KeyFlow

Sistema web operacional para controle de chaves de obras com lógica de quadro visual (kanban operacional), Firebase Auth anônimo e Firestore.

## Funcionalidades

- Dashboard com colunas operacionais: **Na empresa**, **Entregues ao cliente**, **Com instalador**, **Aguardando devolução** e **Devolvidas recentemente**.
- Cadastro de obras.
- Cadastro de portas com geração automática de 3 chaves (2 cliente + 1 instalação).
- Movimentação por card com ações válidas por tipo/status.
- Bloqueio de fluxo incorreto (cliente não vai para instalador e vice-versa).
- Histórico de movimentações.
- Busca e filtros rápidos.
- Autenticação anônima automática com Firebase.

## Estrutura

- `index.html`: layout da aplicação
- `styles.css`: tema visual moderno vermelho/preto/branco + animações
- `js/firebase.js`: inicialização Firebase e auth anônimo
- `js/store.js`: acesso Firestore e regras de negócio
- `js/ui.js`: renderização de dashboard/listas e ações permitidas
- `js/app.js`: integração geral da aplicação

## Como rodar

Como o app usa módulos ES e Firebase CDN, rode com servidor local:

```bash
python3 -m http.server 5500
```

Depois abra `http://localhost:5500`.

## Observações Firebase

- A configuração usada está exatamente conforme solicitado.
- Garanta no console Firebase:
  - Authentication > Sign-in method > **Anonymous** habilitado.
  - Firestore em modo configurado com regras adequadas para seu ambiente.
