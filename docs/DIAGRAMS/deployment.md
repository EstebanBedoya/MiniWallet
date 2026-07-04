# Diagrama de Deployment — MiniWallet (C4 nivel 4)

Topología de despliegue. Cumple la restricción técnica: todo el back-end levanta con `docker compose up`.

## Diagrama (Mermaid — Deployment)

```mermaid
flowchart TB
    ui["💻 Cliente<br/><i>navegador / app móvil<br/>(fuera del alcance de build)</i>"]

    subgraph host["🖥️ Host Docker (Docker Engine)"]
        subgraph compose["🐳 docker compose up"]
            api["📦 Contenedor <b>api</b><br/>NestJS (Node 22)<br/><i>REST + JWT + lógica transaccional</i>"]
            db["📦 Contenedor <b>db</b><br/>PostgreSQL 16<br/><i>datos + ledger + auditoría</i>"]
            pgdata[("💾 Volumen <b>pgdata</b><br/><i>persistencia de PostgreSQL</i>")]
        end
    end

    ui -- "Llamadas REST [HTTPS/JSON]" --> api
    api -- "SQL sobre la red interna de Compose [TCP 5432]" --> db
    db -- "persiste datos" --> pgdata

    classDef svc fill:#1f6feb,stroke:#0b3d91,color:#fff;
    classDef store fill:#2ea043,stroke:#125c26,color:#fff;
    classDef ext fill:#e8edf5,stroke:#556,color:#111;
    class api svc;
    class db,pgdata store;
    class ui ext;
```

## Notas de despliegue

- **Un solo comando:** `docker compose up` levanta `api` + `db` en la red interna de Compose. La API espera a que la DB esté healthy (`depends_on` + healthcheck) antes de aceptar tráfico.
- **Persistencia:** un volumen `pgdata` sobrevive al reinicio de contenedores. El estado no se pierde entre `up`/`down`.
- **Configuración:** credenciales de DB y secreto JWT vía variables de entorno (`.env`), nunca hardcodeadas (ver `BUILD_CONVENTIONS.md`).
- **Un solo nodo (alcance actual):** una instancia de API + una de DB. El camino a alta disponibilidad está en `RISKS_AND_SCALABILITY.md`, no se implementa en esta versión.
