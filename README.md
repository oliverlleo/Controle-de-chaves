# Controle de Chaves

Sistema web para controle de chaves por obra/porta com Firebase Firestore + autenticação anônima.

## Recursos
- Dashboard com indicadores e gráfico
- Dashboard com alternância resumida/completa (padrão resumida)
- Resumo por cliente: card com total de chaves e modal de detalhamento
- CRUD de obras
- CRUD de portas com geração automática de 3 chaves (2 cliente e 1 instalação)
- Controle de status das chaves
- Registro de requisição, devolução e entrega
- Histórico/timeline de movimentações
- Busca global e filtros por obra/destino/status
- Layout moderno com paleta vermelho/preto/branco e animações suaves
- Tratamento de falhas de autenticação/permissão com alerta visual no topo
- Movimentação rápida por cartões de chave com ações contextuais por tipo (cliente/instalação)
- Bloqueio de operação inválida (ex.: chave de cliente não pode ser entregue ao instalador)
- Devolução obrigatória com nome e data/hora

## Estrutura
- `index.html`: estrutura e telas
- `styles.css`: tema, animações e responsividade
- `firebase.js`: inicialização do Firebase, Firestore e Auth anônimo
- `app.js`: regras de negócio, renderização e integração com Firestore

## Como executar
1. Servir os arquivos com um servidor HTTP simples:
   ```bash
   python3 -m http.server 4173
   ```
2. Abrir no navegador:
   - `http://localhost:4173`

## Configuração Firebase
A configuração já está incluída em `firebase.js` conforme solicitado.

## Solução de erros comuns
### `auth/configuration-not-found`
No Firebase Console, habilite o provedor anônimo:
- Authentication → Sign-in method → Anonymous → Enable.

### `Missing or insufficient permissions`
Publique regras do Firestore de acordo com o ambiente. Exemplo aberto (temporário):
```txt
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```
