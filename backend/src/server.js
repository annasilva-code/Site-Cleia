const http = require("http");
const { readFile } = require("fs/promises");
const { existsSync, readFileSync } = require("fs");
const path = require("path");
const { randomBytes, randomUUID, createHash } = require("crypto");
const { Pool } = require("pg");

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;

  const raw = readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const equalIndex = trimmed.indexOf("=");
    if (equalIndex <= 0) continue;

    const key = trimmed.slice(0, equalIndex).trim();
    const value = trimmed.slice(equalIndex + 1).trim();

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(path.resolve(__dirname, "../.env"));

const PORT = Number(process.env.PORT || 3000);
const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/cleia_neres";
const FRONTEND_DIR = path.resolve(__dirname, "../../");
const ADMIN_DIR = path.resolve(__dirname, "../../frontend");

const ADMIN_NAME = process.env.ADMIN_NAME || "Cleia Neres";
const ADMIN_USER = (process.env.ADMIN_USER || "admin").toLowerCase();
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || `${ADMIN_USER}@local`).toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "troque-essa-senha";
const ADMIN_PASSWORD_HASH = hashPassword(ADMIN_PASSWORD);

const pool = new Pool({ connectionString: DATABASE_URL });
const sessions = new Map();

const WORK_START_MIN = 9 * 60;
const WORK_END_MIN = 19 * 60;
const SLOT_INTERVAL_MIN = 30;

function hashPassword(password) {
  return createHash("sha256").update(String(password)).digest("hex");
}

function toDateString(date) {
  return date.toISOString().slice(0, 10);
}

function parseDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return null;
  const [year, month, day] = String(value).split("-").map(Number);
  const dt = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function normalizePhone(phone) {
  return String(phone || "").replace(/\D/g, "");
}

function isTimeFormat(value) {
  return /^\d{2}:\d{2}$/.test(String(value || ""));
}

function timeToMinutes(time) {
  const [h, m] = String(time).split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(total) {
  const h = String(Math.floor(total / 60)).padStart(2, "0");
  const m = String(total % 60).padStart(2, "0");
  return `${h}:${m}`;
}

function listDailySlots() {
  const slots = [];
  for (let min = WORK_START_MIN; min < WORK_END_MIN; min += SLOT_INTERVAL_MIN) {
    slots.push(minutesToTime(min));
  }
  return slots;
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  });
  res.end(JSON.stringify(payload));
}

function sendRaw(res, statusCode, content, contentType) {
  res.writeHead(statusCode, {
    "Content-Type": contentType,
    "Access-Control-Allow-Origin": "*"
  });
  res.end(content);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Payload muito grande"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("JSON inválido"));
      }
    });
    req.on("error", reject);
  });
}

async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS services (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL DEFAULT '',
      duration_minutes INTEGER NOT NULL DEFAULT 60,
      price_cents INTEGER NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT TRUE
    );
  `);
  await pool.query(`ALTER TABLE services ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT ''`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS admins (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS bookings (
      id TEXT PRIMARY KEY,
      client_name TEXT NOT NULL,
      client_phone TEXT NOT NULL,
      service_id INTEGER REFERENCES services(id),
      total_cents INTEGER NOT NULL DEFAULT 0,
      total_duration_minutes INTEGER NOT NULL DEFAULT 0,
      booking_date DATE NOT NULL,
      booking_time TIME NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pendente'
        CHECK (status IN ('pendente', 'confirmado', 'cancelado', 'concluido')),
      source TEXT NOT NULL DEFAULT 'cliente'
        CHECK (source IN ('cliente', 'admin')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (booking_date, booking_time)
    );
  `);
  await pool.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS total_cents INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS total_duration_minutes INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE bookings ALTER COLUMN service_id DROP NOT NULL`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS booking_services (
      booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
      service_id INTEGER NOT NULL REFERENCES services(id),
      price_cents INTEGER NOT NULL,
      duration_minutes INTEGER NOT NULL,
      PRIMARY KEY (booking_id, service_id)
    );
  `);

  // desativa nomes antigos (sem acento) gerados em versões anteriores
  await pool.query(
    `UPDATE services SET is_active = FALSE
     WHERE name IN ('Coloracao', 'Cronograma 4 sessoes', 'Hidratacao + Escova')`
  );

  await pool.query(
    `INSERT INTO services (name, description, duration_minutes, price_cents)
     VALUES
      ('Corte Feminino',     'Lavagem, corte e finalização para todos os comprimentos.',                60, 4000),
      ('Corte Masculino',    'Corte masculino moderno ou clássico, com finalização.',                   30, 2500),
      ('Coloração',          'Tintura completa ou retoque de raiz com produtos profissionais.',        120, 8000),
      ('Cronograma 4 sessões','Pacote de 4 sessões de hidratação, nutrição e reconstrução.',           90, 15000),
      ('Escova',             'Escova modelada para o dia a dia ou ocasiões especiais.',                 40, 3000),
      ('Escova + Hidratação','Hidratação profunda combinada com escova de finalização.',                60, 5000)
     ON CONFLICT (name) DO UPDATE
       SET description = EXCLUDED.description,
           duration_minutes = EXCLUDED.duration_minutes,
           price_cents = EXCLUDED.price_cents`
  );

  await pool.query(
    `INSERT INTO admins (name, email, password_hash)
     VALUES ($1, $2, $3)
     ON CONFLICT (email)
     DO UPDATE SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash`,
    [ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD_HASH]
  );
}

async function getServices() {
  const result = await pool.query(
    `SELECT id, name, description, duration_minutes AS "durationMinutes", price_cents AS "priceCents"
     FROM services
     WHERE is_active = TRUE
     ORDER BY id ASC`
  );
  return result.rows;
}

async function getBookedTimes(date) {
  const result = await pool.query(
    `SELECT to_char(booking_time, 'HH24:MI') AS time
     FROM bookings
     WHERE booking_date = $1
       AND status <> 'cancelado'`,
    [date]
  );
  return new Set(result.rows.map((row) => row.time));
}

async function getAvailability(date) {
  const parsed = parseDate(date);
  if (!parsed) {
    return { ok: false, errors: ["Data inválida"] };
  }

  const weekDay = parsed.getUTCDay();
  if (weekDay === 0) {
    return { ok: true, date: toDateString(parsed), slots: [] };
  }

  const allSlots = listDailySlots();
  const booked = await getBookedTimes(toDateString(parsed));
  const slots = allSlots.map((time) => ({ time, available: !booked.has(time) }));

  return { ok: true, date: toDateString(parsed), slots };
}

function normalizeServiceIds(payload) {
  let raw = payload.serviceIds;
  if (!Array.isArray(raw) && payload.serviceId !== undefined) raw = [payload.serviceId];
  if (!Array.isArray(raw)) return null;
  const ids = raw.map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (ids.length === 0) return null;
  return Array.from(new Set(ids));
}

function validateBookingPayload(payload) {
  const errors = [];

  if (!payload || typeof payload !== "object") {
    return ["Payload inválido"];
  }

  if (!payload.clientName || String(payload.clientName).trim().length < 3) {
    errors.push("Nome é obrigatório (mínimo 3 caracteres)");
  }

  const phone = normalizePhone(payload.clientPhone);
  if (phone.length < 10 || phone.length > 13) {
    errors.push("Telefone inválido");
  }

  const serviceIds = normalizeServiceIds(payload);
  if (!serviceIds) {
    errors.push("Selecione ao menos um serviço");
  }

  const parsedDate = parseDate(payload.date);
  if (!parsedDate) {
    errors.push("Data inválida (AAAA-MM-DD)");
  }

  if (!isTimeFormat(payload.time)) {
    errors.push("Horário inválido (HH:MM)");
  } else {
    const minuteValue = timeToMinutes(payload.time);
    if (minuteValue < WORK_START_MIN || minuteValue >= WORK_END_MIN) {
      errors.push("Horário fora do expediente");
    }
    if (minuteValue % SLOT_INTERVAL_MIN !== 0) {
      errors.push("Horário deve seguir intervalo de 30 minutos");
    }
  }

  return errors;
}

async function createBooking(payload, source = "cliente") {
  const validationErrors = validateBookingPayload(payload);
  if (validationErrors.length > 0) {
    return { ok: false, status: 400, errors: validationErrors };
  }

  const serviceIds = normalizeServiceIds(payload);
  const date = String(payload.date);
  const time = String(payload.time);

  const serviceResult = await pool.query(
    `SELECT id, name, duration_minutes, price_cents
     FROM services
     WHERE id = ANY($1::int[]) AND is_active = TRUE`,
    [serviceIds]
  );

  if (serviceResult.rowCount !== serviceIds.length) {
    return { ok: false, status: 400, errors: ["Serviço não encontrado"] };
  }

  const totalDuration = serviceResult.rows.reduce((sum, r) => sum + r.duration_minutes, 0);
  const totalCents = serviceResult.rows.reduce((sum, r) => sum + r.price_cents, 0);

  const availability = await getAvailability(date);
  if (!availability.ok) {
    return { ok: false, status: 400, errors: availability.errors };
  }

  const slot = availability.slots.find((item) => item.time === time);
  if (!slot || !slot.available) {
    return { ok: false, status: 409, errors: ["Horário indisponível"] };
  }

  const startMin = timeToMinutes(time);
  const endMin = startMin + totalDuration;
  if (endMin > WORK_END_MIN) {
    return { ok: false, status: 409, errors: ["Os serviços não cabem no horário escolhido. Tente outro horário ou reduza."] };
  }
  for (let m = startMin; m < endMin; m += SLOT_INTERVAL_MIN) {
    const t = minutesToTime(m);
    const s = availability.slots.find((x) => x.time === t);
    if (!s || !s.available) {
      return { ok: false, status: 409, errors: ["Há um conflito com outro agendamento próximo. Escolha outro horário."] };
    }
  }

  const id = randomUUID();
  const notes = String(payload.notes || "").trim();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(
      `INSERT INTO bookings (
        id, client_name, client_phone, service_id, total_cents, total_duration_minutes,
        booking_date, booking_time, notes, status, source, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pendente', $10, NOW())`,
      [
        id,
        String(payload.clientName).trim(),
        normalizePhone(payload.clientPhone),
        serviceResult.rows[0].id,
        totalCents,
        totalDuration,
        date,
        `${time}:00`,
        notes,
        source
      ]
    );

    for (const row of serviceResult.rows) {
      await client.query(
        `INSERT INTO booking_services (booking_id, service_id, price_cents, duration_minutes)
         VALUES ($1, $2, $3, $4)`,
        [id, row.id, row.price_cents, row.duration_minutes]
      );
    }

    await client.query("COMMIT");
    return { ok: true, id, totalCents, totalDuration };
  } catch (error) {
    await client.query("ROLLBACK");
    if (String(error.message).includes("unique") || error.code === "23505") {
      return { ok: false, status: 409, errors: ["Horário já reservado"] };
    }
    throw error;
  } finally {
    client.release();
  }
}

async function listBookings(filters = {}) {
  const values = [];
  const where = [];

  if (filters.from) {
    values.push(filters.from);
    where.push(`booking_date >= $${values.length}`);
  }
  if (filters.to) {
    values.push(filters.to);
    where.push(`booking_date <= $${values.length}`);
  }
  if (filters.status) {
    values.push(filters.status);
    where.push(`status = $${values.length}`);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const result = await pool.query(
    `SELECT
      b.id,
      b.client_name AS "clientName",
      b.client_phone AS "clientPhone",
      b.total_cents AS "totalCents",
      b.total_duration_minutes AS "totalDurationMinutes",
      to_char(b.booking_date, 'YYYY-MM-DD') AS date,
      to_char(b.booking_time, 'HH24:MI') AS time,
      b.notes,
      b.status,
      b.source,
      b.created_at AS "createdAt",
      b.updated_at AS "updatedAt",
      COALESCE(
        json_agg(
          json_build_object(
            'id', s.id,
            'name', s.name,
            'priceCents', bs.price_cents,
            'durationMinutes', bs.duration_minutes
          ) ORDER BY s.name
        ) FILTER (WHERE s.id IS NOT NULL),
        '[]'::json
      ) AS services
    FROM bookings b
    LEFT JOIN booking_services bs ON bs.booking_id = b.id
    LEFT JOIN services s ON s.id = bs.service_id
    ${whereSql}
    GROUP BY b.id
    ORDER BY b.booking_date ASC, b.booking_time ASC`,
    values
  );

  return result.rows;
}

async function updateBooking(id, payload) {
  const fields = [];
  const values = [];

  if (payload.clientName !== undefined) {
    const name = String(payload.clientName).trim();
    if (name.length < 3) return { ok: false, status: 400, errors: ["Nome inválido"] };
    values.push(name);
    fields.push(`client_name = $${values.length}`);
  }

  if (payload.clientPhone !== undefined) {
    const phone = normalizePhone(payload.clientPhone);
    if (phone.length < 10 || phone.length > 13) {
      return { ok: false, status: 400, errors: ["Telefone inválido"] };
    }
    values.push(phone);
    fields.push(`client_phone = $${values.length}`);
  }

  if (payload.serviceId !== undefined) {
    const serviceId = Number(payload.serviceId);
    if (!Number.isInteger(serviceId)) {
      return { ok: false, status: 400, errors: ["Serviço inválido"] };
    }
    values.push(serviceId);
    fields.push(`service_id = $${values.length}`);
  }

  if (payload.date !== undefined) {
    if (!parseDate(payload.date)) {
      return { ok: false, status: 400, errors: ["Data inválida"] };
    }
    values.push(String(payload.date));
    fields.push(`booking_date = $${values.length}`);
  }

  if (payload.time !== undefined) {
    if (!isTimeFormat(payload.time)) {
      return { ok: false, status: 400, errors: ["Horário inválido"] };
    }
    values.push(`${String(payload.time)}:00`);
    fields.push(`booking_time = $${values.length}`);
  }

  if (payload.notes !== undefined) {
    values.push(String(payload.notes || "").trim());
    fields.push(`notes = $${values.length}`);
  }

  if (payload.status !== undefined) {
    const status = String(payload.status || "").toLowerCase();
    if (!["pendente", "confirmado", "cancelado", "concluido"].includes(status)) {
      return {
        ok: false,
        status: 400,
        errors: ["Status inválido: pendente, confirmado, cancelado ou concluido"]
      };
    }
    values.push(status);
    fields.push(`status = $${values.length}`);
  }

  if (!fields.length) {
    return { ok: false, status: 400, errors: ["Nenhum campo para atualizar"] };
  }

  values.push(id);
  const sql = `
    UPDATE bookings
    SET ${fields.join(", ")}, updated_at = NOW()
    WHERE id = $${values.length}
    RETURNING id
  `;

  try {
    const result = await pool.query(sql, values);
    if (result.rowCount === 0) {
      return { ok: false, status: 404, errors: ["Agendamento não encontrado"] };
    }
    return { ok: true };
  } catch (error) {
    if (String(error.message).includes("unique") || error.code === "23505") {
      return { ok: false, status: 409, errors: ["Conflito: horário já ocupado"] };
    }
    throw error;
  }
}

async function deleteBooking(id) {
  const result = await pool.query(
    `DELETE FROM bookings WHERE id = $1 RETURNING id`,
    [id]
  );
  return result.rowCount > 0;
}

function createSession(admin) {
  const token = randomBytes(24).toString("hex");
  sessions.set(token, {
    admin,
    expiresAt: Date.now() + 12 * 60 * 60 * 1000
  });
  return token;
}

function getSession(req) {
  const authHeader = req.headers.authorization || "";
  const [type, token] = authHeader.split(" ");
  if (type !== "Bearer" || !token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    return null;
  }
  return session.admin;
}

async function serveStatic(req, res, pathname) {
  if (req.method !== "GET") return false;

  const requested = pathname === "/" ? "/index.html" : pathname;
  const normalized = path.normalize(requested).replace(/^([.][.][/\\])+/, "");
  const filePath = path.resolve(FRONTEND_DIR, `.${normalized}`);
  if (!filePath.startsWith(FRONTEND_DIR)) {
    sendRaw(res, 403, "Acesso negado", "text/plain; charset=utf-8");
    return true;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif"
  }[ext] || "application/octet-stream";

  try {
    const file = await readFile(filePath);
    sendRaw(res, 200, file, contentType);
    return true;
  } catch {
    return false;
  }
}

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || `localhost:${PORT}`}`);
  const pathname = url.pathname;

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    });
    res.end();
    return;
  }

  if (pathname === "/health" && req.method === "GET") {
    sendJson(res, 200, { ok: true, database: "postgres" });
    return;
  }

  if (pathname === "/api/services" && req.method === "GET") {
    const services = await getServices();
    sendJson(res, 200, { data: services });
    return;
  }

  if (pathname === "/api/availability" && req.method === "GET") {
    const date = url.searchParams.get("date");
    const availability = await getAvailability(date);
    if (!availability.ok) {
      sendJson(res, 400, { errors: availability.errors });
      return;
    }
    sendJson(res, 200, { data: availability });
    return;
  }

  if (pathname === "/api/bookings" && req.method === "POST") {
    const payload = await parseBody(req);
    const created = await createBooking(payload, "cliente");
    if (!created.ok) {
      sendJson(res, created.status, { errors: created.errors });
      return;
    }
    sendJson(res, 201, { data: { id: created.id } });
    return;
  }

  if (pathname === "/api/admin/login" && req.method === "POST") {
    const payload = await parseBody(req);
    const username = String(payload.username || "")
      .toLowerCase()
      .trim();
    const password = String(payload.password || "");

    if (!username || username !== ADMIN_USER) {
      sendJson(res, 401, { errors: ["Credenciais inválidas"] });
      return;
    }

    if (hashPassword(password) !== ADMIN_PASSWORD_HASH) {
      sendJson(res, 401, { errors: ["Credenciais inválidas"] });
      return;
    }

    const token = createSession({ id: 1, name: ADMIN_NAME, username: ADMIN_USER });
    sendJson(res, 200, {
      data: {
        token,
        admin: { name: ADMIN_NAME, username: ADMIN_USER }
      }
    });
    return;
  }

  if (pathname.startsWith("/api/admin/")) {
    const admin = getSession(req);
    if (!admin) {
      sendJson(res, 401, { errors: ["Não autenticado"] });
      return;
    }

    if (pathname === "/api/admin/bookings" && req.method === "GET") {
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");
      const status = url.searchParams.get("status");
      const data = await listBookings({ from, to, status });
      sendJson(res, 200, { data });
      return;
    }

    if (pathname === "/api/admin/bookings" && req.method === "POST") {
      const payload = await parseBody(req);
      const created = await createBooking(payload, "admin");
      if (!created.ok) {
        sendJson(res, created.status, { errors: created.errors });
        return;
      }
      sendJson(res, 201, { data: { id: created.id } });
      return;
    }

    const bookingMatch = pathname.match(/^\/api\/admin\/bookings\/([a-z0-9-]+)$/i);
    if (bookingMatch && req.method === "PATCH") {
      const payload = await parseBody(req);
      const result = await updateBooking(bookingMatch[1], payload);
      if (!result.ok) {
        sendJson(res, result.status, { errors: result.errors });
        return;
      }
      sendJson(res, 200, { ok: true });
      return;
    }

    if (bookingMatch && req.method === "DELETE") {
      const deleted = await deleteBooking(bookingMatch[1]);
      if (!deleted) {
        sendJson(res, 404, { errors: ["Agendamento não encontrado"] });
        return;
      }
      sendJson(res, 200, { ok: true });
      return;
    }
  }

  if (pathname === "/admin" || pathname === "/admin.html") {
    try {
      const file = await readFile(path.resolve(ADMIN_DIR, "admin.html"));
      sendRaw(res, 200, file, "text/html; charset=utf-8");
      return;
    } catch {}
  }
  if (pathname.startsWith("/styles/") || pathname.startsWith("/scripts/")) {
    try {
      const fp = path.resolve(ADMIN_DIR, `.${pathname}`);
      if (fp.startsWith(ADMIN_DIR)) {
        const file = await readFile(fp);
        const ext = path.extname(fp).toLowerCase();
        const ct = ext === ".css" ? "text/css; charset=utf-8" : "application/javascript; charset=utf-8";
        sendRaw(res, 200, file, ct);
        return;
      }
    } catch {}
  }

  const served = await serveStatic(req, res, pathname);
  if (served) return;

  sendJson(res, 404, { errors: ["Rota não encontrada"] });
}

async function start() {
  try {
    await ensureSchema();
    const server = http.createServer(async (req, res) => {
      try {
        await handleRequest(req, res);
      } catch (error) {
        console.error(error);
        sendJson(res, 500, { errors: ["Erro interno"] });
      }
    });

    server.listen(PORT, () => {
      console.log(`[backend] rodando em http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Falha ao iniciar backend:", error.message);
    process.exit(1);
  }
}

start();
