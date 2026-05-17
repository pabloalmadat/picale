# PICALE — Frontend

Replay instantáneo para canchas de pádel.

## Estructura

```
picale/
├── index.html          ← Landing pública (picalereplay.com)
├── app/
│   └── dashboard.html  ← Panel principal (picalereplay.com/app)
├── css/
│   └── app.css         ← Estilos del dashboard
├── js/
│   ├── config.js       ← API_BASE_URL y config de entorno
│   └── app.js          ← Lógica completa del dashboard
├── assets/
│   └── icons/
│       └── favicon.svg
├── vercel.json         ← Config para deploy en Vercel
└── .gitignore
```

## Cambiar entorno

Edita `js/config.js`:

```js
// Local
const PICALE_ENV = { API_BASE_URL: 'http://localhost:8000' };

// Producción
const PICALE_ENV = { API_BASE_URL: 'https://api.picalereplay.com' };
```

## Deploy en Vercel

1. Sube el repo a GitHub
2. Entra a vercel.com → New Project → importa tu repo
3. Framework: **Other** (estático, sin build)
4. Root Directory: `/` (o la carpeta del repo)
5. Click **Deploy**

## Conectar dominio en Vercel + GoDaddy

### En Vercel:
1. Settings → Domains → Add `picalereplay.com`
2. Vercel te dará dos valores: un **A record** y un **CNAME**

### En GoDaddy:
1. My Products → DNS → Manage Zones → picalereplay.com
2. Edita el registro **A** existente:
   - Type: `A`
   - Name: `@`
   - Value: `76.76.21.21` ← IP que da Vercel
   - TTL: 600
3. Agrega registro **CNAME**:
   - Type: `CNAME`
   - Name: `www`
   - Value: `cname.vercel-dns.com`
   - TTL: 600
4. Espera 5-30 min para propagación

## Usar localmente (sin servidor, con cámara)

Lanza Chrome con:
```
chrome.exe --disable-web-security --allow-running-insecure-content --user-data-dir="%TEMP%\picale_dev" app/dashboard.html
```

O usa el archivo `PICALE_abrir.bat` incluido.
