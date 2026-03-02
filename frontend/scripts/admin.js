const API_BASE = window.location.port === "3000" ? "" : "http://localhost:3000";
const TOKEN_KEY = "cleia_admin_token";

const loginCard = document.getElementById("admin-login-card");
const adminApp = document.getElementById("admin-app");
const loginForm = document.getElementById("admin-login-form");
const loginFeedback = document.getElementById("admin-login-feedback");
const createForm = document.getElementById("admin-create-form");
const createFeedback = document.getElementById("admin-create-feedback");
const bookingsContainer = document.getElementById("admin-bookings");
const listCaption = document.getElementById("admin-list-caption");
const servicesSelect = document.getElementById("create-serviceId");
const refreshButton = document.getElementById("admin-refresh");
const logoutButton = document.getElementById("admin-logout");
const createDateInput = document.getElementById("create-date");

const metricToday = document.getElementById("metric-today");
const metricWeek = document.getElementById("metric-week");
const metricPending = document.getElementById("metric-pending");
const metricConfirmed = document.getElementById("metric-confirmed");

const calendarTitle = document.getElementById("calendar-title");
const calendarGrid = document.getElementById("admin-calendar");
const calendarPrev = document.getElementById("calendar-prev");
const calendarNext = document.getElementById("calendar-next");
const todayList = document.getElementById("admin-today-list");
const weekList = document.getElementById("admin-week-list");
const timelineCaption = document.getElementById("admin-timeline-caption");
const dayTimeline = document.getElementById("admin-day-timeline");

let services = [];
let allBookings = [];
let calendarDate = new Date();
let selectedDate = todayISO();

function getToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

function setFeedback(element, message, type = "info") {
  if (!element) return;
  element.textContent = message;
  element.dataset.type = type;
}

function authHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${getToken()}`
  };
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDateBR(isoDate) {
  if (!isoDate) return "";
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function weekRangeFromToday() {
  const now = new Date();
  const day = now.getDay();
  const start = new Date(now);
  start.setDate(now.getDate() - day);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

function bookingDateTime(booking) {
  return new Date(`${booking.date}T${booking.time}:00`);
}

function showApp() {
  if (loginCard) loginCard.classList.add("hidden");
  if (adminApp) adminApp.classList.remove("hidden");
}

function showLogin() {
  if (loginCard) loginCard.classList.remove("hidden");
  if (adminApp) adminApp.classList.add("hidden");
}

function serviceOptionsHtml(selectedId) {
  return services
    .map((service) => {
      const selected = Number(selectedId) === Number(service.id) ? "selected" : "";
      return `<option value="${service.id}" ${selected}>${escapeHtml(service.name)}</option>`;
    })
    .join("");
}

function renderMiniList(container, bookings, emptyText) {
  if (!container) return;

  if (!bookings.length) {
    container.innerHTML = `<li class="admin-mini-empty">${emptyText}</li>`;
    return;
  }

  container.innerHTML = bookings
    .map(
      (booking) => `
      <li>
        <strong>${booking.time}</strong>
        <span>${escapeHtml(booking.clientName)} • ${escapeHtml(booking.serviceName)}</span>
        <em>${escapeHtml(booking.status)}</em>
      </li>
    `
    )
    .join("");
}

function renderMetricsAndSlices() {
  const today = todayISO();
  const { start, end } = weekRangeFromToday();

  const todayBookings = allBookings.filter((booking) => booking.date === today);
  const weekBookings = allBookings.filter((booking) => {
    const date = bookingDateTime(booking);
    return date >= start && date <= end;
  });

  const pendingCount = allBookings.filter((booking) => booking.status === "pendente").length;
  const confirmedCount = allBookings.filter((booking) => booking.status === "confirmado").length;

  if (metricToday) metricToday.textContent = String(todayBookings.length);
  if (metricWeek) metricWeek.textContent = String(weekBookings.length);
  if (metricPending) metricPending.textContent = String(pendingCount);
  if (metricConfirmed) metricConfirmed.textContent = String(confirmedCount);

  renderMiniList(todayList, todayBookings, "Nenhum agendamento para hoje.");
  renderMiniList(weekList, weekBookings, "Nenhum agendamento nesta semana.");
}

function countBookingsByDate() {
  const map = new Map();
  for (const booking of allBookings) {
    map.set(booking.date, (map.get(booking.date) || 0) + 1);
  }
  return map;
}

function renderCalendar() {
  if (!calendarGrid || !calendarTitle) return;

  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const firstWeekday = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const dayCountMap = countBookingsByDate();
  const today = todayISO();

  const monthLabel = calendarDate.toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric"
  });
  calendarTitle.textContent = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);

  const cells = [];
  for (let i = 0; i < firstWeekday; i += 1) {
    cells.push('<div class="admin-calendar-cell is-empty"></div>');
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, month, day);
    const iso = date.toISOString().slice(0, 10);
    const count = dayCountMap.get(iso) || 0;
    const isToday = iso === today;
    const isSelected = iso === selectedDate;

    cells.push(`
      <button type="button" class="admin-calendar-cell ${isToday ? "is-today" : ""} ${isSelected ? "is-selected" : ""}" data-date="${iso}">
        <span class="day-number">${day}</span>
        <span class="day-count">${count} ag.</span>
      </button>
    `);
  }

  calendarGrid.innerHTML = cells.join("");
}

function renderMainBookingList(bookings = allBookings, label = "Todos os agendamentos") {
  if (!bookingsContainer) return;
  if (listCaption) listCaption.textContent = label;

  if (!bookings.length) {
    bookingsContainer.innerHTML = "<p>Nenhum agendamento encontrado.</p>";
    return;
  }

  bookingsContainer.innerHTML = bookings
    .map(
      (booking) => `
      <article class="admin-booking" data-id="${booking.id}">
        <div class="admin-booking-top">
          <strong>${escapeHtml(booking.clientName)}</strong>
          <span>${escapeHtml(booking.clientPhone)}</span>
        </div>

        <div class="admin-booking-grid">
          <label>Serviço
            <select data-field="serviceId">${serviceOptionsHtml(booking.serviceId)}</select>
          </label>

          <label>Data
            <input data-field="date" type="date" value="${booking.date}" />
          </label>

          <label>Horário
            <input data-field="time" type="time" step="1800" value="${booking.time}" />
          </label>

          <label>Status
            <select data-field="status">
              <option value="pendente" ${booking.status === "pendente" ? "selected" : ""}>Pendente</option>
              <option value="confirmado" ${booking.status === "confirmado" ? "selected" : ""}>Confirmado</option>
              <option value="cancelado" ${booking.status === "cancelado" ? "selected" : ""}>Cancelado</option>
              <option value="concluido" ${booking.status === "concluido" ? "selected" : ""}>Concluído</option>
            </select>
          </label>
        </div>

        <label>Observações
          <textarea data-field="notes" rows="2">${escapeHtml(booking.notes || "")}</textarea>
        </label>

        <p class="admin-booking-meta">
          ${formatDateBR(booking.date)} às ${booking.time} • ${escapeHtml(
            booking.serviceName
          )} • origem: ${escapeHtml(booking.source)}
        </p>

        <div class="admin-booking-actions">
          <button type="button" class="btn-ghost" data-action="save">Salvar</button>
          <button type="button" class="btn-ghost danger" data-action="delete">Excluir</button>
        </div>
      </article>
    `
    )
    .join("");
}

function timeToMinutes(value) {
  const [h, m] = String(value || "00:00").split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(value) {
  const h = String(Math.floor(value / 60)).padStart(2, "0");
  const m = String(value % 60).padStart(2, "0");
  return `${h}:${m}`;
}

function renderDayTimeline(date) {
  if (!dayTimeline) return;

  if (timelineCaption) {
    timelineCaption.textContent = date ? formatDateBR(date) : "";
  }

  const dayBookings = allBookings
    .filter((booking) => booking.date === date)
    .sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));

  const bookingsByTime = new Map();
  dayBookings.forEach((booking) => {
    if (!bookingsByTime.has(booking.time)) {
      bookingsByTime.set(booking.time, []);
    }
    bookingsByTime.get(booking.time).push(booking);
  });

  const rows = [];
  for (let minute = 9 * 60; minute < 19 * 60; minute += 30) {
    const time = minutesToTime(minute);
    const bookings = bookingsByTime.get(time) || [];
    const content = bookings.length
      ? bookings
          .map(
            (booking) => `
          <article class="timeline-booking">
            <strong>${escapeHtml(booking.clientName)}</strong>
            <span>${escapeHtml(booking.serviceName)}</span>
            <em>${escapeHtml(booking.status)}</em>
          </article>
        `
          )
          .join("")
      : '<span class="timeline-empty">Livre</span>';

    rows.push(`
      <div class="timeline-row">
        <div class="timeline-hour">${time}</div>
        <div class="timeline-content">${content}</div>
      </div>
    `);
  }

  dayTimeline.innerHTML = rows.join("");
}

function refreshDashboardViews() {
  renderMetricsAndSlices();
  renderCalendar();
  renderMainBookingList(allBookings, "Todos os agendamentos");
  renderDayTimeline(selectedDate);
}

async function loadServices() {
  const response = await fetch(`${API_BASE}/api/services`);
  const result = await response.json();
  services = result.data || [];

  if (servicesSelect) {
    servicesSelect.innerHTML =
      '<option value="">Selecione um serviço</option>' + serviceOptionsHtml();
  }
}

async function loadBookings() {
  if (!bookingsContainer) return;
  bookingsContainer.innerHTML = "<p>Carregando...</p>";

  const response = await fetch(`${API_BASE}/api/admin/bookings`, {
    headers: authHeaders()
  });
  const result = await response.json();

  if (!response.ok) {
    if (response.status === 401) {
      clearToken();
      showLogin();
    }
    bookingsContainer.innerHTML = `<p>${(result.errors || ["Erro ao carregar agenda"]).join(" | ")}</p>`;
    return;
  }

  allBookings = result.data || [];
  refreshDashboardViews();
}

async function login(payload) {
  const response = await fetch(`${API_BASE}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const result = await response.json();

  if (!response.ok) {
    setFeedback(loginFeedback, (result.errors || ["Falha no login"]).join(" | "), "error");
    return false;
  }

  setToken(result.data.token);
  setFeedback(loginFeedback, "", "info");
  showApp();
  await loadServices();
  await loadBookings();
  return true;
}

if (loginForm) {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(loginForm).entries());
    await login(payload);
  });
}

if (createForm) {
  createForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(createForm).entries());

    const response = await fetch(`${API_BASE}/api/admin/bookings`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(payload)
    });
    const result = await response.json();

    if (!response.ok) {
      setFeedback(createFeedback, (result.errors || ["Erro ao criar"]).join(" | "), "error");
      return;
    }

    setFeedback(createFeedback, "Agendamento inserido com sucesso.", "success");
    const currentDate = createDateInput ? createDateInput.value : "";
    createForm.reset();
    if (createDateInput) createDateInput.value = currentDate;
    await loadBookings();
  });
}

if (refreshButton) {
  refreshButton.addEventListener("click", async () => {
    await loadBookings();
  });
}

if (logoutButton) {
  logoutButton.addEventListener("click", () => {
    clearToken();
    showLogin();
  });
}

if (calendarPrev) {
  calendarPrev.addEventListener("click", () => {
    calendarDate = new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1);
    renderCalendar();
  });
}

if (calendarNext) {
  calendarNext.addEventListener("click", () => {
    calendarDate = new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1);
    renderCalendar();
  });
}

if (calendarGrid) {
  calendarGrid.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const cell = target.closest("[data-date]");
    if (!(cell instanceof HTMLElement)) return;

    const pickedDate = cell.dataset.date;
    if (!pickedDate) return;
    selectedDate = pickedDate;

    const filtered = allBookings.filter((booking) => booking.date === selectedDate);
    renderMainBookingList(filtered, `Agendamentos em ${formatDateBR(selectedDate)}`);
    renderDayTimeline(selectedDate);

    const selectedCells = calendarGrid.querySelectorAll(".admin-calendar-cell.is-selected");
    selectedCells.forEach((item) => item.classList.remove("is-selected"));
    cell.classList.add("is-selected");
  });
}

if (bookingsContainer) {
  bookingsContainer.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const action = target.dataset.action;
    if (!action) return;

    const card = target.closest(".admin-booking");
    if (!(card instanceof HTMLElement)) return;

    const id = card.dataset.id;
    if (!id) return;

    if (action === "delete") {
      const response = await fetch(`${API_BASE}/api/admin/bookings/${id}`, {
        method: "DELETE",
        headers: authHeaders()
      });
      const result = await response.json();
      if (!response.ok) {
        alert((result.errors || ["Erro ao excluir"]).join(" | "));
        return;
      }
      await loadBookings();
      return;
    }

    if (action === "save") {
      const serviceField = card.querySelector('[data-field="serviceId"]');
      const dateField = card.querySelector('[data-field="date"]');
      const timeField = card.querySelector('[data-field="time"]');
      const statusField = card.querySelector('[data-field="status"]');
      const notesField = card.querySelector('[data-field="notes"]');

      const payload = {
        serviceId: Number(serviceField.value),
        date: dateField.value,
        time: timeField.value,
        status: statusField.value,
        notes: notesField.value
      };

      const response = await fetch(`${API_BASE}/api/admin/bookings/${id}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (!response.ok) {
        alert((result.errors || ["Erro ao atualizar"]).join(" | "));
        return;
      }

      await loadBookings();
    }
  });
}

async function bootstrap() {
  if (createDateInput) {
    createDateInput.min = todayISO();
    createDateInput.value = todayISO();
  }
  selectedDate = todayISO();

  if (!getToken()) {
    showLogin();
    return;
  }

  showApp();
  await loadServices();
  await loadBookings();
}

bootstrap();
