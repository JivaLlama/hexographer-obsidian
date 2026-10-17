import { estimateLabelPx, HINT_DROP, pointRadius, type SceneModel } from "./layout";
import { WT_CLASS, WT_DATA, WT_VAR, classes } from "../theme/classes";
import { createChrome } from "../overlay/chrome";

const SVG_NS = "http://www.w3.org/2000/svg";

export interface TimelineViewOptions {
  surface: "inline" | "full";
  mobile: boolean;
  onOpenFull?: () => void;
}

export interface TimelineView {
  root: HTMLElement;
  frame: HTMLElement;
  body: HTMLElement;
  scene: SVGSVGElement;
  setStatus(text: string, title?: string): void;
  setFocused(focused: boolean): void;
  setPanning(panning: boolean): void;
  setTranslate(x: number): void;
  sceneWidth(): number;
  scenePoint(clientX: number, clientY: number): { x: number; y: number };
  itemHeight(): number;
  labelWidth(title: string): number;
  scrollLanesBy(dy: number): void;
  laneScroll(): number;
  render(model: SceneModel): void;
  destroy(): void;
}

export function createTimelineView(container: HTMLElement, options: TimelineViewOptions): TimelineView {
  const root = document.createElement("div");
  root.className = classes(
    WT_CLASS.root,
    options.surface === "full" ? "is-full" : "is-inline",
    options.mobile && "is-mobile"
  );
  root.tabIndex = 0;
  root.setAttribute("role", "application");
  root.setAttribute("aria-label", "World timeline");

  const chrome = createChrome(options);
  const frame = document.createElement("div");
  frame.className = "wt-frame";

  const axis = document.createElement("div");
  axis.className = WT_CLASS.axis;
  const gutter = document.createElement("div");
  gutter.className = "wt-axis-gutter";
  const axisTrack = document.createElement("div");
  axisTrack.className = "wt-axis-track";
  axis.append(gutter, axisTrack);

  const body = document.createElement("div");
  body.className = "wt-body";
  const laneCol = document.createElement("div");
  laneCol.className = "wt-lane-col";
  const sceneWrap = document.createElement("div");
  sceneWrap.className = "wt-scene-wrap";

  const scene = svgEl("svg");
  scene.classList.add("wt-scene");
  scene.setAttribute("aria-hidden", "true");
  const dated = svgEl("g");
  dated.classList.add("wt-dated");
  const clipId = `wt-dated-${Math.random().toString(36).slice(2, 8)}`;
  const clip = svgEl("clipPath");
  clip.id = clipId;
  const clipRect = svgEl("rect");
  clip.append(clipRect);
  const defs = svgEl("defs");
  defs.append(clip);
  const pan = svgEl("g");
  pan.classList.add("wt-pan");
  const hitLayer = svgEl("g");
  const eras = svgEl("g");
  eras.classList.add("wt-eras");
  const lanes = svgEl("g");
  lanes.classList.add("wt-lanes");
  const items = svgEl("g");
  items.classList.add("wt-items");
  const ghost = svgEl("g");
  ghost.classList.add(WT_CLASS.ghost);
  pan.append(hitLayer, eras, lanes, items, ghost);
  dated.append(pan);
  const labelProbe = svgEl("text");
  labelProbe.setAttribute("opacity", "0");
  labelProbe.setAttribute("pointer-events", "none");
  labelProbe.setAttribute("aria-hidden", "true");
  labelProbe.setAttribute("y", "-40");
  labelProbe.textContent = "Mg";
  const beforeLayer = svgEl("g");
  beforeLayer.classList.add("wt-before");
  scene.append(defs, dated, beforeLayer, labelProbe);

  const axisBefore = document.createElement("div");
  axisBefore.className = "wt-axis-before";
  axisBefore.hidden = true;
  axis.append(axisBefore);

  sceneWrap.append(scene);
  body.append(laneCol, sceneWrap);
  frame.append(axis, body);
  root.append(chrome.toolbar, frame);
  container.replaceChildren(root);

  let translateX = 0;
  const measureLabel = createLabelMeasurer(labelProbe);

  const view: TimelineView = {
    root,
    frame,
    body,
    scene,
    setStatus(text, title) {
      chrome.status.textContent = text;
      if (title) chrome.status.title = title;
      else chrome.status.removeAttribute("title");
    },
    setFocused(focused) {
      root.classList.toggle("is-focused", focused);
    },
    setPanning(panning) {
      root.classList.toggle("is-panning", panning);
    },
    setTranslate(x) {
      translateX = x;
      pan.setAttribute("transform", `translate(${round(x)} 0)`);
      axisTrack.style.transform = `translateX(${round(x)}px)`;
    },
    sceneWidth() {
      return sceneWrap.clientWidth;
    },
    scenePoint(clientX, clientY) {
      const rect = scene.getBoundingClientRect();
      return { x: clientX - rect.left, y: clientY - rect.top };
    },
    itemHeight() {
      const raw = getComputedStyle(root).getPropertyValue(WT_VAR.itemHeight).trim();
      const parsed = Number.parseFloat(raw);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
      return options.mobile ? 32 : 22;
    },
    labelWidth(title) {
      return measureLabel(title);
    },
    scrollLanesBy(dy) {
      body.scrollTop += dy;
    },
    laneScroll() {
      return body.scrollTop;
    },
    render(model) {
      const width = Math.max(model.viewportWidth, view.sceneWidth());
      const height = Math.max(model.contentHeight, 1);
      scene.setAttribute("width", String(width));
      scene.setAttribute("height", String(height));
      scene.style.width = `${width}px`;
      scene.style.height = `${height}px`;
      const scrollbar = body.offsetWidth - body.clientWidth;
      axis.style.marginRight = scrollbar > 0 ? `${scrollbar}px` : "";

      hitLayer.replaceChildren();
      eras.replaceChildren();
      lanes.replaceChildren();
      items.replaceChildren();
      beforeLayer.replaceChildren();
      ghost.replaceChildren();
      axisTrack.replaceChildren();
      laneCol.replaceChildren();

      const hit = svgEl("rect");
      hit.setAttribute("x", String(-model.overscanPx));
      hit.setAttribute("y", "0");
      hit.setAttribute("width", String(width + model.overscanPx * 2));
      hit.setAttribute("height", String(height));
      hit.setAttribute("fill", "transparent");
      hit.setAttribute("pointer-events", "all");
      hitLayer.append(hit);

      for (const era of model.eras) {
        const group = svgEl("g");
        group.classList.add(WT_CLASS.era);
        group.setAttribute(WT_DATA.id, era.id);
        group.setAttribute(WT_DATA.type, "era");
        group.setAttribute(WT_DATA.tags, era.tags);
        if (era.color) group.style.setProperty(WT_VAR.eraFill, era.color);
        const rect = svgEl("rect");
        rect.setAttribute("x", round(era.x));
        rect.setAttribute("y", "0");
        rect.setAttribute("width", round(era.width));
        rect.setAttribute("height", String(height));
        group.append(rect);
        const label = fitLabel(era.title, Math.min(era.width - 12, width - era.labelX));
        if (label) {
          const text = svgEl("text");
          text.setAttribute("x", round(era.labelX));
          text.setAttribute("y", "16");
          text.textContent = label;
          group.append(text);
        }
        eras.append(group);
      }

      for (const lane of model.lanes) {
        const rect = svgEl("rect");
        rect.setAttribute("class", classes(WT_CLASS.lane, lane.alt && WT_CLASS.laneAlt));
        rect.setAttribute("x", String(-model.overscanPx));
        rect.setAttribute("y", round(lane.y));
        rect.setAttribute("width", String(width + model.overscanPx * 2));
        rect.setAttribute("height", round(lane.height));
        lanes.append(rect);

        const label = document.createElement("div");
        label.className = classes(WT_CLASS.laneLabel, lane.alt && WT_CLASS.laneAlt);
        label.style.height = `${lane.height}px`;
        label.textContent = lane.label;
        label.title = lane.label;
        laneCol.append(label);
      }

      if (model.before) {
        axisBefore.hidden = false;
        axisBefore.style.width = `${model.before.width}px`;
        axisBefore.textContent = model.before.label;
        dated.setAttribute("clip-path", `url(#${clipId})`);
        clipRect.setAttribute("x", String(model.before.width));
        clipRect.setAttribute("y", "-8");
        clipRect.setAttribute("width", String(Math.max(width - model.before.width + model.overscanPx, 0)));
        clipRect.setAttribute("height", String(height + 16));
        const band = svgEl("rect");
        band.classList.add("wt-before-band");
        band.setAttribute("x", "0");
        band.setAttribute("y", "0");
        band.setAttribute("width", String(model.before.width));
        band.setAttribute("height", String(height));
        beforeLayer.append(band);
      } else {
        axisBefore.hidden = true;
        axisBefore.textContent = "";
        axisBefore.style.width = "";
        dated.removeAttribute("clip-path");
      }

      for (const item of model.items) {
        const group = svgEl("g");
        group.setAttribute(
          "class",
          classes(
            WT_CLASS.item,
            item.shape === "point" ? WT_CLASS.itemEvent : item.kind === "span" ? WT_CLASS.itemSpan : WT_CLASS.itemEvent,
            item.selected && WT_CLASS.selection
          )
        );
        group.setAttribute(WT_DATA.id, item.id);
        group.setAttribute(WT_DATA.type, item.kind);
        group.setAttribute(WT_DATA.tags, item.tags);
        group.setAttribute(WT_DATA.lane, item.laneId);
        if (item.certainty) group.setAttribute(WT_DATA.certainty, item.certainty);
        if (item.ordered) {
          group.classList.add("wt-ordered");
          group.setAttribute("data-ordered", "true");
        }
        group.setAttribute("aria-label", item.title);
        if (item.color) group.style.setProperty(WT_VAR.itemFill, item.color);
        const tip = svgEl("title");
        tip.textContent = item.tooltip;
        group.append(tip);

        if (item.bracket) {
          const bracket = svgEl("rect");
          bracket.classList.add("wt-bracket");
          bracket.setAttribute("x", round(item.bracket.x));
          bracket.setAttribute("y", round(item.y + item.height / 2 - 3));
          bracket.setAttribute("width", round(item.bracket.width));
          bracket.setAttribute("height", "6");
          bracket.setAttribute("rx", "3");
          group.append(bracket);
        }

        if (item.shape === "point") {
          const radius = pointRadius(item.height);
          const cy = item.y + item.height / 2;
          const diamond = svgEl("polygon");
          diamond.setAttribute(
            "points",
            `${round(item.x)},${round(cy - radius)} ${round(item.x + radius)},${round(cy)} ${round(item.x)},${round(cy + radius)} ${round(item.x - radius)},${round(cy)}`
          );
          group.append(diamond);
        } else {
          const rect = svgEl("rect");
          rect.setAttribute("x", round(item.x));
          rect.setAttribute("y", round(item.y));
          rect.setAttribute("width", round(Math.max(item.width, 2)));
          rect.setAttribute("height", round(item.height));
          rect.setAttribute("rx", "4");
          group.append(rect);
        }

        if (item.label) {
          const text = svgEl("text");
          text.setAttribute("x", round(item.labelX));
          text.setAttribute("y", round(item.y + item.height / 2));
          text.setAttribute("dominant-baseline", "middle");
          text.textContent = item.label;
          group.append(text);
        }
        if (item.hint) {
          const hint = svgEl("text");
          hint.classList.add("wt-item-hint");
          hint.setAttribute("x", round(item.labelX));
          hint.setAttribute("y", round(item.y + item.height / 2 + HINT_DROP));
          hint.setAttribute("dominant-baseline", "middle");
          hint.textContent = item.hint;
          group.append(hint);
        }

        if (item.parseError) {
          const badge = svgEl("circle");
          badge.setAttribute("class", WT_CLASS.errorBadge);
          badge.setAttribute("cx", round(item.x + Math.max(item.width - 4, 8)));
          badge.setAttribute("cy", round(item.y + 4));
          badge.setAttribute("r", "4");
          const title = svgEl("title");
          title.textContent = item.tooltip;
          badge.append(title);
          group.append(badge);
        }

        (item.pinned ? beforeLayer : items).append(group);
      }

      for (const tick of model.ticks) {
        const mark = document.createElement("div");
        mark.className = classes(WT_CLASS.tick, tick.major ? WT_CLASS.tickMajor : WT_CLASS.tickMinor);
        mark.style.left = `${tick.x}px`;
        if (tick.major && tick.label) {
          const label = document.createElement("span");
          label.className = "wt-tick-label";
          label.textContent = tick.label;
          mark.append(label);
        }
        axisTrack.append(mark);
      }

      pan.setAttribute("transform", `translate(${round(translateX)} 0)`);
      axisTrack.style.transform = `translateX(${round(translateX)}px)`;
    },
    destroy() {
      root.remove();
    },
  };

  return view;
}

function svgEl<K extends keyof SVGElementTagNameMap>(name: K): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, name);
}

function round(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return String(Math.round(value * 10) / 10);
}

function fitLabel(title: string, width: number): string {
  const max = Math.floor((width - 8) / 6.5);
  if (max < 2) return "";
  if (title.length <= max) return title;
  return `${title.slice(0, max - 1)}…`;
}

/** Measure with the scene's own text element so packing matches the drawn font. */
function createLabelMeasurer(probe: SVGTextElement): (title: string) => number {
  const cache = new Map<string, number>();
  return (title: string) => {
    const cached = cache.get(title);
    if (cached !== undefined) return cached;
    probe.textContent = title.length > 0 ? title : " ";
    let width = 0;
    try {
      width = probe.getBBox().width;
    } catch {
      width = 0;
    }
    if (!(width > 0)) return estimateLabelPx(title);
    cache.set(title, width);
    return width;
  };
}
