/**
 * Drop zone. Wires the drop element + Choose / Load demo buttons.
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
  demoBtn: HTMLButtonElement;
  onFiles: (files: File[]) => void;
  onDemo: () => void;
}

export function bindDropzone(opts: DropzoneOptions): void {
  const { rootEl, fileInput, folderInput, chooseBtn, demoBtn, onFiles, onDemo } = opts;

  // Configure file input accept list (handlers + folder picker too).
  fileInput.setAttribute("accept", ACCEPT_ATTR);
  // We don't expose a separate folder button — the same dropzone accepts both.
  // The folder-input is here so users on Chromium that don't fire dragenter
  // for folders can still use webkitdirectory via the picker if needed.
  folderInput.setAttribute("accept", ACCEPT_ATTR);

  // Click on the dropzone area opens the file picker.
  rootEl.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).closest("button")) return;
    if ((e.target as HTMLElement).closest("input")) return;
    fileInput.click();
  });
  rootEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fileInput.click();
    }
  });

  chooseBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    fileInput.click();
  });

  demoBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    onDemo();
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

  // Stop the browser from navigating away when a misdrop lands outside.
  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("drop", (e) => e.preventDefault());
}
