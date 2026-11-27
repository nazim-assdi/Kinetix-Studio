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

Open the **AI** tab and enter your Google AI Studio Gemini API key in the **Gemini API Key** field. The key is kept in the current browser session and sent only with your AI requests; it is not added to projects or stored in the app database.

You may instead configure a server-wide default key in the server environment:

```env
GEMINI_API_KEY=your_gemini_api_key
```

A server-wide key takes precedence over a user's session key. For a managed deployment that requires a shared access key, also set:

```env
KINETIX_AI_ACCESS_KEY=your_long_random_access_key
```

Never commit real API keys or access keys to Git.

The app runs its Express API on a loopback-only ephemeral port and loads the packaged Vite build from the app's resources directory. No externally reachable server port is opened by the desktop shell.
