export interface TimelineChrome {
  toolbar: HTMLElement;
  status: HTMLElement;
}

/** HTML chrome above the scene. The full view has no "open" button. */
export function createChrome(options: { surface: "inline" | "full"; onOpenFull?: () => void }): TimelineChrome {
  const toolbar = document.createElement("div");
  toolbar.className = "wt-toolbar";

  const status = document.createElement("div");
  status.className = "wt-status";
  status.textContent = "Loading timeline…";
  toolbar.append(status);

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

  return { toolbar, status };
}
