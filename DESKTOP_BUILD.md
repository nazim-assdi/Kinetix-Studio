# Kinetix Studio Desktop (Windows)

Kinetix Studio can be packaged as a Windows x64 desktop application using Electron and an NSIS installer.

## Build the installer

Requirements:
- Windows 10 or 11 x64
- Node.js 22 or newer
- npm

Run:

```powershell
npm install
npm test
npm run lint
npm run dist:win
```

The installer is written to `release/Kinetix-Studio-Setup-1.0.0-x64.exe`.

## Run the desktop app in development

```powershell
npm install
npm run desktop:dev
```

## Gemini AI configuration

The desktop app reads an optional `.env` file from Electron's per-user application data directory. Add:

```env
GEMINI_API_KEY=your_gemini_api_key
```

For a managed deployment that requires a shared access key, also set:

```env
KINETIX_AI_ACCESS_KEY=your_long_random_access_key
```

Never commit real API keys or access keys to Git.

The app runs its Express API on a loopback-only ephemeral port and loads the packaged Vite build from the app's resources directory. No externally reachable server port is opened by the desktop shell.
