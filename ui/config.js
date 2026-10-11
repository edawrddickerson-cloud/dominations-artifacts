(() => {
  "use strict";

  const DN = window.DN;
  if (!DN) return;

  const el = {
    list: document.getElementById("profiles-list"),
    add: document.getElementById("profiles-add"),
    max: document.getElementById("profiles-max"),
  };

  function syncNavSelect() {
    const select = /** @type {HTMLSelectElement | null} */ (document.getElementById("profile-select"));
    if (!select) return;
    const s = DN.ensureProfiles();
    select.innerHTML = s.profiles
      .map(
        (p) =>
          `<option value="${DN.esc(p.id)}"${p.id === s.activeId ? " selected" : ""}>${DN.esc(p.name)}</option>`
      )
      .join("");
  }

  function render() {
    if (el.max) el.max.textContent = String(DN.PROFILE_MAX);
    const state = DN.ensureProfiles();
    const canRemove = state.profiles.length > 1;
    el.list.innerHTML = state.profiles
      .map((p) => {
        const active = p.id === state.activeId ? " is-active" : "";
        return (
          `<div class="profiles-row${active}" data-profile-id="${DN.esc(p.id)}">` +
          `<input type="text" class="profiles-name" maxlength="40" value="${DN.esc(p.name)}" aria-label="Profile name" />` +
          `<button type="button" class="btn btn-small profiles-remove" ${canRemove ? "" : "disabled "}>Remove</button>` +
          `</div>`
        );
      })
      .join("");

    for (const row of el.list.querySelectorAll(".profiles-row")) {
      const id = row.getAttribute("data-profile-id");
      const input = /** @type {HTMLInputElement} */ (row.querySelector(".profiles-name"));
      const removeBtn = row.querySelector(".profiles-remove");
      input.addEventListener("change", () => {
        DN.renameProfile(id, input.value);
        syncNavSelect();
        render();
      });
      removeBtn.addEventListener("click", () => {
        const st = DN.ensureProfiles();
        if (st.profiles.length <= 1) return;
        const switching = st.activeId === id;
        if (!DN.removeProfile(id)) return;
        if (switching) {
          location.reload();
          return;
        }
        syncNavSelect();
        render();
      });
    }

    if (el.add) el.add.disabled = state.profiles.length >= DN.PROFILE_MAX;
  }

  if (el.add) {
    el.add.addEventListener("click", () => {
      const state = DN.ensureProfiles();
      if (state.profiles.length >= DN.PROFILE_MAX) return;
      DN.addProfile(`Profile ${state.profiles.length + 1}`);
      syncNavSelect();
      render();
    });
  }

  render();
})();
