/**
 * Drop zone. Wires the drop element + Choose button + URL input.
 *
 * The dropzone background is itself the picker click-target; the buttons
 * inside are siblings whose click handlers stop propagation so they don't
 * also re-trigger the underlying picker.
 */

import {
  ACCEPT_ATTR,
  filesFromDataTransfer,
  filesFromInput,
} from "../media/fileInput.js";

export interface DropzoneOptions {
  rootEl: HTMLElement;
  fileInput: HTMLInputElement;
  folderInput: HTMLInputElement;
  chooseBtn: HTMLButtonElement;
  urlForm: HTMLFormElement;
  urlInput: HTMLInputElement;
  onFiles: (files: File[]) => void;
  onUrl: (url: string) => void;
}

export function bindDropzone(opts: DropzoneOptions): void {
  const {
    rootEl,
    fileInput,
    folderInput,
    chooseBtn,
    urlForm,
    urlInput,
    onFiles,
    onUrl,
  } = opts;

  fileInput.setAttribute("accept", ACCEPT_ATTR);
  folderInput.setAttribute("accept", ACCEPT_ATTR);

  // Click on the dropzone area opens the file picker (but not on form/input).
  rootEl.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    if (target.closest("button")) return;
    if (target.closest("input")) return;
    if (target.closest("form")) return;
    fileInput.click();
  });
  rootEl.addEventListener("keydown", (e) => {
    if (e.target !== rootEl) return; // don't hijack typing in the URL input
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fileInput.click();
    }
  });

  chooseBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    fileInput.click();
  });

  fileInput.addEventListener("change", () => {
    const files = filesFromInput(fileInput.files);
    fileInput.value = "";
    if (files.length) onFiles(files);
  });

  folderInput.addEventListener("change", () => {
    const files = filesFromInput(folderInput.files);
    folderInput.value = "";
    if (files.length) onFiles(files);
  });

  // URL form
  urlForm.addEventListener("click", (e) => e.stopPropagation());
  urlForm.addEventListener("submit", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const u = urlInput.value.trim();
    if (!u) return;
    onUrl(u);
    urlInput.value = "";
  });

  // Drag and drop.
  let dragDepth = 0;
  rootEl.addEventListener("dragenter", (e) => {
    e.preventDefault();
    dragDepth++;
    rootEl.classList.add("dragging");
  });
  rootEl.addEventListener("dragover", (e) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
  });
  rootEl.addEventListener("dragleave", () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) rootEl.classList.remove("dragging");
  });
  rootEl.addEventListener("drop", async (e) => {
    e.preventDefault();
    dragDepth = 0;
    rootEl.classList.remove("dragging");
    if (!e.dataTransfer) return;
    const files = await filesFromDataTransfer(e.dataTransfer);
    if (files.length) onFiles(files);
  });

  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("drop", (e) => e.preventDefault());
}
