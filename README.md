# Gotechy Consulting - Internal Hours Platform

Aplicacion web moderna para reemplazar el Excel manual de registro de horas de Gotechy Consulting.

## Stack

- Next.js 15+, App Router y TypeScript
- TailwindCSS + componentes estilo shadcn/ui
- Auth.js / NextAuth con Google OAuth
- Prisma ORM + PostgreSQL, preparado para Supabase
- Server Actions, Zod y React Hook Form
- TanStack Table, Recharts y Lucide Icons
- Exportaciones CSV, Excel y PDF
- Vercel/Netlify como deploy serverless

## Modulos incluidos

- Dashboard ejecutivo con KPIs, rankings, evolucion semanal y distribucion por categoria.
- Dashboard unificado con dashboards fijados por usuario y activaciones temporales diarias.
- Registro rapido de horas con favoritos personales, historial agrupado y metricas de disponibilidad.
- Seguimiento operativo con vistas Kanban/lista/timeline, estados administrables e historial.
- Objetivos de cumplimiento horario por colaborador, periodo, cliente, proyecto y categoria.
- Historial persistente de objetivos con limpieza segura por PIN para Superadmin.
- Gestion de proyectos, clientes, tipos de proyecto y estimaciones.
- Reporte Maestro de Horas con filtros avanzados, exportacion y borrado seguro para superadmin.
- Vista de colaboradores con configuracion laboral.
- Administracion de usuarios habilitados, roles, categorias, tipos de tarea y auditoria.
- Branding Gotechy integrado con logo responsive, favicon y soporte light/dark.
- Login Google con whitelist de emails y pantalla de acceso denegado.

## Roles y reglas

La app implementa RBAC con estos roles:

- `COLABORADOR`: accede solo a carga de horas y edicion permitida de sus registros.
- `ADMINISTRADOR`: acceso funcional completo a dashboard global, reportes, clientes, proyectos y seguimiento; sin colaboradores, roles, configuraciones criticas ni borrado historico.
- `SUPERADMIN`: acceso total, usuarios, roles, configuracion, auditoria y borrado seguro del historial.

Reglas relevantes:

- El usuario principal de la app es el definido en `SUPERADMIN_EMAIL`.
- El borrado del historial de horas requiere rol `SUPERADMIN`, confirmacion doble y `REPORT_DELETE_PIN` del servidor.
- El borrado del historial de objetivos requiere rol `SUPERADMIN`, confirmacion doble y `GOAL_HISTORY_DELETE_PIN` o `REPORT_DELETE_PIN`.
- Al eliminar un mail habilitado, el usuario se archiva logicamente, se revocan sesiones/cuentas y se preservan datos historicos.
- Un cliente solo se elimina si no tiene horas y no tiene proyectos activos.
- Un proyecto solo se elimina si nunca tuvo horas registradas.
- Un proyecto inactivo queda fuera de selects operativos pero conserva historico.
- Los dashboards temporales se limpian localmente al cambiar el dia; los fijados se guardan en base por usuario.

## Setup local

```bash
npm install
cp .env.example .env
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
npm run dev
```

Variables base:

```env
AUTH_GOOGLE_ID="..."
AUTH_GOOGLE_SECRET="..."
AUTH_SECRET="..."
NEXTAUTH_URL="http://localhost:3000"
SUPERADMIN_EMAIL="rodrigorib41@gmail.com"
REPORT_DELETE_PIN="123456"
GOAL_HISTORY_DELETE_PIN="123456"
```

El email definido en `SUPERADMIN_EMAIL` queda habilitado como superadmin aun antes de existir en la base.

## Base de datos

El modelo Prisma incluye:

- `User`, `Account`, `Session`, `VerificationToken`
- `AllowedEmail`, `WorkSchedule`
- `Client`, `Project`, `ProjectType`, `ProjectMember`
- `Category`
- `TimeEntry`, `TimeEntryFavorite`
- `UserDashboardPreference`
- `TrackingTask`, `TrackingTaskStatus`, `TrackingTaskHistory`, `TrackingTaskAttachment`
- `GoalObjective`, `GoalObjectiveExclusion`, `GoalMetric`, `GoalCompliance`
- `GoalComplianceHistory`
- `AuditLog`

Las nuevas tablas publicas tienen RLS habilitado para Supabase. La app opera via servidor Next.js + Prisma, por lo que las reglas de negocio viven en Server Actions, middleware y helpers de permisos.

## Deploy en Vercel/Netlify

1. Crear una base PostgreSQL en Supabase.
2. Configurar `DATABASE_URL` y `DIRECT_URL` con el connection string de Supabase.
3. Crear el OAuth Client de Google y cargar la URL de produccion:

```text
https://tu-dominio.vercel.app/api/auth/callback/google
```

4. Configurar variables:

```env
DATABASE_URL
DIRECT_URL
AUTH_SECRET
AUTH_GOOGLE_ID
AUTH_GOOGLE_SECRET
AUTH_TRUST_HOST=true
NEXTAUTH_URL=https://tu-dominio.vercel.app
SUPERADMIN_EMAIL
REPORT_DELETE_PIN
```

5. Ejecutar migraciones y seed productivo antes del primer deploy real:

```bash
npm run prisma:migrate
npm run seed-production
```

## Operaciones productivas

Seed minimo sin datos demo:

```bash
npm run seed-production
```

Limpieza segura de datos operativos antes de carga real:

```bash
CONFIRM_RESET_DB="RESET_GOTECHY_DB" npm run reset-db
```

En PowerShell:

```powershell
$env:CONFIRM_RESET_DB="RESET_GOTECHY_DB"; npm run reset-db
```

`reset-db` mantiene estructura, migraciones, configuracion base y el superadmin definido por `SUPERADMIN_EMAIL`; elimina clientes, proyectos, horas, seguimiento, objetivos calculados, favoritos y preferencias operativas.

## Arquitectura

```text
src/app
  (auth)        pantallas publicas de login y acceso denegado
  (app)         rutas protegidas por Auth.js y middleware RBAC
  api/auth      handler Auth.js
src/components
  admin         panel administrativo
  dashboard     dashboard principal
  data          tablas TanStack
  navigation    shell, sidebar y topbar
  objectives    objetivos y cumplimiento
  reports       reportes/exportaciones
  resources     clientes y proyectos
  time          registro rapido de horas
  tracking      seguimiento operativo
  ui            componentes shadcn-style
src/lib
  actions       Server Actions
  data          consultas cacheadas y fallbacks
  validators    esquemas Zod
  permissions   roles y guardas
prisma
  schema.prisma
  migrations
  seed.ts
scripts
  reset-db.mjs
  seed-production.mjs
```
