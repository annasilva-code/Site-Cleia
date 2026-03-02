# Plataforma de Agendamentos - Cleia Neres

Projeto dividido em:
- `frontend/`: site das clientes + painel admin web
- `backend/`: API HTTP com PostgreSQL
- `docker-compose.yml`: sobe o banco local

## Fluxo do sistema
- Cliente entra no site, escolhe servico, data e um horario disponivel.
- API valida conflito e grava no banco.
- Cleia acessa `/admin`, faz login e consegue:
  - visualizar todos os agendamentos
  - inserir manualmente
  - mover data/horario
  - alterar status
  - excluir

## Requisitos
- Docker e Docker Compose
- Node.js 18+

## Setup local
1. Subir banco PostgreSQL:

```bash
docker compose up -d db
```

2. Instalar dependencias do backend:

```bash
cd backend
npm install
```

3. Criar variaveis de ambiente:

```bash
cp .env.example .env
```

4. Iniciar API:

```bash
npm run dev
```

5. Abrir no navegador:

- Site cliente: `http://localhost:3000`
- Painel admin: `http://localhost:3000/admin`

## Rodar pelo VS Code (sem digitar no terminal toda vez)

O projeto ja tem tarefas em `.vscode/tasks.json`.

1. Abra `Command Palette` (`Cmd + Shift + P`)
2. Execute `Tasks: Run Task`
3. Rode na ordem:
   - `Setup: Banco + Backend` (primeira vez)
   - `Start: Backend`

Para parar o banco:
- `Tasks: Run Task` -> `Stop: Banco`

## Credenciais admin (padrao)
Definidas em `backend/.env`:
- `ADMIN_USER=admin`
- `ADMIN_PASSWORD=1`

Troque a senha antes de publicar.

## Endpoints principais
- `GET /health`
- `GET /api/services`
- `GET /api/availability?date=AAAA-MM-DD`
- `POST /api/bookings`
- `POST /api/admin/login`
- `GET /api/admin/bookings`
- `POST /api/admin/bookings`
- `PATCH /api/admin/bookings/:id`
- `DELETE /api/admin/bookings/:id`
