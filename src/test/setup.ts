import "@testing-library/jest-dom/vitest";

// jsdom does not implement object URLs. The ImagePicker previews selected
// files via URL.createObjectURL; polyfill it so file-selection tests exercise
// the real component path instead of crashing.
if (typeof URL.createObjectURL !== "function") {
  let counter = 0;
  URL.createObjectURL = (): string => {
    counter += 1;
    return `blob:mock/${counter}`;
  };
  URL.revokeObjectURL = (): void => {
    // Nothing to release: the URL is a deterministic mock.
  };
}
