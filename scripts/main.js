const currentYearElement = document.getElementById("ano-atual");
if (currentYearElement) {
  currentYearElement.textContent = String(new Date().getFullYear());
}

// ── Troca de tema ────────────────────────────────────────
const temaButtons = document.querySelectorAll(".tema-btn");

temaButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const paleta = btn.dataset.paleta;
    document.documentElement.setAttribute("data-tema", paleta);
    temaButtons.forEach((b) => b.classList.remove("ativo"));
    btn.classList.add("ativo");
  });
});
