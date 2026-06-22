# Build Resources

Application icon: **`Icon.png`** (1024×1024 or larger recommended).

`electron-builder` uses this file for Windows (`.exe`), macOS (`.dmg`), and Linux (AppImage / `.deb`) installers. The same icon is shown in the taskbar when running via `npm start`.

To rebuild installers with the icon: `npm run build:win` (or `build:mac` / `build:linux`).
