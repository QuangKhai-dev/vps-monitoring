# VPS Monitor
<img width="2995" height="1213" alt="screenshot_1778664979" src="https://github.com/user-attachments/assets/1e0f5d1b-4570-41e7-bde9-2ffec365e74c" />


> Open-source, self-hosted monitoring & management dashboard for your VPS fleet.
> Built with **Next.js 14**, **MongoDB**, and a tiny **bash agent** that installs in one line.

![License: MIT](https://img.shields.io/badge/License-MIT-green)
![Next.js](https://img.shields.io/badge/Next.js-14-black)
![MongoDB](https://img.shields.io/badge/MongoDB-7-green)

## ✨ Features

- **One-line install** on any VPS (Ubuntu, Debian, CentOS, Rocky, Alma, Fedora, Arch, Alpine…)
- **Auto-registration** — no SSH keys, no copy-pasting tokens. Just run the install command.
- **Live metrics** every 15s: CPU, memory, swap, disk, network, load avg, uptime, processes.
- **Beautiful dark dashboard** with real-time charts (Recharts).
- **Single-admin model** — no public sign-ups. The first account becomes admin.
- **Self-hosted** — your metrics live in your MongoDB, not someone else's cloud.
- **Tiny agent** — pure bash, no compiled binaries, ~5 MB RAM footprint.
- **Telegram alerts** — optional notify when CPU, RAM, or disk usage crosses thresholds (per-server cooldown).

## 🚀 Quick start (Docker)

```bash
git clone https://github.com/<you>/vps-monitoring.git
cd vps-monitoring
cp .env.example .env

# Edit .env, at minimum set:
#   JWT_SECRET=$(openssl rand -hex 64)
#   NEXT_PUBLIC_APP_URL=https://monitor.yourdomain.com

docker compose up -d
```

Open `http://localhost:3000`, create your admin account, and you're done.

### MongoDB outside Docker (Atlas, another VPS, …)

The app does **not** need Mongo on the same Docker network. Set **`MONGODB_URI`** in `.env` to your real connection string (with user/password if required).

- **Firewall / Atlas IP allowlist:** allow the **public egress IP** of the machine running the `web` container (or `0.0.0.0/0` only for testing).
- **TLS:** Atlas uses `mongodb+srv://…`; self‑hosted often uses `mongodb://…` on port `27017` with TLS optional depending on your server.
- **Docker Compose:** the file still defines a `mongo` service for local demos. If you use **only** external Mongo, start the app without pulling that service up:

```bash
# In .env set MONGODB_URI=... (Atlas or remote host)
docker compose up -d --no-deps web
```

If you keep `docker compose up -d` (with the bundled `mongo` service), you can still point `web` at an external DB by setting `MONGODB_URI` in `.env`; the local `mongo` container will simply stay unused.

**Debug:** open `GET /api/health/db` on your deployed site — it returns JSON `{ ok: true }` or a safe Mongo error (e.g. authentication vs timeout) without printing your password.

## 🖥️ Adding a server

In the dashboard, click **Add server**. Copy the install command and run it on your VPS:

```bash
curl -fsSL https://monitor.yourdomain.com/api/install | sudo bash
```

The VPS will:

1. Register itself with the dashboard (auto-generates `agentId` + token).
2. Install a systemd service `vps-monitor-agent` that survives reboots.
3. Start posting metrics immediately.

No login, no manual steps required.

### Manage the agent on the VPS

```bash
sudo systemctl status vps-monitor-agent    # check status
sudo systemctl restart vps-monitor-agent   # restart
sudo journalctl -u vps-monitor-agent -f    # tail logs
sudo /opt/vps-monitor-agent/uninstall.sh   # remove
```

## 🛠️ Local development

```bash
npm install
cp .env.example .env.local
# point MONGODB_URI to a running MongoDB
npm run dev
```

Then visit `http://localhost:3000`.

## ⚙️ Environment variables

| Variable                       | Required | Default                                | Description                                  |
| ------------------------------ | -------- | -------------------------------------- | -------------------------------------------- |
| `MONGODB_URI`                  | yes      | `mongodb://localhost:27017/vps-monitoring` | Any reachable MongoDB (local, other VPS, Atlas `mongodb+srv://…`). |
| `JWT_SECRET`                   | yes (prod) | dev-only fallback                    | Secret used to sign session cookies.         |
| `NEXT_PUBLIC_APP_URL`          | yes      | `http://localhost:3000`                | Public URL where the dashboard is reachable. |
| `AGENT_OFFLINE_AFTER_SECONDS`  | no       | `60`                                   | After how many seconds an agent is "offline". |

### Telegram overload alerts

Configure the bot token, chat id, thresholds (CPU, RAM, disk `/`), and per-server cooldown in **Settings** in the web UI. Values are stored in MongoDB (not in environment variables). Each agent heartbeat is checked: if CPU, RAM, or disk (/) is at or above the configured thresholds, one HTML message is sent to Telegram. The same server will not receive another alert until the cooldown period passes (even if multiple metrics are high).

## 🏗️ Architecture

```
 ┌────────────────────┐  HTTPS   ┌────────────────────┐  Mongo  ┌───────────────┐
 │  VPS #1 (bash)     │ ───────► │  Next.js API       │ ──────► │  MongoDB      │
 │  /opt/vps-mon-...  │          │  /api/agents/*     │         │  agents,      │
 └────────────────────┘          │  /api/auth/*       │         │  metrics      │
 ┌────────────────────┐          └─────────┬──────────┘         └───────────────┘
 │  VPS #2 (bash)     │ ───────►           │
 └────────────────────┘                    ▼
                                  ┌────────────────────┐
                                  │  Next.js Web UI    │  ◄── Admin (browser)
                                  └────────────────────┘
```

- **Web**: Next.js 14 App Router (this repo).
- **DB**: MongoDB. Two collections: `agents` (metadata + token), `metrics` (time-series).
- **Agent**: A 200-line bash script (`/public/install.sh`) that reads `/proc`, `df`, `uptime` etc.
- **Auth**:
  - Admin → HttpOnly cookie + HS256 JWT.
  - Agent → unique per-VPS token, validated on every heartbeat.

## 🔒 Security notes

- The first user created via `/setup` is the only admin. Public registration is **disabled**.
- Each agent's token is a one-way credential; compromising one VPS does **not** affect others.
- Always run the dashboard behind HTTPS (e.g. Caddy, Nginx, Traefik).
- Set a strong `JWT_SECRET` (`openssl rand -hex 64`).

## 📦 API endpoints

| Method | Path                            | Auth        | Description                       |
| ------ | ------------------------------- | ----------- | --------------------------------- |
| GET    | `/api/install`                  | public      | Returns the install bash script.  |
| POST   | `/api/setup`                    | once only   | Creates the admin account.        |
| POST   | `/api/auth/login`               | public      | Sign in.                          |
| POST   | `/api/auth/logout`              | session     | Sign out.                         |
| POST   | `/api/auth/password`            | session     | Change password.                  |
| POST   | `/api/agents/register`          | public      | Agent auto-registration.          |
| POST   | `/api/agents/heartbeat`         | agent token | Agent posts metrics.              |
| GET    | `/api/agents`                   | session     | List all agents.                  |
| GET    | `/api/agents/:id`               | session     | Get one agent's details.          |
| PATCH  | `/api/agents/:id`               | session     | Update label/tags.                |
| DELETE | `/api/agents/:id`               | session     | Remove agent + metrics.           |
| GET    | `/api/agents/:id/metrics`       | session     | Time-series metrics.              |

## 📄 License

MIT — do whatever you want, just don't blame us.
