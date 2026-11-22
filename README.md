# SETMORE project files

The runnable apps are in the nested `event-weather-booking/` directory. The workspace root now has convenience scripts, so you can start the customer site from this folder with `npm run dev`.

- Customer React app: `event-weather-booking/apps/customer-web/`
- Home page and customer routes: `event-weather-booking/apps/customer-web/src/App.tsx`
- Authentication context: `event-weather-booking/apps/customer-web/src/auth/`
- API client and frontend services: `event-weather-booking/apps/customer-web/src/services/`
- Express backend: `event-weather-booking/apps/api/src/index.ts`
- PostgreSQL / Prisma models: `event-weather-booking/apps/api/prisma/schema.prisma`
- API setup and environment variables: `event-weather-booking/apps/api/README.md` and `event-weather-booking/apps/api/.env.example`

Run `npm run dev` here to start the customer site. Run `npm run dev:api` here to start the API when needed. Local demo authentication works without PostgreSQL; the API demo role and local account instructions are in `event-weather-booking/apps/api/README.md`.
