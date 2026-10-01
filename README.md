# ⚡ Pokémon Slots - Sistema para Comunidad

Tragamonedas temática Pokémon con códigos QR de un solo uso, panel de administración y notificaciones por Discord.

Funciona perfecto en **celular y PC**.

---

## Características

- Registro / login solo con nombre de usuario
- Códigos QR de un solo uso con cantidad de monedas variable
- Tragamonedas con animación de rodillos
- Premios configurables (3 iguales = Pokémon virtual)
- Panel admin 100% usable desde el celular
- Notificación a Discord cuando alguien gana un premio
- Historial de premios y marca de "entregado"

---

## Cómo correrlo localmente (prueba)

```bash
cd pokemon_slots
pip install fastapi uvicorn jinja2 python-multipart "qrcode[pil]" pillow itsdangerous
python main.py
```

Abrí en el navegador: http://localhost:8000

- Juego: http://localhost:8000
- Admin: http://localhost:8000/admin  
  Contraseña por defecto: `admin123`

---

## Cómo subirlo online (recomendado - gratis)

### Opción más fácil: Railway.app

1. Creá una cuenta en [railway.app](https://railway.app)
2. New Project → Deploy from GitHub (o subí la carpeta)
3. Agregá estas variables de entorno si querés (opcionales)
4. Railway te da una URL pública automáticamente

O usá **Render.com** (también tiene plan gratuito).

### Requisitos mínimos

- Python 3.10+
- Las dependencias del `requirements.txt`

---

## Uso diario

### Como administrador (desde el celular):

1. Entrá a `/admin`
2. **Generar QR**: ponés cuántas monedas da → se genera el código + imagen QR
3. Descargás o mostrás el QR a la persona
4. En **Premios** ves quién ganó y marcás como entregado
5. En **Ajustes** pegás tu Discord Webhook para recibir notificaciones

### Como jugador:

1. Se registra con un nombre de usuario
2. Escanea o escribe el código del QR → recibe monedas
3. Juega a la tragamonedas (1 moneda = 1 tirada / 5 monedas = 10 tiradas)
4. Si saca 3 iguales de un Pokémon, gana ese premio

---

## Cambiar contraseña de admin

1. Entrá al panel → pestaña **Ajustes**
2. Escribí la nueva contraseña → Guardar

---

## Discord Webhook (notificaciones)

1. En tu servidor de Discord: Configuración del canal → Integraciones → Webhooks → Nuevo webhook
2. Copiá la URL
3. Pegala en el panel Admin → Ajustes

Cada vez que alguien gane un premio (excepto las 3 cerezas) te llegará un mensaje.

---

## Personalizar premios

En Admin → Config Premios podés agregar o editar combinaciones.

Formato de combinación: `pikachu,pikachu,pikachu`  
Símbolos disponibles: `pikachu`, `squirtle`, `charmander`, `bulbasaur`, `eevee`, `cherry`, `seven`
