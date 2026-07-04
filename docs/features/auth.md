# Feature: Autenticación (Slice 1)

Registro y autenticación de usuarios con JWT. Es la base sobre la que después se cuelgan las transferencias (todo endpoint de dinero exige un usuario autenticado).

Relación con el dominio: crea la entidad **`users`** (`DATA_MODEL.md` §2). **No** crea `accounts` ni saldo semilla — eso pertenece al Slice 2 (Ledger), para no mezclar responsabilidades. Un usuario recién registrado existe pero todavía no tiene cuenta con saldo.

## Comportamiento esperado

### Registro — `POST /auth/register`
- Recibe `email`, `password`, `name`.
- Valida input (email con formato, password con mínimo de fuerza, name no vacío).
- El email es **único case-insensitive** (`ana@x` == `Ana@x`).
- La password se guarda **hasheada** (nunca en claro).
- Devuelve el usuario creado **sin** el hash (201). No devuelve token: registrarse ≠ iniciar sesión.

### Login — `POST /auth/login`
- Recibe `email`, `password`.
- Si las credenciales son válidas → devuelve un **JWT de acceso** (`accessToken`) con expiración corta.
- El payload del JWT lleva el `sub` (user_id) y el `email`. Nada sensible.
- Respuesta genérica ante fallo: no distinguir "email no existe" de "password incorrecta" (evita enumeración de usuarios).

### Rutas protegidas
- Un `JwtAuthGuard` valida el `Bearer <token>`. Sin token válido → `401 UNAUTHORIZED`.
- Se provee un endpoint `GET /auth/me` (devuelve el usuario del token) para verificar el guard end-to-end.

## Estados
La entidad `users` **no tiene máquina de estados** (existe o no existe). No introduce ni modifica estados del dominio transaccional. Este slice no toca dinero → el validador contable **no aplica**.

## Casos límite y seguridad
- Email duplicado (incluyendo distinta capitalización) → `409 EMAIL_ALREADY_REGISTERED`.
- Password débil / email inválido / campos faltantes → `400` (validación), con detalle de qué falló.
- Login con password incorrecta o email inexistente → `401 INVALID_CREDENTIALS` (mensaje genérico).
- Acceso a ruta protegida sin token / token inválido / token expirado → `401 UNAUTHORIZED`.
- El hash de password **nunca** sale en ninguna respuesta (serialización explícita).

## Códigos de error (amplían `DOMAIN_SPEC.md` §6)
| Código | HTTP | Cuándo |
|---|---|---|
| `EMAIL_ALREADY_REGISTERED` | 409 | Registro con un email ya existente (case-insensitive). |
| `INVALID_CREDENTIALS` | 401 | Login fallido (genérico, sin revelar cuál campo). |
| `UNAUTHORIZED` | 401 | Token ausente/inválido/expirado en ruta protegida. |

## Casos de prueba (aterrizan TC-AUTH del TEST_PLAN global)
| ID | Tipo | Caso | Esperado |
|---|---|---|---|
| TC-AUTH-1 | 🟢 | Registro válido | 201, usuario creado, sin hash en la respuesta |
| TC-AUTH-2 | 🟢 | Login correcto | 200 + `accessToken` válido |
| TC-AUTH-3 | 🔴 | Login password incorrecta | 401 `INVALID_CREDENTIALS` |
| TC-AUTH-3b | 🔴 | Login email inexistente | 401 `INVALID_CREDENTIALS` (mismo mensaje que 3) |
| TC-AUTH-4 | 🔴 | Ruta protegida sin token | 401 `UNAUTHORIZED` |
| TC-AUTH-5 | 🔴 | Ruta protegida con token inválido/expirado | 401 `UNAUTHORIZED` |
| TC-AUTH-6 | 🔴 | Registro email duplicado (distinta capitalización) | 409 `EMAIL_ALREADY_REGISTERED` |
| TC-AUTH-7 | 🟡 | Registro con email inválido / password débil | 400 validación |

## Decisiones de este slice (van a DECISIONS.md)
- **Algoritmo de hash de password** (bcrypt/bcryptjs/argon2) → ADR.
- **Estrategia JWT** (passport-jwt vs. verificación manual) → ADR si no es trivial.
