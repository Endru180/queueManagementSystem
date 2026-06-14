# LQMS - Local Queue Management System

LQMS is a web-based queue management application for local public services (Puskesmas, Samsat, Banks, and Local Government offices). Clients can log in using their **NIK**, select a location based on province/city/subdistrict, find the nearest service location, take a queue number online, and monitor their queue status in real time. Officers have a dedicated dashboard to serve queues, add walk-in registrations, open/close registration, and monitor estimated service time (calculated automatically using a **Weighted Moving Average (WMA)** algorithm). Queue status notifications are sent to clients via WhatsApp using the **Fonnte API**.

## Repository Structure

- `src/routes/` - SvelteKit pages:
  - `+page.svelte` - The user's main home page (*location selection & client's active queues*)
  - `login/` - Login page both for clients (*clients using NIK*) and officers (*government's registered email*)
  - `services/` - List of service locations per category
  - `services/[id]/` - Location detail & queue registration form
  - `monitor/` - Real-time queue status monitoring for clients
  - `officer/desk/` - Officer dashboard (serve, skip, finish, walk-in, etc.)
- `src/lib/supabase.js` - Supabase connection (database & real-time)
- `src/app.html`, `src/app.css` - HTML shell & global styling (Pico CSS)
- `static/` - Static assets
- `server.js` - A separate Express server acting as a **proxy** for sending WhatsApp notifications to the Fonnte API
- `seed.js` - Script to **seed** initial data (provinces, cities, subdistricts, service locations) into Supabase
- `svelte.config.js`, `vite.config.js`, `eslint.config.js`, etc. - Project configuration files

## How to Run

1. Install dependencies:

   ```sh
   npm install
   ```

2. Create a `.env` file in the project root with the following Supabase credentials (see `src/lib/supabase.js`):

   ```
   PUBLIC_SUPABASE_URL=<your-supabase-project-url>
   PUBLIC_SUPABASE_ANON_KEY=<your-supabase-anon-key>
   ```

3. Start the development server:

   ```sh
   npm run dev -- --open
   ```

   This will automatically open the application in your browser.

> **Note:** `server.js` (the WhatsApp notification proxy via Fonnte) **does not need to be running** to try out the application. Every call to this server is wrapped in a `try/catch` block, so if the server is not active, the application will continue to function normally without WhatsApp notifications. `server.js` is only relevant if you want to test **the end-to-end WhatsApp integration**, which requires a Fonnte token connected to an **active WhatsApp number**.

For more detailed information, check out this Notion link: https://app.notion.com/p/Software-Engineering-Problem-361f0f860c4a80c7b08bf6a63c4e4f5e?source=copy_link
