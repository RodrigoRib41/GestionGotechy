# Gotechy Consulting - Internal Hours Platform

Aplicación web moderna para reemplazar el Excel manual de registro de horas de Gotechy Consulting.

## Stack

- Next.js 15+, App Router y TypeScript
- TailwindCSS + componentes estilo shadcn/ui
- Auth.js / NextAuth con Google OAuth
- Prisma ORM + PostgreSQL, preparado para Supabase
- Server Actions, Zod, React Hook Form
- TanStack Table, Recharts, Framer Motion, Lucide Icons
- Exportaciones CSV, Excel y PDF
- Netlify como deploy inicial
- Cloudinary configurado para futuras cargas

## Módulos incluidos

- Dashboard ejecutivo con KPIs, rankings, evolución semanal y distribución por categoría
- Registro rápido de horas con búsqueda de proyecto, favoritos, templates, métricas personales, observaciones y atajo `Ctrl/Cmd + Enter`
- Gestión inicial de proyectos
- Gestión inicial de clientes
- Reporte Maestro de Horas con filtros avanzados y exportación Excel por colaborador
- Dashboards analíticos
- Vista de colaboradores con configuración laboral
- Administración de usuarios habilitados, roles múltiples, categorías, tipos de tarea y auditoría
- Login Google con whitelist de emails y pantalla de acceso denegado

## Roles y reglas

La app implementa RBAC con roles múltiples por usuario:

- `COLLABORATOR`: carga y edita solo sus horas, con límite de 30 días hacia atrás.
- `ADMINISTRATOR`: gestiona clientes y proyectos.
- `REPORTER`: accede a dashboard global, analítica, KPIs y exportaciones.
- `SUPERADMIN`: acceso total, usuarios, permisos, configuración y auditoría.

Reglas relevantes:

- El sistema marca el cumplimiento diario contra una regla mínima del 70%.
- Un cliente solo se elimina si no tiene horas y no tiene proyectos activos.
- Un proyecto solo se elimina si nunca tuvo horas registradas.
- El superadmin configura horas laborales diarias/semanales, modalidad y días laborales por colaborador.

## Setup local

```bash
npm install
cp .env.example .env
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
npm run dev
```

Crear en Google Cloud un OAuth Client de tipo Web y configurar:

```env
AUTH_GOOGLE_ID="..."
AUTH_GOOGLE_SECRET="..."
AUTH_SECRET="..."
NEXTAUTH_URL="http://localhost:3000"
SUPERADMIN_EMAIL="rodrigorib41@gmail.com"
```

El email definido en `SUPERADMIN_EMAIL` queda habilitado como superadmin aun antes de existir en la base.

## Base de datos

El modelo Prisma incluye:

- `User`, `Account`, `Session`, `VerificationToken`
- `AllowedEmail`
- `Client`
- `Project`
- `ProjectMember`
- `Category`
- `ActivityType`
- `TimeEntry`
- `UserPermission`
- `AuditLog`

La migración inicial activa RLS en todas las tablas públicas para un escenario Supabase. La app opera vía servidor Next.js + Prisma, por lo que las reglas de negocio viven en Server Actions y permisos de aplicación.

## Deploy en Netlify

1. Crear una base PostgreSQL en Supabase.
2. Configurar `DATABASE_URL` y `DIRECT_URL` con el connection string de Supabase.
3. Crear el OAuth Client de Google y cargar la URL de producción:

```text
https://tu-dominio.netlify.app/api/auth/callback/google
```

4. En Netlify, configurar variables:

```env
DATABASE_URL
DIRECT_URL
AUTH_SECRET
AUTH_GOOGLE_ID
AUTH_GOOGLE_SECRET
AUTH_TRUST_HOST=true
NEXTAUTH_URL=https://tu-dominio.netlify.app
SUPERADMIN_EMAIL
CLOUDINARY_CLOUD_NAME
CLOUDINARY_API_KEY
CLOUDINARY_API_SECRET
```

5. Ejecutar migraciones antes del primer deploy productivo:

```bash
npm run prisma:migrate
npm run prisma:seed
```

Netlify usa `@netlify/plugin-nextjs` vía `netlify.toml`.

## Arquitectura

```text
src/app
  (auth)        pantallas públicas de login y acceso denegado
  (app)         rutas protegidas por Auth.js
  api/auth      handler Auth.js
src/components
  admin         panel administrativo
  analytics     dashboards visuales
  dashboard     dashboard principal
  data          tablas TanStack
  navigation    shell, sidebar y topbar
  reports       reportes/exportaciones
  resources     clientes y proyectos
  time          registro rápido de horas
  ui            componentes shadcn-style
src/lib
  actions       Server Actions
  data          consultas y fallback demo
  validators    esquemas Zod
  permissions   roles y guardas
prisma
  schema.prisma
  migrations
  seed.ts
```

## Próximas ampliaciones recomendadas

- Edición y archivado de clientes/proyectos desde acciones dedicadas
- Asignación visual de colaboradores a proyectos
- Políticas RLS específicas si se expone Supabase Data API al frontend
- Importador del Excel histórico
- Virtualización de tablas para miles de registros
- Notificaciones de usuarios sin carga diaria
- Workflow de aprobación/rechazo de horas
