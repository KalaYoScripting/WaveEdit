# Build Resources

`electron-builder` automatically picks up an application icon from this folder.

Add one of the following and it will be used across installers:

- `icon.png` — a single 1024x1024 (or at least 512x512) PNG. electron-builder
  derives the platform-specific formats from it.
- `icon.ico` — Windows-specific icon (optional override).
- `icon.icns` — macOS-specific icon (optional override).

If no icon is present, the default Electron icon is used (a non-fatal warning is
printed during packaging).
