# Prueba Técnica — MiniWallet

**Caso:** MiniWallet - Servicio de transferencias entre usuarios

## 1. Contexto

Esta prueba técnica tiene como propósito evaluar la capacidad de analizar, diseñar y desarrollar una solución basada en un requerimiento relacionado con sistemas transaccionales e integraciones financieras. El proceso incluye una fase de análisis del requerimiento, el desarrollo de una solución y, finalmente, una sesión de retroalimentación sobre el ejercicio. La prueba simula, a escala reducida, algunos de los retos de diseño y construcción de un sistema de pagos real. Durante la evaluación se tendrán en cuenta el nivel de detalle del análisis, las decisiones técnicas tomadas y los complementos que aporten valor al proceso.

## 2. Caso: MiniWallet

MiniWallet es un servicio que permite a usuarios registrados transferir saldo entre sí y consultar su historial de movimientos.

### 2.1 Análisis y diseño

Antes de escribir una sola línea de código, se busca entender el razonamiento del candidato. Esta sección evalúa la capacidad de descomponer un problema, identificar riesgos, tomar decisiones de diseño y comunicarlas con claridad.

No hay una respuesta única correcta. Lo importante es el razonamiento y la solidez de las justificaciones, no que se llegue a una arquitectura específica. Validar primero bien el alcance completo para el análisis.

- Desarrollar un diagrama de contexto.
- Desarrollar un diagrama de contenedores internos del sistema (API, base de datos, etc.), donde cada contenedor debe tener nombre, tecnología elegida y responsabilidad principal, y cada flecha entre contenedores debe indicar el protocolo y el propósito de la interacción.

### 2.2 Requisitos funcionales

1. Registro y autenticación de usuarios mediante JWT sobre una aplicación móvil o web.
2. Transferencia de saldo entre dos usuarios. La operación debe ser atómica: el sistema no puede, bajo ninguna circunstancia, perder o duplicar dinero.
3. Consulta del historial de transacciones de un usuario, con paginación.
4. Endpoint administrativo sobre el sistema que traiga "transacciones sospechosas" (definir qué serían transacciones sospechosas).

### 2.3 Requisitos no funcionales

- La solución debe poder desplegarse con infraestructura contenerizada.
- El sistema debe soportar múltiples usuarios concurrentes realizando transferencias simultáneas.
- Las operaciones financieras deben ser trazables para fines de auditoría.
- El sistema debe manejar errores de forma explícita y predecible.
- La solución debe poder desplegarse con infraestructura contenerizada.

**Presta especial atención al siguiente requisito. Contiene una tensión que deberás resolver explícitamente (no es un error de redacción):**

> "Las transferencias deben reflejarse inmediatamente en el saldo del usuario para una buena experiencia de usuario. Sin embargo, por políticas de cumplimiento, toda transacción mayor a $1,000 USD debe pasar por un proceso de validación antes de confirmarse."

Se evaluará cómo se modela este escenario: estados de una transacción, saldo disponible vs. saldo pendiente, y cómo se comunica esta decisión en la documentación.

## 3. Restricciones técnicas

- El sistema debe ejecutarse completo con un solo comando: ejemplo `docker compose up`. Para el proceso de back-end.
- Stack tecnológico libre, pero debe justificarse en la documentación.
- Debe incluir al menos un test de integración funcional sobre el flujo de transferencia.
- Debe incluir manejo de errores con códigos de respuesta semánticos (no solo códigos HTTP).
- Toda operación financiera debe quedar registrada de forma trazable.

## 4. Entregables

| Entregable | Descripción |
|---|---|
| Documento de análisis | Los dos diagramas de diseño. La herramienta es libre (draw.io, etc.) |
| Código fuente | Repositorio (links) con el código completo y funcional. |
| docker-compose.yml | Que permita levantar todo el sistema con un solo comando. |
| README.md | Instrucciones de ejecución, sección "Limitaciones conocidas" y sección "Cómo escalaría esto". |
| DECISIONS.md | Mínimo 2 decisiones de implementación documentadas con su justificación (formato libre, estilo ADR es bienvenido). Breve nota: qué se usó de IA, en qué parte del proceso, y cómo se validó que la salida era correcta. |

## 5. Sobre el uso de herramientas de IA

El uso de asistentes de IA (Claude, Copilot, ChatGPT u otros) está permitido y no será penalizado por sí mismo. Lo que se evalúa es el criterio: si se validó lo que la IA generó, si se entiende cada línea del código entregado, y si se puede explicar y defender cada decisión en la sesión de retroalimentación.

Aceptar código generado por IA sin revisión crítica, especialmente en lógica transaccional o de seguridad, será considerado una señal negativa relevante.

## 6. Criterios de evaluación

| Criterio | Peso | Qué se observa |
|---|---|---|
| Diseño | 25% | Decisiones justificadas, tecnología explícita, riesgos identificados |
| Calidad del código | 25% | Legibilidad, manejo de errores, seguridad básica, tests |
| Documentación | 20% | Que documente el "por qué", no solo el "qué" |
| Uso crítico de IA | 15% | Transparencia y validación de lo generado |
| Code review en vivo | 15% | Profundidad del análisis, vocabulario técnico preciso |

**Duración:** 3 días, una vez entregado el requerimiento se tienen tres días para su desarrollo y entrega.
