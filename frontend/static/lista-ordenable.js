/* Unexuam · Lista reordenable (Ley de Affordances: asa visible, vista previa de destino, animación y teclado). */
(() => {
  const KEY = "unexuam-orden-prioridad-v1";
  const GRIP = '<svg viewBox="0 0 16 24" aria-hidden="true"><circle cx="5" cy="6" r="1.6"/><circle cx="11" cy="6" r="1.6"/><circle cx="5" cy="12" r="1.6"/><circle cx="11" cy="12" r="1.6"/><circle cx="5" cy="18" r="1.6"/><circle cx="11" cy="18" r="1.6"/></svg>';

  function guardarOrden(ul) {
    try { localStorage.setItem(KEY, JSON.stringify([...ul.children].map(li => li.dataset.ordenId).filter(Boolean))); } catch {}
  }

  function restaurarOrden(ul) {
    try {
      const ids = JSON.parse(localStorage.getItem(KEY) || "[]");
      ids.forEach(id => { const li = ul.querySelector(`:scope > li[data-orden-id="${id}"]`); if (li) ul.appendChild(li); });
    } catch {}
  }

  function animarFlip(ul, antes) {
    [...ul.children].forEach(el => {
      const r0 = antes.get(el);
      if (!r0) return;
      const dy = r0.top - el.getBoundingClientRect().top;
      if (!dy) return;
      el.style.transition = "none";
      el.style.transform = `translateY(${dy}px)`;
      requestAnimationFrame(() => {
        el.style.transition = "transform .22s cubic-bezier(.22,1,.36,1)";
        el.style.transform = "";
      });
    });
  }

  function anunciar(ul, txt) {
    let live = ul.parentElement?.querySelector(".drag-live");
    if (!live) {
      live = document.createElement("p");
      live.className = "sr drag-live";
      live.setAttribute("aria-live", "polite");
      ul.after(live);
    }
    live.textContent = txt;
  }

  function iniciar() {
    const ul = document.getElementById("lista-prioridad");
    if (!ul) return;
    ul.classList.add("lista-ordenable");
    [...ul.children].forEach(li => {
      const btn = li.querySelector("[data-guia]");
      const id = btn?.dataset.guia || li.textContent.trim().slice(0, 16);
      const nombre = li.querySelector(".fila-icono b")?.textContent || id;
      li.dataset.ordenId = id;
      li.classList.add("drag-item");
      const asa = document.createElement("span");
      asa.className = "drag-asa";
      asa.tabIndex = 0;
      asa.setAttribute("role", "button");
      asa.setAttribute("aria-label", `Mover ${nombre}. Usa flecha arriba o abajo para reordenar.`);
      asa.innerHTML = GRIP;
      li.prepend(asa);

      asa.addEventListener("click", ev => { ev.preventDefault(); ev.stopPropagation(); });
      asa.addEventListener("keydown", ev => {
        if (ev.key !== "ArrowUp" && ev.key !== "ArrowDown") return;
        ev.preventDefault();
        const antes = new Map([...ul.children].map(el => [el, el.getBoundingClientRect()]));
        if (ev.key === "ArrowUp" && li.previousElementSibling) ul.insertBefore(li, li.previousElementSibling);
        else if (ev.key === "ArrowDown" && li.nextElementSibling) ul.insertBefore(li.nextElementSibling, li);
        else return;
        animarFlip(ul, antes);
        guardarOrden(ul);
        asa.focus();
        const pos = [...ul.children].indexOf(li) + 1;
        anunciar(ul, `${nombre} movido a la posición ${pos} de ${ul.children.length}.`);
      });

      asa.addEventListener("pointerdown", ev => {
        if (ev.button && ev.button !== 0) return;
        ev.preventDefault();
        asa.setPointerCapture(ev.pointerId);
        const r = li.getBoundingClientRect();
        const offY = ev.clientY - r.top;
        const destino = document.createElement("li");
        destino.className = "drag-destino";
        destino.style.height = `${r.height}px`;
        destino.setAttribute("aria-hidden", "true");
        li.after(destino);
        li.classList.add("arrastrando");
        li.style.width = `${r.width}px`;
        li.style.top = `${r.top}px`;
        li.style.left = `${r.left}px`;
        ul.classList.add("zona-activa");
        document.body.classList.add("arrastrando-lista");

        const mover = e => {
          li.style.top = `${e.clientY - offY}px`;
          const otros = [...ul.children].filter(el => el !== li && el !== destino);
          const siguiente = otros.find(el => e.clientY < el.getBoundingClientRect().top + el.getBoundingClientRect().height / 2);
          if (siguiente) ul.insertBefore(destino, siguiente);
          else ul.appendChild(destino);
        };

        const soltar = () => {
          asa.removeEventListener("pointermove", mover);
          asa.removeEventListener("pointerup", soltar);
          asa.removeEventListener("pointercancel", soltar);
          const antes = new Map([...ul.children].map(el => [el, el.getBoundingClientRect()]));
          destino.replaceWith(li);
          li.classList.remove("arrastrando");
          li.style.width = li.style.top = li.style.left = "";
          ul.classList.remove("zona-activa");
          document.body.classList.remove("arrastrando-lista");
          animarFlip(ul, antes);
          guardarOrden(ul);
          anunciar(ul, `${nombre} colocado en la posición ${[...ul.children].indexOf(li) + 1}.`);
        };

        asa.addEventListener("pointermove", mover);
        asa.addEventListener("pointerup", soltar);
        asa.addEventListener("pointercancel", soltar);
      });
    });
    restaurarOrden(ul);
  }

  document.addEventListener("DOMContentLoaded", iniciar);
})();
