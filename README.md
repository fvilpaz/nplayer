# Nando Player

Reproductor de música personal en formato **PWA** (Progressive Web App) — se instala en el móvil como una app nativa sin pasar por ninguna tienda.

## Demo

**https://fvilpaz.github.io/nplayer/**

## Qué es

Un reproductor de música minimalista con tema oscuro estilo Arch Linux, diseñado principalmente para **Android (Pixel)**.

- Accede directamente a la música almacenada en el teléfono (`/storage/emulated/0/Music` o cualquier carpeta)
- No necesita root ni permisos especiales — usa la File System Access API del navegador
- La carpeta seleccionada se recuerda entre sesiones (IndexedDB)

## Stack

| Capa | Tecnología |
|------|-----------|
| UI | HTML + CSS vanilla |
| Lógica | JavaScript vanilla (sin frameworks) |
| Audio | HTML5 `<audio>` |
| Acceso a archivos | File System Access API |
| Persistencia | IndexedDB + localStorage |
| Instalable | PWA (manifest + service worker) |

## Formatos soportados

`.mp3` `.wav` `.flac` `.ogg` `.m4a` `.aac` `.opus` `.wma`

## Funcionalidades

- ▶ Play / Pause / Stop / Siguiente / Anterior
- 🔀 Shuffle
- 🔁 Repeat (ninguno / todo / uno)
- Slider de progreso con tiempo actual/total
- Control de volumen
- Resalta la pista en reproducción
- Recuerda la última canción y posición al reabrir

## Instalar en Android

1. Abre Chrome en el Pixel y ve a `https://fvilpaz.github.io/nplayer/`
2. Chrome mostrará un banner "Añadir a pantalla de inicio" — acéptalo
3. La app se instala como cualquier otra app
4. Al abrirla, pulsa **"Abrir carpeta"** y selecciona tu carpeta de música

## Desarrollo local

```bash
# Cualquier servidor HTTP sirve, por ejemplo:
python -m http.server 8080
# luego abre http://localhost:8080
```
