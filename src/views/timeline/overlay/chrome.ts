export interface TimelineChrome {
  toolbar: HTMLElement;
  status: HTMLElement;
  notices: HTMLElement;
  setAccounts(
    cultures: readonly string[],
    value: boolean | string[] | undefined,
    onChange: (next: boolean | string[]) => void
  ): void;
  setDragTip(text: string | null): void;
  setNotices(errors: readonly { title: string; message: string }[], warnings: readonly { title: string; message: string }[]): void;
}

/** HTML chrome above the scene. The full view has no "open" button. */
export function createChrome(options: { surface: "inline" | "full"; onOpenFull?: () => void }): TimelineChrome {
  const toolbar = document.createElement("div");
  toolbar.className = "wt-toolbar";

  const status = document.createElement("div");
  status.className = "wt-status";
  status.textContent = "Loading timeline…";

  const accounts = document.createElement("div");
  accounts.className = "wt-accounts";
  accounts.hidden = true;

  const dragTip = document.createElement("div");
  dragTip.className = "wt-drag-tip";
  dragTip.hidden = true;

  toolbar.append(status, accounts, dragTip);

  if (options.surface === "inline" && options.onOpenFull) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "wt-open-full";
    button.textContent = "Open in full view";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      options.onOpenFull?.();
    });
    toolbar.append(button);
  }

  const notices = document.createElement("div");
  notices.className = "wt-notices";
  notices.hidden = true;

  return {
    toolbar,
    status,
    notices,
    setAccounts(cultures, value, onChange) {
      accounts.replaceChildren();
      const label = document.createElement("span");
      label.className = "wt-accounts-label";
      label.textContent = "Accounts";
      const off = modeButton("Off", value === false || value === undefined, () => onChange(false));
      const all = modeButton("All", value === true, () => onChange(true));
      accounts.append(label, off, all);
      const selected = new Set(Array.isArray(value) ? value.map((entry) => entry.trim().toLowerCase()) : []);
      for (const culture of cultures) {
        const row = document.createElement("label");
        row.className = "wt-accounts-culture";
        const box = document.createElement("input");
        box.type = "checkbox";
        box.checked = selected.has(culture.trim().toLowerCase());
        box.addEventListener("change", () => {
          const next = new Set(selected);
          const key = culture.trim().toLowerCase();
          if (box.checked) next.add(key);
          else next.delete(key);
          const list = cultures.filter((entry) => next.has(entry.trim().toLowerCase()));
          onChange(list);
        });
        row.append(box, document.createTextNode(culture));
        accounts.append(row);
      }
      accounts.hidden = false;
    },
    setDragTip(text) {
      if (!text) {
        dragTip.hidden = true;
        dragTip.textContent = "";
        return;
      }
      dragTip.hidden = false;
      dragTip.textContent = text;
    },
    setNotices(errors, warnings) {
      notices.replaceChildren();
      for (const chip of errors) notices.append(chipEl("wt-error-chip", chip.title, chip.message));
      for (const chip of warnings) notices.append(chipEl("wt-warning-chip", chip.title, chip.message));
      notices.hidden = errors.length === 0 && warnings.length === 0;
    },
  };
}

function modeButton(text: string, pressed: boolean, onClick: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "wt-accounts-mode";
  button.textContent = text;
  button.setAttribute("aria-pressed", pressed ? "true" : "false");
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClick();
  });
  return button;
}

function chipEl(className: string, title: string, message: string): HTMLElement {
  const chip = document.createElement("div");
  chip.className = className;
  chip.textContent = `${title}: ${message}`;
  chip.title = message;
  return chip;
}
