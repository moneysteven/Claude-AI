# Eclipse Ops Hub — Operations Portal (Proposal Wireframe)

An interactive concept portal for Eclipse Enterprise, built for David
(Operations Manager). It has two views:

- **Operator Onboarding**: the pipeline of new operator applications, with BGLC
  license status and a badge for each pipeline stage.
- **Live Ticket Dispatch**: terminal breakdown tickets with priority, status,
  elapsed time and dispatch actions.

All records are mock data. The buttons show a demo "action simulated" message.

**Stack:** Next.js 14 (App Router) + Tailwind CSS + lucide-react icons.

## Run it locally

```bash
cd eclipse-ops-portal
npm install
npm run dev        # http://localhost:3000
```

## Deploy (when ready)

The easiest option is **Vercel**. Import the GitHub repo and set
**Root Directory** to `eclipse-ops-portal`. It finds Next.js automatically,
so you don't need to change any other settings.

Any host that runs Node also works:

```bash
npm install
npm run build
npm start          # serves on port 3000 (set PORT to change)
```

The page lives in `app/page.tsx`.
