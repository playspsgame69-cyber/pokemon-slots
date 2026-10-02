"""
Pokémon Slot Machine - Community System
Online + Mobile friendly
"""

import sqlite3
import secrets
import string
import io
import base64
import json
import hashlib
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, Request, Form, Depends, HTTPException, Response
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.middleware.sessions import SessionMiddleware
import qrcode
from qrcode.image.pil import PilImage

# ============== CONFIG ==============
BASE_DIR = Path(__file__).parent
DB_PATH = BASE_DIR / "data" / "slots.db"
ADMIN_PASSWORD = "admin123"  # Cámbialo después
SECRET_KEY = secrets.token_hex(32)
SPIN_COST = 1
SPIN_PACK_10_COST = 5

SYMBOLS = [
    {"id": "pikachu", "name": "Pikachu", "img": "/static/img/pikachu.png", "color": "#FFD700"},
    {"id": "squirtle", "name": "Squirtle", "img": "/static/img/squirtle.png", "color": "#4FC3F7"},
    {"id": "charmander", "name": "Charmander", "img": "/static/img/charmander.png", "color": "#FF7043"},
    {"id": "bulbasaur", "name": "Bulbasaur", "img": "/static/img/bulbasaur.png", "color": "#66BB6A"},
    {"id": "eevee", "name": "Eevee", "img": "/static/img/eevee.png", "color": "#A1887F"},
    {"id": "cherry", "name": "Cereza", "img": "/static/img/cherry.png", "color": "#EF5350"},
    {"id": "seven", "name": "7", "img": "/static/img/seven.png", "color": "#FFD700"},
]

# Probabilidades (pesos). Más alto = más frecuente
SYMBOL_WEIGHTS = {
    "pikachu": 8,
    "squirtle": 12,
    "charmander": 12,
    "bulbasaur": 15,
    "eevee": 18,
    "cherry": 25,
    "seven": 10,
}

app = FastAPI(title="Lucky Dragons")
app.add_middleware(SessionMiddleware, secret_key=SECRET_KEY)
app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")
templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))


# ============== DATABASE ==============
def get_db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = get_db()
    c = conn.cursor()

    c.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            coins INTEGER DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS codes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT UNIQUE NOT NULL,
            coins_amount INTEGER NOT NULL,
            note TEXT,
            used_by INTEGER,
            used_at TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (used_by) REFERENCES users(id)
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS prizes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            combination TEXT UNIQUE NOT NULL,
            prize_name TEXT NOT NULL,
            description TEXT,
            active INTEGER DEFAULT 1
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS wins (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            combination TEXT NOT NULL,
            prize_name TEXT NOT NULL,
            delivered INTEGER DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
        )
    """)

    # Premios por defecto
    default_prizes = [
        ("pikachu,pikachu,pikachu", "Pikachu Shiny", "¡3 Pikachu! Premio especial de rayo"),
        ("squirtle,squirtle,squirtle", "Squirtle", "¡3 Squirtle! Pokémon de agua"),
        ("charmander,charmander,charmander", "Charmander", "¡3 Charmander! Pokémon de fuego"),
        ("bulbasaur,bulbasaur,bulbasaur", "Bulbasaur", "¡3 Bulbasaur! Pokémon de planta"),
        ("eevee,eevee,eevee", "Eevee", "¡3 Eevee! Pokémon evolutivo"),
        ("seven,seven,seven", "Premio Mayor", "¡JACKPOT! Premio especial del 7"),
        ("cherry,cherry,cherry", "Bonus Cereza", "¡3 Cerezas! +20 monedas"),
    ]

    for comb, name, desc in default_prizes:
        c.execute(
            "INSERT OR IGNORE INTO prizes (combination, prize_name, description) VALUES (?, ?, ?)",
            (comb, name, desc)
        )

    # Settings por defecto
    c.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('discord_webhook', '')")
    c.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('admin_password', ?)", (ADMIN_PASSWORD,))

    conn.commit()
    conn.close()


init_db()


# ============== HELPERS ==============
def generate_code(length=10):
    alphabet = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


def make_qr_base64(data: str) -> str:
    qr = qrcode.QRCode(version=1, box_size=8, border=2)
    qr.add_data(data)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode()


def get_setting(key: str, default: str = "") -> str:
    conn = get_db()
    row = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
    conn.close()
    return row["value"] if row else default


def set_setting(key: str, value: str):
    conn = get_db()
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?",
        (key, value, value)
    )
    conn.commit()
    conn.close()


def is_admin(request: Request) -> bool:
    return request.session.get("is_admin", False)


def require_admin(request: Request):
    if not is_admin(request):
        raise HTTPException(status_code=403, detail="No autorizado")


def get_current_user(request: Request) -> Optional[dict]:
    user_id = request.session.get("user_id")
    if not user_id:
        return None
    conn = get_db()
    user = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    conn.close()
    return dict(user) if user else None


def weighted_choice():
    items = list(SYMBOL_WEIGHTS.keys())
    weights = list(SYMBOL_WEIGHTS.values())
    total = sum(weights)
    r = secrets.randbelow(total)
    upto = 0
    for item, w in zip(items, weights):
        if upto + w >= r:
            return item
        upto += w
    return items[-1]


def spin_reels():
    return [weighted_choice() for _ in range(3)]


async def send_discord_notification(message: str):
    webhook = get_setting("discord_webhook")
    if not webhook:
        return
    try:
        import urllib.request
        data = json.dumps({"content": message}).encode()
        req = urllib.request.Request(
            webhook,
            data=data,
            headers={"Content-Type": "application/json"}
        )
        urllib.request.urlopen(req, timeout=5)
    except Exception:
        pass  # Silenciar errores de webhook


# ============== ROUTES - PÚBLICAS ==============
@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    user = get_current_user(request)
    return templates.TemplateResponse(
        request,
        "index.html",
        {
            "user": user,
            "symbols": SYMBOLS,
        },
    )


@app.post("/register")
async def register(request: Request, username: str = Form(...)):
    username = username.strip().lower()
    if len(username) < 3 or len(username) > 20:
        return JSONResponse({"ok": False, "error": "El nombre debe tener entre 3 y 20 caracteres"})
    if not username.replace("_", "").isalnum():
        return JSONResponse({"ok": False, "error": "Solo letras, números y guión bajo"})

    conn = get_db()
    try:
        c = conn.execute("INSERT INTO users (username, coins) VALUES (?, 0)", (username,))
        user_id = c.lastrowid
        conn.commit()
        request.session["user_id"] = user_id
        return JSONResponse({"ok": True, "username": username})
    except sqlite3.IntegrityError:
        return JSONResponse({"ok": False, "error": "Ese nombre de usuario ya existe"})
    finally:
        conn.close()


@app.post("/login")
async def login(request: Request, username: str = Form(...)):
    username = username.strip().lower()
    conn = get_db()
    user = conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
    conn.close()
    if not user:
        return JSONResponse({"ok": False, "error": "Usuario no encontrado. Registrate primero."})
    request.session["user_id"] = user["id"]
    return JSONResponse({"ok": True, "username": user["username"], "coins": user["coins"]})


@app.get("/logout")
async def logout(request: Request):
    request.session.clear()
    return RedirectResponse("/", status_code=302)


@app.post("/claim")
async def claim_code(request: Request, code: str = Form(...)):
    user = get_current_user(request)
    if not user:
        return JSONResponse({"ok": False, "error": "Tenés que iniciar sesión"})

    code = code.strip().upper()
    conn = get_db()
    row = conn.execute("SELECT * FROM codes WHERE code = ?", (code,)).fetchone()
    if not row:
        conn.close()
        return JSONResponse({"ok": False, "error": "Código inválido"})
    if row["used_by"]:
        conn.close()
        return JSONResponse({"ok": False, "error": "Este código ya fue usado"})

    conn.execute(
        "UPDATE codes SET used_by = ?, used_at = ? WHERE id = ?",
        (user["id"], datetime.utcnow().isoformat(), row["id"])
    )
    conn.execute(
        "UPDATE users SET coins = coins + ? WHERE id = ?",
        (row["coins_amount"], user["id"])
    )
    conn.commit()

    new_coins = conn.execute("SELECT coins FROM users WHERE id = ?", (user["id"],)).fetchone()["coins"]
    conn.close()

    return JSONResponse({
        "ok": True,
        "added": row["coins_amount"],
        "total": new_coins,
        "message": f"¡Recibiste {row['coins_amount']} monedas!"
    })


@app.post("/spin")
async def do_spin(request: Request, multi: int = Form(1)):
    user = get_current_user(request)
    if not user:
        return JSONResponse({"ok": False, "error": "Tenés que iniciar sesión"})

    multi = 1 if multi not in (1, 10) else multi
    cost = SPIN_COST if multi == 1 else SPIN_PACK_10_COST

    conn = get_db()
    current = conn.execute("SELECT coins FROM users WHERE id = ?", (user["id"],)).fetchone()["coins"]
    if current < cost:
        conn.close()
        return JSONResponse({"ok": False, "error": f"No tenés suficientes monedas (necesitás {cost})"})

    conn.execute("UPDATE users SET coins = coins - ? WHERE id = ?", (cost, user["id"]))
    conn.commit()

    results = []
    total_extra_coins = 0
    prizes_won = []

    for _ in range(multi):
        reels = spin_reels()
        comb = ",".join(reels)

        prize = conn.execute(
            "SELECT * FROM prizes WHERE combination = ? AND active = 1", (comb,)
        ).fetchone()

        extra = 0
        prize_name = None
        if prize:
            prize_name = prize["prize_name"]
            # Cereza da monedas extra
            if comb == "cherry,cherry,cherry":
                extra = 20
                total_extra_coins += 20
            else:
                conn.execute(
                    "INSERT INTO wins (user_id, combination, prize_name) VALUES (?, ?, ?)",
                    (user["id"], comb, prize_name)
                )
                prizes_won.append({
                    "combination": reels,
                    "prize": prize_name,
                    "description": prize["description"]
                })

            # Notificación Discord en TODOS los premios
            await send_discord_notification(
                f"🎉 **¡Premio ganado en Lucky Dragons!**\n"
                f"Usuario: **{user['username']}**\n"
                f"Premio: **{prize_name}**\n"
                f"Combinación: {comb}"
                + (f"\n(+{extra} monedas)" if extra else "")
            )

        results.append({
            "reels": reels,
            "prize": prize_name,
            "extra_coins": extra
        })

    if total_extra_coins:
        conn.execute("UPDATE users SET coins = coins + ? WHERE id = ?", (total_extra_coins, user["id"]))

    new_balance = conn.execute("SELECT coins FROM users WHERE id = ?", (user["id"],)).fetchone()["coins"]
    conn.commit()
    conn.close()

    return JSONResponse({
        "ok": True,
        "results": results,
        "cost": cost,
        "extra_coins": total_extra_coins,
        "new_balance": new_balance,
        "prizes_won": prizes_won
    })


@app.get("/api/me")
async def api_me(request: Request):
    user = get_current_user(request)
    if not user:
        return JSONResponse({"ok": False})
    conn = get_db()
    wins = conn.execute(
        "SELECT * FROM wins WHERE user_id = ? ORDER BY created_at DESC LIMIT 20",
        (user["id"],)
    ).fetchall()
    conn.close()
    return JSONResponse({
        "ok": True,
        "username": user["username"],
        "coins": user["coins"],
        "wins": [dict(w) for w in wins]
    })


# ============== ADMIN ==============
@app.get("/admin", response_class=HTMLResponse)
async def admin_page(request: Request):
    if not is_admin(request):
        return templates.TemplateResponse(request, "admin_login.html", {})
    return templates.TemplateResponse(
        request,
        "admin.html",
        {"symbols": SYMBOLS},
    )


@app.post("/admin/login")
async def admin_login(request: Request, password: str = Form(...)):
    stored = get_setting("admin_password", ADMIN_PASSWORD)
    if password == stored:
        request.session["is_admin"] = True
        return RedirectResponse("/admin", status_code=302)
    return templates.TemplateResponse(
        request,
        "admin_login.html",
        {"error": "Contraseña incorrecta"},
    )


@app.get("/admin/logout")
async def admin_logout(request: Request):
    request.session.pop("is_admin", None)
    return RedirectResponse("/admin", status_code=302)


@app.post("/admin/generate")
async def admin_generate(request: Request, coins: int = Form(...), note: str = Form("")):
    require_admin(request)
    if coins < 1 or coins > 10000:
        return JSONResponse({"ok": False, "error": "Cantidad inválida (1-10000)"})

    code = generate_code()
    conn = get_db()
    conn.execute(
        "INSERT INTO codes (code, coins_amount, note) VALUES (?, ?, ?)",
        (code, coins, note.strip() or None)
    )
    conn.commit()
    conn.close()

    # El QR contiene solo el código (el usuario lo pega o escanea)
    qr_b64 = make_qr_base64(code)

    return JSONResponse({
        "ok": True,
        "code": code,
        "coins": coins,
        "qr": qr_b64,
        "note": note
    })


@app.get("/admin/codes")
async def admin_codes(request: Request):
    require_admin(request)
    conn = get_db()
    rows = conn.execute("""
        SELECT c.*, u.username 
        FROM codes c 
        LEFT JOIN users u ON c.used_by = u.id 
        ORDER BY c.created_at DESC 
        LIMIT 100
    """).fetchall()
    conn.close()
    return JSONResponse({"ok": True, "codes": [dict(r) for r in rows]})


@app.get("/admin/users")
async def admin_users(request: Request):
    require_admin(request)
    conn = get_db()
    rows = conn.execute("SELECT * FROM users ORDER BY coins DESC").fetchall()
    conn.close()
    return JSONResponse({"ok": True, "users": [dict(r) for r in rows]})


@app.get("/admin/wins")
async def admin_wins(request: Request):
    require_admin(request)
    conn = get_db()
    rows = conn.execute("""
        SELECT w.*, u.username 
        FROM wins w 
        JOIN users u ON w.user_id = u.id 
        ORDER BY w.created_at DESC 
        LIMIT 100
    """).fetchall()
    conn.close()
    return JSONResponse({"ok": True, "wins": [dict(r) for r in rows]})


@app.post("/admin/mark_delivered")
async def mark_delivered(request: Request, win_id: int = Form(...)):
    require_admin(request)
    conn = get_db()
    conn.execute("UPDATE wins SET delivered = 1 WHERE id = ?", (win_id,))
    conn.commit()
    conn.close()
    return JSONResponse({"ok": True})


@app.get("/admin/prizes")
async def admin_prizes(request: Request):
    require_admin(request)
    conn = get_db()
    rows = conn.execute("SELECT * FROM prizes ORDER BY id").fetchall()
    conn.close()
    return JSONResponse({"ok": True, "prizes": [dict(r) for r in rows]})


@app.post("/admin/prize")
async def admin_save_prize(
    request: Request,
    combination: str = Form(...),
    prize_name: str = Form(...),
    description: str = Form(""),
    active: int = Form(1)
):
    require_admin(request)
    comb = combination.strip().lower()
    conn = get_db()
    conn.execute("""
        INSERT INTO prizes (combination, prize_name, description, active)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(combination) DO UPDATE SET
            prize_name = excluded.prize_name,
            description = excluded.description,
            active = excluded.active
    """, (comb, prize_name.strip(), description.strip(), active))
    conn.commit()
    conn.close()
    return JSONResponse({"ok": True})


@app.post("/admin/settings")
async def admin_settings(
    request: Request,
    discord_webhook: str = Form(""),
    new_password: str = Form("")
):
    require_admin(request)
    if discord_webhook is not None:
        set_setting("discord_webhook", discord_webhook.strip())
    if new_password and len(new_password) >= 4:
        set_setting("admin_password", new_password)
    return JSONResponse({"ok": True, "message": "Configuración guardada"})


@app.get("/admin/settings")
async def get_admin_settings(request: Request):
    require_admin(request)
    return JSONResponse({
        "ok": True,
        "discord_webhook": get_setting("discord_webhook")
    })


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
