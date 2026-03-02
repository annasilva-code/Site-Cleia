const currentYearElement = document.getElementById("ano-atual");
if (currentYearElement) {
  currentYearElement.textContent = String(new Date().getFullYear());
}

const temaButtons = document.querySelectorAll(".tema-btn");
temaButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const paleta = btn.dataset.paleta;
    document.documentElement.setAttribute("data-tema", paleta);
    temaButtons.forEach((b) => b.classList.remove("ativo"));
    btn.classList.add("ativo");
  });
});

const API_BASE = window.location.port === "3000" ? "" : "http://localhost:3000";

const bookingForm = document.getElementById("booking-form");
const serviceInput = document.getElementById("servico");
const dateInput = document.getElementById("data");
const timeInput = document.getElementById("horario");
const slotsContainer = document.getElementById("booking-slots");
const servicesContainer = document.getElementById("booking-services");
const bookingSummary = document.getElementById("booking-summary");
const bookingFeedback = document.getElementById("booking-feedback");

const indicators = document.querySelectorAll("[data-step-indicator]");
const panels = document.querySelectorAll("[data-step-panel]");
const toStep2Button = document.getElementById("booking-to-step-2");
const toStep3Button = document.getElementById("booking-to-step-3");
const backTo1Button = document.getElementById("booking-back-to-1");
const backTo2Button = document.getElementById("booking-back-to-2");

let currentStep = 1;
let services = [];
let selectedService = null;

function setFeedback(message, type = "info") {
  if (!bookingFeedback) return;
  bookingFeedback.textContent = message;
  bookingFeedback.dataset.type = type;
}

function formatCurrency(cents) {
  return (Number(cents || 0) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function formatDateBR(isoDate) {
  if (!isoDate) return "";
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}

function updateIndicators(step) {
  indicators.forEach((indicator) => {
    const indicatorStep = Number(indicator.getAttribute("data-step-indicator"));
    indicator.classList.toggle("is-active", indicatorStep === step);
    indicator.classList.toggle("is-complete", indicatorStep < step);
  });
}

function showStep(step) {
  currentStep = step;

  panels.forEach((panel) => {
    const panelStep = Number(panel.getAttribute("data-step-panel"));
    panel.classList.toggle("hidden", panelStep !== step);
  });

  updateIndicators(step);
}

function updateActionButtons() {
  if (toStep2Button) {
    toStep2Button.disabled = !selectedService;
  }

  if (toStep3Button) {
    toStep3Button.disabled = !(dateInput && dateInput.value && timeInput && timeInput.value);
  }
}

function renderSummary() {
  if (!bookingSummary) return;

  const serviceName = selectedService ? selectedService.name : "-";
  const servicePrice = selectedService ? formatCurrency(selectedService.price_cents) : "-";
  const serviceDuration = selectedService
    ? `${selectedService.duration_minutes} min`
    : "-";

  bookingSummary.innerHTML = `
    <article>
      <p>Serviço</p>
      <strong>${serviceName}</strong>
    </article>
    <article>
      <p>Valor</p>
      <strong>${servicePrice}</strong>
    </article>
    <article>
      <p>Duração</p>
      <strong>${serviceDuration}</strong>
    </article>
    <article>
      <p>Data / Hora</p>
      <strong>${formatDateBR(dateInput ? dateInput.value : "")} ${
        timeInput && timeInput.value ? `às ${timeInput.value}` : ""
      }</strong>
    </article>
  `;
}

function markSelectedSlot(selectedTime) {
  const buttons = slotsContainer ? slotsContainer.querySelectorAll("button") : [];
  buttons.forEach((button) => {
    button.classList.toggle("is-selected", button.dataset.time === selectedTime);
  });
}

function renderSlots(slots) {
  if (!slotsContainer) return;

  if (!slots.length) {
    slotsContainer.innerHTML = '<p class="slot-empty">Sem horários para esta data.</p>';
    updateActionButtons();
    return;
  }

  slotsContainer.innerHTML = slots
    .map((slot) => {
      if (!slot.available) {
        return `<button type="button" class="slot-btn" disabled>${slot.time}</button>`;
      }
      return `<button type="button" class="slot-btn" data-time="${slot.time}">${slot.time}</button>`;
    })
    .join("");

  const buttons = slotsContainer.querySelectorAll(".slot-btn[data-time]");
  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const selectedTime = button.dataset.time;
      if (timeInput) timeInput.value = selectedTime;
      markSelectedSlot(selectedTime);
      updateActionButtons();
      setFeedback("", "info");
    });
  });

  updateActionButtons();
}

async function loadAvailability(date) {
  if (!date || !slotsContainer || !timeInput) return;

  timeInput.value = "";
  slotsContainer.innerHTML = '<p class="slot-empty">Carregando horários...</p>';
  updateActionButtons();

  try {
    const response = await fetch(
      `${API_BASE}/api/availability?date=${encodeURIComponent(date)}`
    );
    const result = await response.json();

    if (!response.ok) {
      renderSlots([]);
      setFeedback((result.errors || ["Erro ao carregar horários"]).join(" | "), "error");
      return;
    }

    renderSlots(result.data.slots || []);
  } catch {
    renderSlots([]);
    setFeedback("Não foi possível carregar horários agora.", "error");
  }
}

function renderServices() {
  if (!servicesContainer) return;

  if (!services.length) {
    servicesContainer.innerHTML = '<p class="slot-empty">Nenhum serviço disponível no momento.</p>';
    return;
  }

  servicesContainer.innerHTML = services
    .map(
      (service) => `
      <article class="service-card ${selectedService && selectedService.id === service.id ? "is-selected" : ""}" data-service-id="${service.id}">
        <div>
          <h4>${service.name}</h4>
          <p>Duração: ${service.duration_minutes} min</p>
        </div>
        <div class="service-card-right">
          <strong>${formatCurrency(service.price_cents)}</strong>
          <button type="button" class="btn-ghost service-select-btn">Selecionar</button>
        </div>
      </article>
    `
    )
    .join("");

  servicesContainer.querySelectorAll("[data-service-id]").forEach((card) => {
    card.addEventListener("click", () => {
      const serviceId = Number(card.getAttribute("data-service-id"));
      selectedService = services.find((service) => service.id === serviceId) || null;
      if (serviceInput) {
        serviceInput.value = selectedService ? String(selectedService.id) : "";
      }
      renderServices();
      updateActionButtons();
      setFeedback("", "info");
    });
  });
}

async function loadServices() {
  if (!servicesContainer) return;

  servicesContainer.innerHTML = '<p class="slot-empty">Carregando serviços...</p>';

  try {
    const response = await fetch(`${API_BASE}/api/services`);
    const result = await response.json();
    services = result.data || [];
    renderServices();
    updateActionButtons();
  } catch {
    servicesContainer.innerHTML = '<p class="slot-empty">Erro ao carregar serviços.</p>';
    setFeedback("Não foi possível carregar os serviços agora.", "error");
  }
}

if (dateInput) {
  dateInput.min = new Date().toISOString().slice(0, 10);
  dateInput.value = dateInput.min;

  dateInput.addEventListener("change", () => {
    setFeedback("", "info");
    loadAvailability(dateInput.value);
  });
}

if (toStep2Button) {
  toStep2Button.addEventListener("click", async () => {
    if (!selectedService) {
      setFeedback("Selecione um serviço para continuar.", "error");
      return;
    }

    showStep(2);
    if (dateInput && dateInput.value) {
      await loadAvailability(dateInput.value);
    }
  });
}

if (backTo1Button) {
  backTo1Button.addEventListener("click", () => {
    showStep(1);
  });
}

if (toStep3Button) {
  toStep3Button.addEventListener("click", () => {
    if (!selectedService || !dateInput || !dateInput.value || !timeInput || !timeInput.value) {
      setFeedback("Escolha data e horário para continuar.", "error");
      return;
    }

    renderSummary();
    showStep(3);
  });
}

if (backTo2Button) {
  backTo2Button.addEventListener("click", () => {
    showStep(2);
  });
}

if (bookingForm) {
  bookingForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!selectedService || !serviceInput || !serviceInput.value) {
      setFeedback("Selecione um serviço.", "error");
      showStep(1);
      return;
    }

    if (!dateInput || !dateInput.value || !timeInput || !timeInput.value) {
      setFeedback("Escolha data e horário.", "error");
      showStep(2);
      return;
    }

    setFeedback("Enviando agendamento...", "info");

    const formData = new FormData(bookingForm);
    const payload = Object.fromEntries(formData.entries());

    try {
      const response = await fetch(`${API_BASE}/api/bookings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result = await response.json();

      if (!response.ok) {
        setFeedback((result.errors || ["Não foi possível agendar"]).join(" | "), "error");
        await loadAvailability(dateInput.value);
        return;
      }

      const preservedDate = dateInput.value;
      bookingForm.reset();
      if (dateInput) {
        dateInput.min = new Date().toISOString().slice(0, 10);
        dateInput.value = preservedDate;
      }
      if (timeInput) timeInput.value = "";
      if (serviceInput) serviceInput.value = "";

      selectedService = null;
      renderServices();
      await loadAvailability(preservedDate);
      updateActionButtons();
      showStep(1);
      setFeedback("Agendamento enviado com sucesso! Aguarde confirmação.", "success");
    } catch {
      setFeedback("Erro de conexão com o servidor.", "error");
    }
  });
}

showStep(1);
loadServices();
