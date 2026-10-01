import { App, FuzzySuggestModal, Modal, Setting, TFile } from "obsidian";
import { MAP_DIR, MAP_EXT, mapPath } from "../hex";

export interface NewMapResult {
  name: string;
  cols: number;
  rows: number;
}

export class NewMapModal extends Modal {
  private name = "untitled";
  private cols = 20;
  private rows = 15;
  private onSubmit: (result: NewMapResult) => void;

  constructor(app: App, onSubmit: (result: NewMapResult) => void, defaults?: Partial<NewMapResult>) {
    super(app);
    this.onSubmit = onSubmit;
    if (defaults?.name) this.name = defaults.name;
    if (defaults?.cols) this.cols = defaults.cols;
    if (defaults?.rows) this.rows = defaults.rows;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "New hex map" });

    new Setting(contentEl).setName("Name").addText((t) => {
      t.setValue(this.name).onChange((v) => {
        this.name = v;
      });
    });

    new Setting(contentEl).setName("Columns").addText((t) => {
      t.setValue(String(this.cols)).onChange((v) => {
        const n = Number(v);
        if (Number.isFinite(n) && n > 0) this.cols = Math.min(200, Math.floor(n));
      });
    });

    new Setting(contentEl).setName("Rows").addText((t) => {
      t.setValue(String(this.rows)).onChange((v) => {
        const n = Number(v);
        if (Number.isFinite(n) && n > 0) this.rows = Math.min(200, Math.floor(n));
      });
    });

    new Setting(contentEl).addButton((b) => {
      b.setButtonText("Create")
        .setCta()
        .onClick(() => {
          const name = this.name.trim() || "untitled";
          this.close();
          this.onSubmit({ name, cols: this.cols, rows: this.rows });
        });
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export class OpenMapModal extends FuzzySuggestModal<TFile> {
  private files: TFile[];
  private onChoose: (file: TFile) => void;

  constructor(app: App, files: TFile[], onChoose: (file: TFile) => void) {
    super(app);
    this.files = files;
    this.onChoose = onChoose;
    this.setPlaceholder("Open hex map…");
  }

  getItems(): TFile[] {
    return this.files;
  }

  getItemText(item: TFile): string {
    return item.path;
  }

  onChooseItem(item: TFile): void {
    this.onChoose(item);
  }
}

export class SaveMapModal extends Modal {
  private name: string;
  private onSubmit: (path: string) => void;

  constructor(app: App, defaultName: string, onSubmit: (path: string) => void) {
    super(app);
    this.name = defaultName;
    this.onSubmit = onSubmit;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Save hex map" });

    contentEl.createEl("p", {
      cls: "hex-modal-hint",
      text: `Saved under ${MAP_DIR}/ as *${MAP_EXT}`,
    });

    new Setting(contentEl).setName("File name").addText((t) => {
      t.setValue(this.name).onChange((v) => {
        this.name = v;
      });
    });

    new Setting(contentEl).addButton((b) => {
      b.setButtonText("Save")
        .setCta()
        .onClick(() => {
          const raw = this.name.trim() || "untitled";
          const path = raw.endsWith(MAP_EXT)
            ? raw.includes("/")
              ? raw
              : `${MAP_DIR}/${raw}`
            : mapPath(raw.replace(/\.hexmap\.json$/i, ""));
          this.close();
          this.onSubmit(path);
        });
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export class LabelModal extends Modal {
  private text: string;
  private onSubmit: (text: string | null) => void;
  private cancelled = true;

  constructor(app: App, initial: string, onSubmit: (text: string | null) => void) {
    super(app);
    this.text = initial;
    this.onSubmit = onSubmit;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Hex label" });

    new Setting(contentEl).setName("Text").addText((t) => {
      t.setValue(this.text).onChange((v) => {
        this.text = v;
      });
      t.inputEl.focus();
      t.inputEl.select();
    });

    new Setting(contentEl)
      .addButton((b) => {
        b.setButtonText("Clear").onClick(() => {
          this.cancelled = false;
          this.close();
          this.onSubmit("");
        });
      })
      .addButton((b) => {
        b.setButtonText("Apply")
          .setCta()
          .onClick(() => {
            this.cancelled = false;
            this.close();
            this.onSubmit(this.text);
          });
      });
  }

  onClose(): void {
    this.contentEl.empty();
    if (this.cancelled) this.onSubmit(null);
  }
}
