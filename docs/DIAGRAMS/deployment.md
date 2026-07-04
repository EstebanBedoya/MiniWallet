# Diagrama de Deployment — MiniWallet (C4 nivel 4)

Topología de despliegue. Cumple la restricción técnica: todo el back-end levanta con `docker compose up`.

## Código Mermaid (C4Deployment)

```mermaid
C4Deployment
  title Deployment - MiniWallet (local / demo)

  Deployment_Node(client, "Dispositivo del usuario", "Navegador / app móvil") {
    Container(ui, "Cliente", "Web/Móvil", "Consume el API (fuera del alcance de build)")
  }

  Deployment_Node(host, "Host Docker", "Docker Engine") {
    Deployment_Node(compose, "Docker Compose", "docker compose up") {
      Deployment_Node(apiNode, "Contenedor api", "Node.js") {
        Container(api, "API MiniWallet", "NestJS", "REST + JWT + lógica transaccional")
      }
      Deployment_Node(dbNode, "Contenedor db", "PostgreSQL 16") {
        ContainerDb(db, "miniwallet_db", "PostgreSQL", "Datos + ledger + auditoría")
      }
      Deployment_Node(vol, "Volumen persistente", "Docker volume") {
        ContainerDb(pgdata, "pgdata", "Volume", "Persistencia de PostgreSQL")
      }
    }
  }

  Rel(ui, api, "Llamadas REST", "HTTPS/JSON")
  Rel(api, db, "SQL sobre red interna de Compose", "TCP 5432")
  Rel(db, pgdata, "Persiste datos")

  UpdateLayoutConfig($c4ShapeInRow="1", $c4BoundaryInRow="1")
```

## Notas de despliegue

- **Un solo comando:** `docker compose up` levanta `api` + `db` en la red interna de Compose. La API espera a que la DB esté healthy (`depends_on` + healthcheck) antes de aceptar tráfico.
- **Persistencia:** un volumen `pgdata` sobrevive al reinicio de contenedores. El estado no se pierde entre `up`/`down`.
- **Configuración:** credenciales de DB y secreto JWT vía variables de entorno (`.env`), nunca hardcodeadas (ver `BUILD_CONVENTIONS.md`).
- **Un solo nodo (alcance actual):** una instancia de API + una de DB. El camino a alta disponibilidad está en `RISKS_AND_SCALABILITY.md`, no se implementa en esta versión.
